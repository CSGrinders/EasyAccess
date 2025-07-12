import dotenv from 'dotenv';

import { CloudStorage, AuthTokens, generateCodes } from './cloudStorage';
import { saveCloudAccountLocaStorage } from './cloudManager';
import { OAuth2Client } from 'google-auth-library';
import { drive_v3, google } from 'googleapis';
import { FileContent, FileSystemItem } from "../../types/fileSystem";
import { CLOUD_HOME, CloudType } from '../../types/cloudType';
import { shell } from 'electron';
import { v4 as uuidv4 } from 'uuid';
const { Readable } = require('stream');
import * as http from 'http';
import { URL } from 'url';
import { minimatch } from 'minimatch';
import { promises as fs } from 'fs';
import path from 'path';
import mime from "mime-types";
import { progressCallbackData } from '../../types/transfer';

dotenv.config();

//https://cloud.google.com/nodejs/docs/reference/google-auth-library/latest

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_SCOPE = [
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/userinfo.email',
];

/**
 * Temporary redirect URL for OAuth2
 */
const PORT = 53684; // Default port for the local server
const SUCCESS_REDIRECT_URL = `http://localhost:${PORT}`;

export class GoogleDriveStorage implements CloudStorage {
  accountId?: string | undefined;
  AuthToken?: AuthTokens | null | undefined;
  private authCancelled = false;
  private currentOAuthInstance: any = null; 
  private currentAuthUrl: string | null = null; // Store the current auth URL to prevent multiple instances
  private oauth2Client: OAuth2Client | null = null;
  private currentAuthServer: http.Server | null = null;

  async connect(): Promise<void | any> {
    try {
        this.authCancelled = false; 
        
        this.AuthToken = null;
        this.accountId = undefined;
        this.currentOAuthInstance = null;
        this.currentAuthUrl = null; // Reset the current auth URL
        
        const authTokensAndEmail = await this.authenticateGoogle();
        
        if (this.authCancelled) {
            throw new Error('Authentication cancelled');
        }

        if (!authTokensAndEmail || !authTokensAndEmail.token || !authTokensAndEmail.email) {
            throw new Error('Authentication failed: No tokens or email received');
        }

        console.log('Google Drive authentication successful');
        console.log('Auth Tokens:', authTokensAndEmail.token);
        console.log('Email:', authTokensAndEmail.email);

        if (authTokensAndEmail) {
            this.AuthToken = authTokensAndEmail.token;
            this.accountId = authTokensAndEmail.email;
            console.log('Google Drive account connected:', this.accountId);
        } else {
            throw new Error('Authentication failed');
        }
    } catch (error: any) {
        console.error('Google Drive connection error:', error);
        
        this.AuthToken = null;
        this.accountId = undefined;
        this.currentOAuthInstance = null;
        
        throw error; 
    }
  }

  cancelAuthentication(): void {
    console.log('Cancelling Google Drive authentication');
    this.authCancelled = true;

    if (this.currentAuthServer) {
      this.currentAuthServer.close();
    }
    
    if (this.currentOAuthInstance) {
      try {
        if (this.currentOAuthInstance.authWindow && !this.currentOAuthInstance.authWindow.isDestroyed()) {
          this.currentOAuthInstance.authWindow.close();
        }
      } catch (error) {
        console.log('Error during OAuth instance cleanup:', error);
      }
      this.currentOAuthInstance = null;
    }
  }


  // convert the directory path to a folder ID that is used in the Google Drive API
  private async getFolderId(dir: string): Promise<string> {
    await this.refreshOAuthClientIfNeeded();
    if (!this.oauth2Client) {
      throw new Error('OAuth2 client is not initialized');
    }
    const drive = google.drive({ version: 'v3', auth: this.oauth2Client });

    const dirs = dir.split('/');

    let currentFolderId = 'root';

    for (const folderName of dirs) {
      if (folderName === '') continue; // Skip empty parts (e.g., leading slash)
      
      const res = await drive.files.list({
        q: `'${currentFolderId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id)',
      });

      const files = res.data.files;
      if (files && files.length > 0) {
        currentFolderId = files[0].id || '';
      } else {
        throw new Error(`Folder "${folderName}" not found`);
      }
    }
    return currentFolderId;
  }

  // convert the directory path to a folder ID that is used in the Google Drive API
  private async getFileId(filePath: string): Promise<string> {
    await this.refreshOAuthClientIfNeeded();
    if (!this.oauth2Client) {
      throw new Error('OAuth2 client is not initialized');
    }
    const drive = google.drive({ version: 'v3', auth: this.oauth2Client });

    const dirs = filePath.split('/');

    let currentFolderId = 'root';

    for (const folderName of dirs) {
      if (folderName === '') continue; // Skip empty parts (e.g., leading slash)

      if (folderName === dirs[dirs.length - 1]) {
        console.log('Last part of the path:', folderName);
        // If it's the last part, we want to get the file ID
        const res = await drive.files.list({
          q: `'${currentFolderId}' in parents and name='${folderName}' and trashed = false`,
          fields: 'files(id)',
        });

        const files = res.data.files;
        if (files && files.length > 0) {
          return files[0].id || '';
        } else {
          throw new Error(`File "${folderName}" not found`);
        }
      }
      
      const res = await drive.files.list({
        q: `'${currentFolderId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id)',
      });

      const files = res.data.files;
      if (files && files.length > 0) {
        currentFolderId = files[0].id || '';
      } else {
        throw new Error(`Folder "${folderName}" not found`);
      }
    }
    throw new Error(`File "${filePath}" not found`);
  }

  async readDir(dir: string): Promise<FileSystemItem[]> {

    const folderId = await this.getFolderId(dir);

    const allFiles: FileSystemItem[] = [];
    try {
      await this.refreshOAuthClientIfNeeded();
      if (!this.oauth2Client) {
        throw new Error('OAuth2 client is not initialized');
      }
      const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
      let nextPageToken: string | undefined = undefined;
  
      do {
        const res: { data: drive_v3.Schema$FileList } = await drive.files.list({
          q: `'${folderId}' in parents and trashed = false`, // Use folder ID
          pageSize: 1000,
          fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size)',
          pageToken: nextPageToken,
        });
  
        const files = res.data.files || [];
        const mappedFiles: FileSystemItem[] = files.map(file => {
          const filePath = dir === '/' ? `/${file.name}` : `${dir}/${file.name}`;
          return {
            id: uuidv4(), // Generate unique UUID for each item
            name: file.name ?? '',
            isDirectory: file.mimeType === 'application/vnd.google-apps.folder',
            path: CLOUD_HOME + filePath,
            size: file.size ? Number(file.size) : undefined,
            modifiedTime: file.modifiedTime ? new Date(file.modifiedTime).getTime() : undefined,
          }
        });
  
        allFiles.push(...mappedFiles);
        nextPageToken = res.data.nextPageToken || undefined;
      } while (nextPageToken);
      
      return allFiles;
    } catch (error) {
      console.error('Google Drive API error:', error);
      return [];
    }
  }

  async readFile(filePath: string): Promise<string> {
    await this.refreshOAuthClientIfNeeded();
    if (!this.oauth2Client) {
      throw new Error('OAuth2 client is not initialized');
    }
    
    try {
      const fileContent = await this.getFile(filePath);
      if (fileContent.content) {
        return fileContent.content.toString('utf-8');
      } else {
        throw new Error('File content is empty or not available');
      }
    } catch (error) {
      console.error('Error reading file from Google Drive:', error);
      throw error;
    }
  }

  getAccountId(): string {
    return this.accountId || '';
  }
  getAuthToken(): AuthTokens | null {
    return this.AuthToken || null;
  }

  // local server to handle the OAuth redirect
  // This server listens for the redirect from Google after the user authorizes the app
  private async startAuthServer(): Promise<string> {
    return new Promise(async (resolve, reject) => {
      const server = http.createServer((req, res) => {
        const reqUrl = new URL(req.url || '', SUCCESS_REDIRECT_URL);
        const code = reqUrl.searchParams.get('code');

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('Authorization successful! You can close this window.');
          server.close();
          resolve(code);
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('Authorization failed. No code received.');
          server.close();
          reject(new Error('No authorization code found'));
        }
      });

      this.currentAuthServer = server as any;

      // redirect URI for OAuth2...
      server.listen(PORT, () => {
        console.log(`Listening for auth redirect on http://localhost:${PORT}`);
      });

      // Handle server errors
      server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          console.error('Port is already in use. Trying alternative port...');
          // TODO
          // Implement logic to try a different port
          server.close();
        } else {
          console.error('Auth server error:', error);
          server.close();
          reject(new Error(`Server error: ${error.message}`));
        }
      });

      // Add timeout to prevent hanging
      setTimeout(() => {
        server.close();
        reject(new Error('Authentication timeout - no response received'));
      }, 300000); // 5 minute timeout
    });
  }

  // Exchanges the authorization code for access and refresh tokens
  private async exchangeCodeForToken(code: string, codeVerifier: string) {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code,
        client_id: GOOGLE_CLIENT_ID || '',
        redirect_uri: SUCCESS_REDIRECT_URL,
        client_secret: GOOGLE_CLIENT_SECRET || '',
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
    });

    const tokenData = await response.json();
    console.log('Tokens:', tokenData);

    return tokenData; // access_token, refresh_token, expires_in, id_token
  }

  private async authenticateGoogle(): Promise<{ token: AuthTokens, email: string } | null> {
      if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
          throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables");
      }
      
      try {
          // Check if authentication was cancelled before starting
          if (this.authCancelled) {
              throw new Error('Authentication cancelled');
          }
          
          // Add a small delay to ensure any previous auth window is properly closed
          await new Promise(resolve => setTimeout(resolve, 100));
          
          const { codeVerifier, codeChallenge } = await generateCodes();

          this.currentAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${SUCCESS_REDIRECT_URL}&response_type=code&scope=${GOOGLE_SCOPE.join(' ')}&code_challenge=${codeChallenge}&code_challenge_method=S256&access_type=offline&prompt=consent`;

          shell.openExternal(this.currentAuthUrl);

          const code = await this.startAuthServer(); // Get code from redirect
          console.log('Authorization code received:', code);
          const tokens = await this.exchangeCodeForToken(code, codeVerifier); // Exchange for tokens
          console.log('Access token:', tokens.access_token);

          // TODO: Implement actual token and email retrieval after OAuth flow
          if (!tokens.access_token || !tokens.refresh_token || !tokens.expires_in) {
              throw new Error('Invalid tokens received from Google OAuth');
          }
          const authTokens: AuthTokens = {
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token,
              expiry_date: Date.now() + (tokens.expires_in * 1000) // Convert seconds to milliseconds
          };

          // Initialize OAuth2 client and set credentials
          this.oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SUCCESS_REDIRECT_URL); 
          this.oauth2Client.setCredentials({
              access_token: authTokens.access_token,
              refresh_token: authTokens.refresh_token,
              expiry_date: authTokens.expiry_date,
          });

          // Use the OAuth2 client to get user info
          const userinfo = await google.oauth2({version: 'v2', auth: this.oauth2Client }).userinfo.get();
          const email = userinfo.data.email;
          if (!email) {
              console.error('Failed to retrieve email from Google UserInfo API');
              throw new Error('Failed to retrieve user information');
          }

          return { token: authTokens, email: email }; // Return both token and email
      } catch (error: any) {
          console.error('Google authentication error:', error);
          this.currentOAuthInstance = null;
          if (this.authCancelled) {
              throw new Error('Authentication cancelled');
          }
        
          if (error.message?.includes('cancelled') || error.message?.includes('aborted') || error.message?.includes('user_cancelled')) {
              throw new Error('Authentication cancelled');
          } else if (error.message?.includes('network') || error.message?.includes('timeout') || error.message?.includes('ENOTFOUND')) {
              throw new Error('Network connection failed');
          } else if (error.message?.includes('Invalid') || error.message?.includes('token') || error.message?.includes('unauthorized')) {
              throw new Error('Authentication failed');
          } else if (error.message?.includes('window') || error.message?.includes('closed')) {
              throw new Error('Authentication cancelled');
          } else {
              console.error('Unexpected error details:', {
                  message: error.message,
                  code: error.code,
                  name: error.name,
                  toString: error.toString()
              });
              throw new Error('Authentication failed. Please try again.');
          }
      }
  }

  // Refreshes the OAuth client if needed
  private async refreshOAuthClientIfNeeded(): Promise<void> {
    if (!this.AuthToken || !this.AuthToken.access_token || !this.AuthToken.refresh_token || !this.AuthToken.expiry_date) {
      throw new Error('AuthToken is null or undefined');
    }

    if (!this.oauth2Client) {
      console.log('Initializing OAuth2 client with stored AuthToken');
      this.oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SUCCESS_REDIRECT_URL);
      this.oauth2Client.setCredentials({
        access_token: this.AuthToken.access_token,
        refresh_token: this.AuthToken.refresh_token,
        expiry_date: this.AuthToken.expiry_date,
      });
      if (!this.oauth2Client.credentials.access_token || !this.oauth2Client.credentials.refresh_token || !this.oauth2Client.credentials.expiry_date) {
        throw new Error('OAuth2 client credentials are not set properly');
      }
      saveCloudAccountLocaStorage(CloudType.GoogleDrive, this.accountId || '', {
        access_token: this.oauth2Client.credentials.access_token,
        refresh_token: this.oauth2Client.credentials.refresh_token,
        expiry_date: this.oauth2Client.credentials.expiry_date,
      });
    }

    const now = Date.now();
    const expiryDate = this.oauth2Client.credentials.expiry_date;
    if (!expiryDate) {
      throw new Error('OAuth2 client expiry_date is null or undefined');
    }

    // 5 minutes to expiration
    const isNearExpiration = expiryDate - now < 5 * 60 * 1000;
    if (isNearExpiration) {
      // Refresh the access token
      console.log('Access token is near expiration, refreshing...');
      console.log('Current access token:', this.oauth2Client.credentials.access_token);
      console.log('Current refresh token:', this.oauth2Client.credentials.refresh_token);
      try {
        await this.oauth2Client.getAccessToken();
      } catch (error) {
        console.error('Error refreshing access token:', error);
        // USER NEEDS TO RE-AUTHENTICATE TODO
        await this.authenticateGoogle(); // Re-authenticate if refresh fails
        if (!this.oauth2Client) {
          throw new Error('OAuth2 client is not initialized after re-authentication');
        }
        console.log('Re-authenticated successfully, new access token:', this.oauth2Client.credentials.access_token);
      }
      const {
        access_token: newAccessToken,
        expiry_date: newExpiryDate,
        refresh_token: newRefreshToken,
      } = this.oauth2Client.credentials;

      if (!newAccessToken || !newExpiryDate) {
        throw new Error('Failed to refresh token properly');
      }

      const updatedToken: AuthTokens = {
        access_token: newAccessToken,
        refresh_token: newRefreshToken || this.AuthToken.refresh_token,
        expiry_date: newExpiryDate
      };

      this.AuthToken = updatedToken;

      // Update the stored token in local storage
      saveCloudAccountLocaStorage(CloudType.GoogleDrive, this.accountId || '', updatedToken);

      console.log('Refreshed Google access token');
    }
  }

  async getFile(filePath: string, progressCallback?: (downloaded: number, total: number) => void, abortSignal?: AbortSignal): Promise<FileContent> {
    throw new Error('getFile method not implemented.');
  }

  async postFile(fileName: string, folderPath: string, type: string, data: Buffer, progressCallback?: (uploaded: number, total: number) => void, abortSignal?: AbortSignal): Promise<void> {
    console.log('Posting file to Google Drive:', fileName, folderPath, type, 'Size:', data.length);
  }



  // Transfer file/dir from local storage to Google Drive using resumable upload/download, this will fetch and upload the file in chunks at the same time

  async transferLocalToCloud(fileInfo: any, progressCallback?: (data: progressCallbackData) => void, abortSignal?: AbortSignal): Promise<void> {

    const {transferId, fileName, sourcePath, type, targetCloudType, targetAccountId, targetPath} = fileInfo;

    console.log(`From local ${sourcePath} to cloud ${targetCloudType} account ${targetAccountId} at path ${targetPath}`);
    await this.refreshOAuthClientIfNeeded();
    if (!this.oauth2Client) {
      throw new Error('OAuth2 client is not initialized');
    }
    
    // const parentFolderId = await this.getFolderId(targetPath);

    // Get file size from local file 
    const fileStats = await fs.stat(sourcePath)
    const fileSize = fileStats.size;

    //Check if it's a directory, then we will handle it separetely
    if (fileStats.isDirectory()) {
      console.log('Starting resumeable upload for directory:', fileName, 'Size:', fileSize, 'Parent folder path:', targetPath);
      await this.transferDirectoryToCloud(transferId, fileName, sourcePath, targetPath, progressCallback, abortSignal);
      return;

    }


    // Handle resumable for files
    console.log('Starting resumable upload for file:', fileName, 'Size:', fileSize, 'Parent folder path:', targetPath);

    try {
      // Initialize resumable upload session
      const uploadUrl = await this.initiateResumableUpload(fileName, type, targetPath);
      console.log('Resumable upload session initiated:', uploadUrl);
      
      // Upload file in chunks
      await this.uploadFileInChunks(transferId, fileName, uploadUrl, sourcePath, fileSize, progressCallback, abortSignal, false);
      
      console.log(`Resumable upload completed for file: ${fileName}`);
    } catch (error) {
      console.error('Resumable upload failed:', error);
      throw error;
    }
  }

  private async transferDirectoryToCloud(transferId: string, dirName: string, sourcePath: string, parentFolderPath: string, progressCallback?: (data: progressCallbackData) => void, abortSignal?: AbortSignal): Promise<void> {
    if (!this.oauth2Client) {
      throw new Error('OAuth2 client must be initialized before creating drive instance');
    }
    const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
    const parentFolderId = await this.getFolderId(parentFolderPath);
    const folderResponse = await drive.files.create({
      requestBody: {
        name: dirName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
      },
    });

    const createdFolderPath = path.join(parentFolderPath, dirName);

    const createdFolderId = folderResponse.data.id;
    if (!createdFolderId) {
      throw new Error('Failed to create directory on Google Drive');
    }

    console.log(`Created directory: ${dirName} with ID: ${createdFolderId}`);
    let processedFiles = 0;
    await this.transferDirectoryContentsResumable(transferId, sourcePath, createdFolderPath, progressCallback, abortSignal);

    
  }


  private async transferDirectoryContentsResumable(
    transferId: string,
    sourcePath: string,
    targetFolderPath: string,
    progressCallback?: (data: progressCallbackData) => void,
    abortSignal?: AbortSignal
  ): Promise<void> {
    const items = await fs.readdir(sourcePath, { withFileTypes: true });

    for (const item of items) {
      if (abortSignal?.aborted) {
        console.log('Transfer cancelled by user');
        throw new Error('Transfer cancelled by user');
      }

      const itemPath = path.join(sourcePath, item.name);
      if (item.isDirectory()) {
        try {
          console.log(`Processing directory: ${item.name}`);
          if (!this.oauth2Client) {
            throw new Error('OAuth2 client must be initialized before creating drive instance');
          }
          // Create subdirectory in Google Drive
          const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
          const targetFolderId = await this.getFolderId(targetFolderPath);
          const subFolderResponse = await drive.files.create({
          requestBody: {
            name: item.name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [targetFolderId],
          },
        });

        const subFolderPath = path.join(targetFolderPath, item.name);

        const subFolderId = subFolderResponse.data.id;
        if (!subFolderId) {
          throw new Error(`Failed to create subdirectory: ${item.name}`);
        }
          console.log(`Transferring directory: ${item.name}`);
          // Recursively transfer directory
          progressCallback?.({
            transferId,
            fileName: item.name,
            transfered: 0,
            total: 0, 
            isDirectory: false,
            isFetching: true 
          });
          await this.transferDirectoryContentsResumable(transferId, itemPath, subFolderPath, progressCallback, abortSignal);
        } catch (error) {
          console.error(`Failed to process directory ${item.name}:`, error);
          // Extract error message
          const parts = error instanceof Error ? error.message.split(':') : ["Transfer failed"];
          let errorMessage = parts[parts.length - 1].trim() + ". Continueing with next file...";
          if (errorMessage.toLowerCase().includes('permission')) {
            errorMessage = "You don't have permission to access this file or folder.";
          } else if (errorMessage.toLowerCase().includes('quota')) {
            errorMessage = "Google Drive storage quota exceeded.";
          } else if (errorMessage.toLowerCase().includes('network')) {
            errorMessage = "Network error. Please check your internet connection.";
          } else if (errorMessage.toLowerCase().includes('not found')) {
            errorMessage = "The file or folder was not found.";
          } else if (errorMessage.toLowerCase().includes('timeout')) {
            errorMessage = "The operation timed out. Please try again.";
          } else if (errorMessage === "" || errorMessage === "Transfer failed") {
            errorMessage = "An unknown error occurred during transfer.";
          }
          progressCallback?.({
            transferId,
            fileName: item.name,
            transfered: 0,
            total: 0, 
            isDirectory: true,
            isFetching: true,
            errorItemDirectory: `Failed to process directory ${item.name}: ${errorMessage}`
          });

          // Wait 5 seconds before continuing with the next item
          await new Promise(resolve => setTimeout(resolve, 5000));
          console.log(`Continuing with next item after error: ${errorMessage}`);
          // Skip this directory and continue with the next item
          continue;
        }
      }
      else if (item.isFile()) {
        try {
          progressCallback?.({
            transferId,
            fileName: item.name,
            transfered: 0,
            total: 0, 
            isDirectory: true,
            isFetching: true 
          });
          console.log('Processing file:', item.name);
          console.log('targetFolderPath:', targetFolderPath);
          // Get file size from local file 
          const fileStats = await fs.stat(itemPath);
          const fileSize = fileStats.size;
          const type = mime.lookup(item.name) || 'application/octet-stream';
          const uploadUrl = await this.initiateResumableUpload(item.name, type, targetFolderPath);
          await this.uploadFileInChunks(transferId, item.name, uploadUrl, itemPath, fileSize, progressCallback, abortSignal, true);
        
          console.log(`Transfer Directory: File transferred: ${item.name} files processed)`);
        } catch(error) {
          console.error(`Failed to process file ${item.name}:`, error);
          // Extract error message
          const parts = error instanceof Error ? error.message.split(':') : ["Transfer failed"];
          let errorMessage = parts[parts.length - 1].trim() + ". Continueing with next file...";
          if (errorMessage.toLowerCase().includes('permission')) {
            errorMessage = "You don't have permission to access this file or folder.";
          } else if (errorMessage.toLowerCase().includes('quota')) {
            errorMessage = "Google Drive storage quota exceeded.";
          } else if (errorMessage.toLowerCase().includes('network')) {
            errorMessage = "Network error. Please check your internet connection.";
          } else if (errorMessage.toLowerCase().includes('not found')) {
            errorMessage = "The file or folder was not found.";
          } else if (errorMessage.toLowerCase().includes('timeout')) {
            errorMessage = "The operation timed out. Please try again.";
          } else if (errorMessage === "" || errorMessage === "Transfer failed") {
            errorMessage = "An unknown error occurred during transfer.";
          }
          progressCallback?.({
            transferId,
            fileName: item.name,
            transfered: 0,
            total: 0, 
            isDirectory: true,
            isFetching: true,
            errorItemDirectory: `Failed to process file ${item.name}: ${errorMessage}`
            })

            // Wait 5 seconds before continuing with the next item
          await new Promise(resolve => setTimeout(resolve, 5000));
          console.log(`Continuing with next item after error: ${errorMessage}`);
          // Skip this file and continue with the next item
          continue;
        }
      }
    }
  }

  async initiateResumableUpload(fileName: string, mimeType: string, parentFolderPath: string): Promise<string> {
    const parentFolderId = await this.getFolderId(parentFolderPath);
    const metadata = {
      name: fileName,
      mimeType: mimeType,
      parents: [parentFolderId]
    };

    // initiate resumable upload session
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.oauth2Client!.credentials.access_token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
      },
      body: JSON.stringify(metadata)
    });

    if (!response.ok) {
      throw new Error(`Failed to initiate resumable upload: ${response.status} ${response.statusText}`);
    }

    const location = response.headers.get('Location');
    if (!location) {
      throw new Error('No Location header received from resumable upload initiation');
    }

    return location;
  }

  /* upload file in chunks, used when large files */
  private async uploadFileInChunks(transferId: string, filename: string, uploadUrl: string, sourcePath: string, fileSize: number, progressCallback?: (data: progressCallbackData) => void, abortSignal?: AbortSignal, isDirectory?: boolean): Promise<void> {
    let CHUNK_SIZE: number;
    
    if (fileSize < 10 * 1024 * 1024) { // < 10MB
        CHUNK_SIZE = 512 * 1024; // 512KB
    } else if (fileSize < 100 * 1024 * 1024) { // < 100MB
        CHUNK_SIZE = 2 * 1024 * 1024; // 2MB
    } else if (fileSize < 1024 * 1024 * 1024) { // < 1GB
        CHUNK_SIZE = 8 * 1024 * 1024; // 8MB
    } else { // > 1GB
        CHUNK_SIZE = 32 * 1024 * 1024; // 32MB
    }
    
    let TransferedBytes = 0;
    let retryCount = 0;
    const MAX_RETRIES = 3;
    const fileHandle = await fs.open(sourcePath, 'r');

    console.log(`Starting chunked upload. Total size: ${fileSize}, Chunk size: ${CHUNK_SIZE}`);

    try {
      while (TransferedBytes < fileSize) {
        // Check for cancellation before each chunk
        if (abortSignal?.aborted) {
          console.log('Transfer cancelled by user');
          throw new Error('Transfer cancelled by user');
        }

        const chunkStart = TransferedBytes;
        const chunkEnd = Math.min(TransferedBytes + CHUNK_SIZE, fileSize) - 1;

        // Read the chunk from the local file
        const length = chunkEnd - chunkStart + 1;
        const chunkData = Buffer.alloc(length);
        await fileHandle.read(chunkData, 0, length, chunkStart);
        
        console.log(`Transfering chunk: ${chunkStart}-${chunkEnd}/${fileSize - 1}`);

        try {
          const response = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Range': `bytes ${chunkStart}-${chunkEnd}/${fileSize}`,
              'Content-Length': chunkData.length.toString(),
            },
            body: chunkData,
            signal: abortSignal 
          });

          if (response.status === 308) {
            // Resume incomplete - check range and continue
            const rangeHeader = response.headers.get('Range');
            if (rangeHeader) {
              const match = rangeHeader.match(/bytes=0-(\d+)/);
              if (match) {
                TransferedBytes = parseInt(match[1]) + 1;
                console.log(`Resuming from byte: ${TransferedBytes}`);
              }
            } else {
              TransferedBytes = chunkEnd + 1;
            }
            
            //  Update progress
            if (progressCallback) {
              progressCallback({transferId, fileName: filename, transfered: TransferedBytes, total: fileSize, isDirectory: (isDirectory || false)});
            }
            
            retryCount = 0; // Reset retry count on successful chunk
          } else if (response.status === 200 || response.status === 201) {
            // Upload complete
            TransferedBytes = fileSize;
            if (progressCallback) {
              progressCallback({transferId, fileName: filename, transfered: fileSize, total: fileSize, isDirectory: (isDirectory || false)});
            }
            console.log('Upload completed successfully');
            break;
          } else {
            throw new Error(`Upload chunk failed: ${response.status} ${response.statusText}`);
          }
        } catch (error) {
          retryCount++;
          console.error(`Chunk upload error (attempt ${retryCount}/${MAX_RETRIES}):`, error);
          
          if (retryCount >= MAX_RETRIES) {
            throw new Error(`Upload failed after ${MAX_RETRIES} attempts: ${error}`);
          }
          
          // Wait before retry
          const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Try to get current upload status before retry
          try {
            const statusResponse = await fetch(uploadUrl, {
              method: 'PUT',
              headers: {
                'Content-Range': `bytes */${fileSize}`,
              },
              signal: abortSignal 
            });
            
            // If the status response is 308, it means we can resume
            if (statusResponse.status === 308) {
              const rangeHeader = statusResponse.headers.get('Range');
              // If the range header is present, we can resume from the last uploaded byte
              if (rangeHeader) {
                const match = rangeHeader.match(/bytes=0-(\d+)/);
                if (match) {
                  TransferedBytes = parseInt(match[1]) + 1;
                  console.log(`Resuming from byte: ${TransferedBytes} after error`);
                }
              }
            }
          } catch (statusError) {
            console.warn('Failed to get upload status, continuing with current position:', statusError);
          }
        }
      } 
    } finally {
      // Ensure the file handle is closed after upload
      if (fileHandle) {
        await fileHandle.close();
      }
    }
  }


  async deleteFile(filePath: string): Promise<void> {
    await this.refreshOAuthClientIfNeeded();
    if (!this.oauth2Client) {
      throw new Error('OAuth2 client is not initialized');
    }
    const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
    const fileId = await this.getFileId(filePath);
    
    try {
      await drive.files.delete({
        fileId: fileId,
      });
      console.log(`File with ID ${fileId} deleted successfully.`);
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  }
    // Implement missing methods from CloudStorage interface

    async searchFiles(rootPath: string, pattern: string, excludePatterns: string[]): Promise<FileSystemItem[]> {
        // Not implemented for Google Drive yet
      await this.refreshOAuthClientIfNeeded();
      if (!this.oauth2Client) {
        throw new Error('OAuth2 client is not initialized');
      }
      const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
      const result: FileSystemItem[] = [];

      const search = async (currentPath: string): Promise<void> => {
        try {
          const folderId = currentPath ? await this.getFolderId(currentPath) : 'root';
          const res = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
          });

          console.log(`Searching in folder: ${currentPath}`);
          console.log(`Found files:`, res.data.files);

          const files = res.data.files || [];
          for (const file of files) {
            // check if the file matches any of the exclude patterns
            const matchesExclude = excludePatterns.some(excludePattern => {
              return file.name?.toLowerCase().includes(excludePattern.toLowerCase()) || 
                      (excludePattern.includes("*") && minimatch(file.name?.toLowerCase() || '', excludePattern.toLowerCase(), { dot: true }));
            });
            if (matchesExclude) {
              continue; // Skip files that match exclude patterns
            }
            // Check if the file matches the search pattern
            const matchesPattern = file.name?.toLowerCase().includes(pattern.toLowerCase()) || 
                      (pattern.includes("*") && minimatch(file.name?.toLowerCase() || '', pattern.toLowerCase(), { dot: true }));
            if (matchesPattern) {
              const filePath = currentPath ? `${currentPath}/${file.name}` : file.name;
              // skip if the filePath is empty or undefined
              if (!filePath || filePath.trim() === '') {
                continue;
              }
              result.push({
                id: file.id || '',
                name: file.name || '',
                isDirectory: file.mimeType === 'application/vnd.google-apps.folder',
                path: filePath,
              });
            }
            // If it's a directory, search recursively
            if (file.mimeType === 'application/vnd.google-apps.folder') {
              if (currentPath === '/') {
                currentPath = ''; // If root, set currentPath to empty string
              }
              await search(currentPath ? `${currentPath}/${file.name ?? ''}` : (file.name ?? ''));
            }
          }
        } catch (error) {
          console.error('Error searching files:', error);
          console.log('skipping search for path:', currentPath);
        }
      }

      await search(rootPath);
      return result;
    }

    async isDirectory(filePath: string): Promise<boolean> {
      try {
        const folderId = await this.getFolderId(filePath);
        if (!folderId) {
          return false;
        }
      } catch (error) {
        console.error('Error checking if directory:', error);
        return false;
      }
      return true;
    }

    async getItemInfo(filePath: string): Promise<FileSystemItem> {
        await this.refreshOAuthClientIfNeeded();
        if (!this.oauth2Client) {
            throw new Error('OAuth2 client is not initialized');
        }
        
        const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
        
        try {
            const fileId = await this.getFileId(filePath);
            const response = await drive.files.get({
                fileId: fileId,
                fields: 'id,name,mimeType,size,modifiedTime,createdTime'
            });
            
            const file = response.data;
            if (!file) {
                throw new Error('File not found');
            }
            
            const fileSystemItem: FileSystemItem = {
                id: file.id || '',
                name: file.name || '',
                isDirectory: file.mimeType === 'application/vnd.google-apps.folder',
                path: CLOUD_HOME + filePath,
                size: file.size ? Number(file.size) : undefined,
                modifiedTime: file.modifiedTime ? new Date(file.modifiedTime).getTime() : undefined,
            };
            
            return fileSystemItem;
        } catch (error) {
          // check if the path if a directory
          const folderId = await this.getFolderId(filePath);
          if (folderId) {
            const size = await this.calculateFolderSize(filePath);
            return {
              id: folderId,
              name: path.basename(filePath),
              isDirectory: true,
              path: CLOUD_HOME + filePath,
              size,
              modifiedTime: undefined,
            };
          } else {
            console.error('Error getting item info:', error);
            throw new Error(`File not found: ${filePath}`);
          }
        }
    }

    async getDirectoryTree(dir: string): Promise<FileSystemItem[]> {
        await this.refreshOAuthClientIfNeeded();
        if (!this.oauth2Client) {
            throw new Error('OAuth2 client is not initialized');
        }
        
        const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
        const result: FileSystemItem[] = [];
        
        try {
            const folderId = await this.getFolderId(dir);
            await this.buildDirectoryTreeRecursive(drive, folderId, dir, result);
            return result;
        } catch (error) {
            console.error('Error getting directory tree from Google Drive:', error);
            throw error;
        }
    }
    
    private async buildDirectoryTreeRecursive(drive: any, folderId: string, currentPath: string, result: FileSystemItem[]): Promise<void> {
        let nextPageToken: string | undefined = undefined;
        
        do {
            const res: { data: drive_v3.Schema$FileList } = await drive.files.list({
                q: `'${folderId}' in parents and trashed = false`,
                pageSize: 1000,
                fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime)',
                pageToken: nextPageToken,
            });
            
            const files = res.data.files || [];
            console.log("files", files);
            
            for (const file of files) {
                const filePath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
                
                const fileSystemItem: FileSystemItem = {
                    id: file.id || '',
                    name: file.name || '',
                    isDirectory: file.mimeType === 'application/vnd.google-apps.folder',
                    path: CLOUD_HOME + filePath,
                    size: file.size ? Number(file.size) : undefined,
                    modifiedTime: file.modifiedTime ? new Date(file.modifiedTime).getTime() : undefined,
                };

                console.log("fileSystemItem", fileSystemItem);  
                
                result.push(fileSystemItem);
                
                // Recursively process subdirectories
                if (file.mimeType === 'application/vnd.google-apps.folder' && file.id) {
                    await this.buildDirectoryTreeRecursive(drive, file.id, filePath, result);
                }
            }
            
            nextPageToken = res.data.nextPageToken || undefined;
        } while (nextPageToken);
    }

  async createDirectory(dirPath: string): Promise<void> {
    await this.refreshOAuthClientIfNeeded();
    if (!this.oauth2Client) {
      throw new Error('OAuth2 client is not initialized');
    }
    
    const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
    
    const pathParts = dirPath.split('/').filter(part => part !== '');
    let currentParentId = 'root';
    
    for (const folderName of pathParts) {
      try {
        // Check if folder already exists
        const existingRes = await drive.files.list({
          q: `'${currentParentId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed = false`,
          fields: 'files(id)',
        });
        
        if (existingRes.data.files && existingRes.data.files.length > 0) {
          // Folder exists, use its ID as parent for next iteration
          currentParentId = existingRes.data.files[0].id || '';
        } else {
          // Create new folder
          const res = await drive.files.create({
            requestBody: {
              name: folderName,
              mimeType: 'application/vnd.google-apps.folder',
              parents: [currentParentId],
            },
          });
          
          currentParentId = res.data.id || '';
          console.log(`Created Google Drive folder: ${folderName} with ID: ${currentParentId}`);
        }
      } catch (error) {
        console.error(`Error creating folder ${folderName}:`, error);
        throw error;
      }
    }
  }

  async calculateFolderSize(folderPath: string): Promise<number> {
    await this.refreshOAuthClientIfNeeded();
    if (!this.oauth2Client) {
      throw new Error('OAuth2 client is not initialized');
    }
    
    const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
    
    try {
      const folderId = await this.getFolderId(folderPath);
      return await this.calculateFolderSizeRecursive(drive, folderId);
    } catch (error) {
      console.error('Error calculating folder size for Google Drive:', error);
      throw error;
    }
  }

  private async calculateFolderSizeRecursive(drive: any, folderId: string): Promise<number> {
    let totalSize = 0;
    let nextPageToken: string | undefined = undefined;

    do {
      const res: { data: drive_v3.Schema$FileList } = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        pageSize: 1000,
        fields: 'nextPageToken, files(id, name, mimeType, size)',
        pageToken: nextPageToken,
      });

      const files = res.data.files || [];
      
      for (const file of files) {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          // Recursively calculate size for subdirectories
          if (file.id) {
            const subFolderSize = await this.calculateFolderSizeRecursive(drive, file.id);
            totalSize += subFolderSize;
          }
        } else {
          // Add file size 
          const fileSize = file.size ? Number(file.size) : 0;
          totalSize += fileSize;
        }
      }

      nextPageToken = res.data.nextPageToken || undefined;
    } while (nextPageToken);

    return totalSize;
  }




  /* download file in chunks, used when large files */
  private async downloadFileInChunks(fileId: string, totalSize: number, progressCallback: (downloaded: number, total: number) => void, abortSignal?: AbortSignal): Promise<Buffer> {
    let CHUNK_SIZE: number;
    
    if (totalSize < 10 * 1024 * 1024) { // < 10MB
        CHUNK_SIZE = 512 * 1024; // 512KB
    } else if (totalSize < 100 * 1024 * 1024) { // < 100MB
        CHUNK_SIZE = 2 * 1024 * 1024; // 2MB
    } else if (totalSize < 1024 * 1024 * 1024) { // < 1GB
        CHUNK_SIZE = 8 * 1024 * 1024; // 8MB
    } else { // > 1GB
        CHUNK_SIZE = 32 * 1024 * 1024; // 32MB
    }

    let downloadedBytes = 0;
    let retryCount = 0;
    const MAX_RETRIES = 3;
    const chunks: Buffer[] = [];

    console.log(`Starting chunked download. Total size: ${totalSize}, Chunk size: ${CHUNK_SIZE}`);

    while (downloadedBytes < totalSize) {
      // Check for cancellation before each chunk
      if (abortSignal?.aborted) {
        console.log('Download cancelled by user');
        throw new Error('Download cancelled by user');
      }

      const chunkStart = downloadedBytes;
      const chunkEnd = Math.min(downloadedBytes + CHUNK_SIZE, totalSize) - 1;
      
      console.log(`Downloading chunk: ${chunkStart}-${chunkEnd}/${totalSize - 1}`);

      try {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.oauth2Client!.credentials.access_token}`,
            'Range': `bytes=${chunkStart}-${chunkEnd}`,
          },
          signal: abortSignal 
        });

        if (response.status === 206 || response.status === 200) {
          // Partial content or full content received
          const chunkBuffer = Buffer.from(await response.arrayBuffer());
          chunks.push(chunkBuffer);
          
          downloadedBytes += chunkBuffer.length;
          
          // Update progress
          progressCallback(downloadedBytes, totalSize);
          
          retryCount = 0; // Reset retry count on successful chunk
          
          if (response.status === 200) {
            // Full file downloaded in one request
            break;
          }
        } else {
          throw new Error(`Download chunk failed: ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        retryCount++;
        console.error(`Chunk download error (attempt ${retryCount}/${MAX_RETRIES}):`, error);
        
        if (retryCount >= MAX_RETRIES) {
          throw new Error(`Download failed after ${MAX_RETRIES} attempts: ${error}`);
        }
        
        // Wait before retry
        const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Combine all chunks into a single buffer
    return Buffer.concat(chunks);
  }

  async createReadStream(filePath: string, fileSize: number, chunkSize?: number, maxQueueSize?: number): Promise<ReadableStream> {
    await this.refreshOAuthClientIfNeeded();
    if (!this.oauth2Client) {
      throw new Error('OAuth2 client is not initialized');
    }

    const drive = google.drive({ version: 'v3', auth: this.oauth2Client });

    maxQueueSize = maxQueueSize || 10 * 32 * 1024 * 1024; // Default to 100 if not provided

    // Get file ID from path
    const fileId = await this.getFileId(filePath);
    if (!fileId) {
      throw new Error(`File not found: ${filePath}`);
    }

    console.log(`Creating read stream for file ID: ${fileId}, Size: ${fileSize}`);

    chunkSize = chunkSize || 32 * 1024 * 1024; // Default to 32MB if not provided

    let currentPosition = 0;
    let retryCount = 0;
    let isStreamClosed = false;
    const MAX_RETRIES = 3;

    const accessToken = this.oauth2Client!.credentials.access_token;
    // Create a ReadableStream that downloads the file in chunks
    const stream = new ReadableStream({
      async start(controller) {
        // Stream started
        console.log('Google read stream started');
      },

      async pull(controller) {
        if (isStreamClosed) {
          console.log('Stream is already closed');
          controller.close();
          return;
        }

        if (currentPosition >= fileSize) {
          console.log('Stream finished');
          controller.close();
          return;
        }

        console.log(controller.desiredSize, 'desired size');
        // Check if we should pause due to backpressure
        // Not used as synchronous pull is used.... but could be useful in the future
        while (controller.desiredSize !== null && controller.desiredSize <= chunkSize) {
          console.log(`Backpressure detected, desired size: ${controller.desiredSize}, waiting...`);
          // Wait a bit for the consumer to process some data
          // wait for 1 second before checking again
          await new Promise(resolve => setTimeout(resolve, 1000));
          retryCount++;
          if (retryCount > 10) {
            console.error('Too much backpressure, stopping stream');
            controller.close();
            isStreamClosed = true;
            return;
          }
        }

        console.log(`Pulling chunk from position: ${currentPosition}, file size: ${fileSize}`);


        try {
          const endPosition = Math.min(currentPosition + chunkSize - 1, fileSize - 1);

          const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Range': `bytes=${currentPosition}-${endPosition}`,
            },
          });

          if (response.status === 206 || response.status === 200) {
            // Partial content or full content received
            const chunkBuffer = Buffer.from(await response.arrayBuffer());
            controller.enqueue(chunkBuffer);
            
            currentPosition += chunkBuffer.length;

            retryCount = 0; // Reset retry count on successful chunk
            
            if (response.status === 200) {
              // Full file downloaded in one request
              isStreamClosed = true;
              controller.close();
            }
          } else {
            throw new Error(`Download chunk failed: ${response.status} ${response.statusText}`);
          }

        } catch (error) {
          // retry logic TODO
          console.error('Error reading chunk:', error);
          
          retryCount++;
          console.error(`Error uploading chunk:`, error);

          if (retryCount >= MAX_RETRIES) {
              throw new Error(`Upload failed after ${MAX_RETRIES} attempts: ${error}`);
          }
          
          // Wait before retry
          const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      },

      cancel() {
        isStreamClosed = true;
      }
    }, {
      // Set a high water mark to control internal buffering
      highWaterMark: maxQueueSize,
    });

    return stream;
  }

  async uploadChunk(uploadUrl: string, chunk: Buffer, offset: number, totalSize: number): Promise<void> {
    console.log(`Uploading chunk for uploadUrl: ${uploadUrl}, offset: ${offset}, size: ${chunk.length}`);
    await this.refreshOAuthClientIfNeeded();
    if (!this.oauth2Client) {
      throw new Error('OAuth2 client is not initialized');
    }

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Range': `bytes ${offset}-${offset + chunk.length - 1}/${totalSize}`,
        'Content-Length': chunk.length.toString(),
      },
      body: chunk,
    });

    
    if (response.status === 308) {
      // Resume incomplete - check range and continue
      const rangeHeader = response.headers.get('Range');
      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=0-(\d+)/);
        if (match) {
          console.log(`Resuming from byte: ${parseInt(match[1]) + 1}`);
        }
      } else {
        console.log(`Resuming from byte: ${offset + chunk.length}`);
      }
      
    } else if (response.status === 200 || response.status === 201) {
      console.log('Upload completed successfully');
    } else {
      throw new Error(`Upload chunk failed: ${response.status} ${response.statusText}`);
    }
    console.log(`Chunk uploaded successfully: ${offset}-${offset + chunk.length - 1}/${totalSize}`);
  }

  async finishResumableUpload(sessionId: string, targetFilePath: string, fileSize: number): Promise<void> {
    console.log(`Finishing resumable upload for session ID: ${sessionId}`);
  }

  // Move or copy item for within box transfer
  async moveOrCopyItem(sourcePath: string, targetPath: string, itemName: string, copy: boolean, progressCallback?: (data: progressCallbackData) => void, abortSignal?: AbortSignal): Promise<void> {
    await this.refreshOAuthClientIfNeeded();
    if (!this.oauth2Client) {
      throw new Error('OAuth2 client is not initialized');
    }
    
    const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
    
    try {
      let sourceId;
      let isDirectory = false;
      // hmmm.......
      try{
        sourceId = await this.getFolderId(sourcePath);
        console.log(`Source ID for folder ${sourcePath} is ${sourceId}`);
        isDirectory = true;
      } catch (error) {
        sourceId = await this.getFileId(sourcePath);
        console.log(`Source ID for file ${sourcePath} is ${sourceId}`);
        isDirectory = false;
      }
      const sourceFolder = path.dirname(sourcePath);
      const sourceFolderId = await this.getFolderId(sourceFolder);
      const targetId = await this.getFolderId(targetPath);
      
      if (!sourceId || !targetId) {
        throw new Error(`Source or target path not found: ${sourcePath} -> ${targetPath}`);
      }

      const accessToken = this.oauth2Client!.credentials.access_token;
      
      // Move the file to the new folder
      if (copy) {
        if (isDirectory) {
          console.log(`Copying directory ${itemName} from ${sourcePath} to ${targetPath}`);
          // Create a new folder in the target location
          const newFolder = await drive.files.create({
            requestBody: {
              name: itemName,
              mimeType: 'application/vnd.google-apps.folder',
              parents: [targetId],
            },
            fields: 'id',
          });
          
          if (!newFolder.data.id) {
            throw new Error(`Failed to create folder ${itemName} in target path ${targetPath}`);
          }
          const createdFolderId = newFolder.data.id;
          // For directories, we need to copy all contents recursively
          await this.copyDirectoryContents(sourceId, createdFolderId, progressCallback, abortSignal);
          return;
        }
        console.log(`Copying file ${itemName} from ${sourcePath} to ${targetPath}`);
        // await drive.files.copy({
        //   fileId: sourceId,
        //   requestBody: {
        //     parents: [targetId],
        //   },
        //   fields: 'id, parents',
        // });

        // url for copying file
        const url = `https://www.googleapis.com/drive/v3/files/${sourceId}/copy`;
        const body = {
          parents: [targetId]
        };

        const fetchPromise = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: abortSignal,
        });
      } else {
        console.log(`Moving item ${itemName} from ${sourcePath} to ${targetPath}`);

        // Move the file or folder by updating its parents
        const url = `https://www.googleapis.com/drive/v3/files/${sourceId}?addParents=${targetId}&removeParents=${sourceFolderId}`;
        
        const fetchPromise = await fetch(url, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
          signal: abortSignal,
        });

        console.log(`response: ${fetchPromise}`);

        if (!fetchPromise.ok) {
          const errorText = await fetchPromise.text();
          throw new Error(`Failed to move item: ${fetchPromise.status} ${fetchPromise.statusText} - ${errorText}`);
        }
        
        const responseData = await fetchPromise.json();
        if (!responseData.id) {
          throw new Error(`Failed to move item: No ID returned in response`);
        }
        console.log(`Item moved successfully. New ID: ${responseData.id}`);
      }
      
      console.log(`Moved item ${itemName} from ${sourcePath} to ${targetPath}`);
    } catch (error) {
      console.error('Error moving item:', error);
      throw error;
    }
  }

  // function for within box transfer
  // google does not support copying directories directly, so we need to copy contents recursively
  private async copyDirectoryContents(sourceId: string, targetId: string, progressCallback?: (data: progressCallbackData) => void, abortSignal?: AbortSignal): Promise<void> {
    await this.refreshOAuthClientIfNeeded();
    if (!this.oauth2Client) {
      throw new Error('OAuth2 client is not initialized');
    }

    if (abortSignal?.aborted) {
      console.log('Copy operation cancelled by user');
      throw new Error('Copy operation cancelled by user');
    }
    
    const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
    let nextPageToken: string | undefined = undefined;

    do {
      const res: { data: drive_v3.Schema$FileList } = await drive.files.list({
        q: `'${sourceId}' in parents and trashed = false`,
        pageSize: 1000,
        fields: 'nextPageToken, files(id, name, mimeType)',
        pageToken: nextPageToken,
      });

      const files = res.data.files || [];
      
      for (const file of files) {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          // Recursively copy subdirectories
          const newFolder = await drive.files.create({
            requestBody: {
              name: file.name,
              mimeType: 'application/vnd.google-apps.folder',
              parents: [targetId],
            },
            fields: 'id',
          });
          
          if (newFolder.data.id) {
            await this.copyDirectoryContents(file.id || '', newFolder.data.id, progressCallback, abortSignal);
          }
        } else {
          // Copy individual files
          await drive.files.copy({
            fileId: file.id || '',
            requestBody: {
              name: file.name,
              parents: [targetId],
            },
            fields: 'id, parents',
          });
        }
      }

      nextPageToken = res.data.nextPageToken || undefined;
    } while (nextPageToken);
  }

  async  transferCloudToLocal(transferInfo: any, progressCallback?: (data: progressCallbackData) => void, abortSignal?: AbortSignal): Promise<void> {
    await this.downloadItem(transferInfo, progressCallback, abortSignal);
  }

  async downloadItem(transferInfo: any, progressCallback?: (data: progressCallbackData) => void, abortSignal?: AbortSignal): Promise<void> {
    const {transferId, fileName, type, sourcePath, targetPath} = transferInfo;

    await this.refreshOAuthClientIfNeeded();
    if (!this.oauth2Client) {
      throw new Error('OAuth2 client is not initialized');
    }

    const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
    
    // Get file ID from path
    const fileId = await this.getFileId(sourcePath);
    if (!fileId) {
      throw new Error(`File not found: ${sourcePath}`);
    }

    // Get file metadata to determine size
    const fileMetadata = await drive.files.get({
      fileId: fileId,
      fields: 'size,mimeType',
    });

    const isDirectory = fileMetadata.data.mimeType === 'application/vnd.google-apps.folder';
    if (isDirectory) {
      const newFolderPath = path.join(targetPath, fileName);
      fs.mkdir(newFolderPath, { recursive: true });
      console.log(`Created directory: ${newFolderPath}`);
      // list files in the directory and download each file
      const files = await drive.files.list({
        q: `'${fileId}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType)',
      });

      for (const file of files.data.files || []) {
        const type = file.mimeType === 'application/vnd.google-apps.folder' ? 'directory' : 'file';
        const fileTransferInfo = {
          transferId,
          fileName: file.name || '',
          type,
          sourcePath: path.join(sourcePath, file.name || ''),
          targetPath: newFolderPath,
        };
        await this.downloadItem(fileTransferInfo, progressCallback, abortSignal);
      }
      return;
    }

    const fileSize = fileMetadata.data.size ? Number(fileMetadata.data.size) : 0;
    
    if (fileSize === 0) {
      console.log(`File ${fileName} is empty, skipping transfer.`);
      return;
    }

    console.log(`Transferring file ${fileName} (${fileSize} bytes) from cloud to local`);

    // Create a writable stream to the target file
    const targetFilePath = path.join(targetPath, fileName);
    const fileHandle = await fs.open(targetFilePath, 'w');
    
    try {
      let TransferedBytes = 0;
      let retryCount = 0;
      const MAX_RETRIES = 3;
      const CHUNK_SIZE = 32 * 1024 * 1024; // 32MB chunks

      while (TransferedBytes < fileSize) {
        // Check for cancellation before each chunk
        if (abortSignal?.aborted) {
          console.log('Transfer cancelled by user');
          throw new Error('Transfer cancelled by user');
        }

        if (retryCount >= MAX_RETRIES) {
          throw new Error(`Transfer failed after ${MAX_RETRIES} attempts`);
        }

        if (progressCallback) {
          progressCallback({transferId, fileName, transfered: TransferedBytes, total: fileSize, isDirectory: false});
        }

        const chunkStart = TransferedBytes;
        const chunkEnd = Math.min(TransferedBytes + CHUNK_SIZE - 1, fileSize - 1);
        
        console.log(`Downloading chunk: ${chunkStart}-${chunkEnd}/${fileSize - 1}`);

        try {
          const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${this.oauth2Client!.credentials.access_token}`,
              'Range': `bytes=${chunkStart}-${chunkEnd}`,
            },
            signal: abortSignal 
          });

          if (response.status === 206 || response.status === 200) {
            // Partial content or full content received
            const chunkBuffer = Buffer.from(await response.arrayBuffer());
            await fileHandle.write(chunkBuffer, 0, chunkBuffer.length, TransferedBytes);
            
            TransferedBytes += chunkBuffer.length;
            
            retryCount = 0; // Reset retry count on successful chunk
            
            if (response.status === 200) {
              // Full file downloaded in one request
              break;
            }
          } else {
            throw new Error(`Download chunk failed: ${response.status} ${response.statusText}`);
          }

          if (progressCallback) {
            progressCallback({transferId, fileName, transfered: TransferedBytes, total: fileSize, isDirectory: false});
          }

        } catch (error) {
          retryCount++;
          console.error(`Error downloading chunk (attempt ${retryCount}/${MAX_RETRIES}):`, error);
          
          if (progressCallback) {
            progressCallback({transferId, fileName, transfered: TransferedBytes, total: fileSize, isDirectory: false});
          }

          if (retryCount >= MAX_RETRIES) {
            throw new Error(`Transfer failed after ${MAX_RETRIES} attempts: ${error}`);
          }
          
          // Wait before retry
          const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Try to get current upload status before retry
          try {
            const statusResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${this.oauth2Client!.credentials.access_token}`,
                'Range': `bytes=${chunkStart}-${chunkEnd}`,
              },
              signal: abortSignal 
            });
            
            // If the status response is 308, it means we can resume
            if (statusResponse.status === 308) {
              const rangeHeader = statusResponse.headers.get('Range');
              if (rangeHeader) {
                const match = rangeHeader.match(/bytes=(\d+)-(\d+)/);
                if (match) {
                  const currentPosition = parseInt(match[2]) + 1; // Next byte to download
                  console.log(`Resuming from byte: ${currentPosition}`);
                  TransferedBytes = currentPosition; // Update current position
                } else {
                  console.warn('Failed to parse Range header:', rangeHeader);
                }
              } else {
                console.warn('No Range header in response, resuming from last known position');
              }
            } else {
              console.warn('Status response was not 308, resuming from last known position');
            }
          } catch (statusError) {
            console.error('Error getting current upload status:', statusError);
          }
        }
      }

      console.log(`Transfer completed successfully: ${TransferedBytes}/${fileSize} bytes`);
    } finally {
      await fileHandle.close();
    }
  }
}
