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
import { normalize } from 'path';
import { minimatch } from 'minimatch';

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
      await this.oauth2Client.getAccessToken();
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
    await this.refreshOAuthClientIfNeeded();
    if (!this.oauth2Client) {
      throw new Error('OAuth2 client is not initialized');
    }
    const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
    const fileId = await this.getFileId(filePath);
    
    try {
      const result = await drive.files.get({
        fileId: fileId,
        fields: 'mimeType, size'
      });
      const mimeType = result.data.mimeType;
      const fileSize = result.data.size ? parseInt(result.data.size) : 0;

      // Use resumable download for files larger than 5MB
      const LARGEFILE_CUTOFF = 5 * 1024 * 1024; // 5MB
      
      if (fileSize > LARGEFILE_CUTOFF && progressCallback) {
        // Use resumable download for large files
        const data = await this.getFileResumable(fileId, fileSize, progressCallback, abortSignal);
        
        const fileContent: FileContent = {
          name: filePath.split('/').pop() || '',
          content: data,
          type: mimeType || 'application/octet-stream',
          path: CLOUD_HOME + filePath,
          sourceCloudType: CloudType.GoogleDrive,
          sourceAccountId: this.accountId || null,
        };
        return fileContent;
      } else {
        // Use simple download for small files
        return await this.getFileSimple(fileId, filePath, mimeType, progressCallback);
      }
    } catch (err) {
      throw err;
    }
  }

  async postFile(fileName: string, folderPath: string, type: string, data: Buffer, progressCallback?: (uploaded: number, total: number) => void, abortSignal?: AbortSignal): Promise<void> {
    console.log('Posting file to Google Drive:', fileName, folderPath, type, 'Size:', data.length);
    
    // Use resumable upload for files larger than 5MB
    const LARGEFILE_CUTOFF = 5 * 1024 * 1024; // 5MB
    
    if (data.length > LARGEFILE_CUTOFF) {
      // Use resumable upload for large files
      await this.postFileResumable(fileName, folderPath, type, data, progressCallback, abortSignal);
    } else {
      // Normal approach using buffer
      await this.postFileSimple(fileName, folderPath, type, data, progressCallback);
    }
  }

  private async postFileSimple(fileName: string, folderPath: string, type: string, data: Buffer, progressCallback?: (uploaded: number, total: number) => void): Promise<void> {
    const stream = await this.bufferToStream(data);
    await this.refreshOAuthClientIfNeeded();
    if (!this.oauth2Client) {
      throw new Error('OAuth2 client is not initialized');
    }
    const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
    const parentFolderId = await this.getFolderId(folderPath);
    console.log('Parent folder ID:', parentFolderId);
    
    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: type,
        parents: [parentFolderId],
      },
      media: {
        mimeType: type,
        body: stream,
      },
    });
  
    // Update progress after completion
    if (progressCallback) {
      progressCallback(data.length, data.length);
    }
    
    console.log(`Uploaded file ID: ${res.data.id}`);
  }

  private async postFileResumable(fileName: string, folderPath: string, type: string, data: Buffer, progressCallback?: (uploaded: number, total: number) => void, abortSignal?: AbortSignal): Promise<void> {
    await this.refreshOAuthClientIfNeeded();
    if (!this.oauth2Client) {
      throw new Error('OAuth2 client is not initialized');
    }
    
    const parentFolderId = await this.getFolderId(folderPath);
    console.log('Starting resumable upload for file:', fileName, 'Size:', data.length, 'Parent folder ID:', parentFolderId);
    
    try {
      // Initialize resumable upload session
      const uploadUrl = await this.initiateResumableUpload(fileName, type, parentFolderId);
      console.log('Resumable upload session initiated:', uploadUrl);
      
      // Upload file in chunks
      await this.uploadFileInChunks(uploadUrl, data, progressCallback, abortSignal);
      
      console.log(`Resumable upload completed for file: ${fileName}`);
    } catch (error) {
      console.error('Resumable upload failed:', error);
      throw error;
    }
  }

  private async initiateResumableUpload(fileName: string, mimeType: string, parentFolderId: string): Promise<string> {
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
  private async uploadFileInChunks(uploadUrl: string, data: Buffer, progressCallback?: (uploaded: number, total: number) => void, abortSignal?: AbortSignal): Promise<void> {
    let CHUNK_SIZE: number;
    const totalSize = data.length;
    
    if (totalSize < 10 * 1024 * 1024) { // < 10MB
        CHUNK_SIZE = 512 * 1024; // 512KB
    } else if (totalSize < 100 * 1024 * 1024) { // < 100MB
        CHUNK_SIZE = 2 * 1024 * 1024; // 2MB
    } else if (totalSize < 1024 * 1024 * 1024) { // < 1GB
        CHUNK_SIZE = 8 * 1024 * 1024; // 8MB
    } else { // > 1GB
        CHUNK_SIZE = 32 * 1024 * 1024; // 32MB
    }
    

    let uploadedBytes = 0;
    let retryCount = 0;
    const MAX_RETRIES = 3;

    console.log(`Starting chunked upload. Total size: ${totalSize}, Chunk size: ${CHUNK_SIZE}`);

    while (uploadedBytes < totalSize) {
      // Check for cancellation before each chunk
      if (abortSignal?.aborted) {
        console.log('Upload cancelled by user');
        throw new Error('Upload cancelled by user');
      }

      const chunkStart = uploadedBytes;
      const chunkEnd = Math.min(uploadedBytes + CHUNK_SIZE, totalSize) - 1;
      const chunkData = data.subarray(chunkStart, chunkEnd + 1);
      
      console.log(`Uploading chunk: ${chunkStart}-${chunkEnd}/${totalSize - 1}`);

      try {
        const response = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Range': `bytes ${chunkStart}-${chunkEnd}/${totalSize}`,
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
              uploadedBytes = parseInt(match[1]) + 1;
              console.log(`Resuming from byte: ${uploadedBytes}`);
            }
          } else {
            uploadedBytes = chunkEnd + 1;
          }
          
          //  Update progress
          if (progressCallback) {
            progressCallback(uploadedBytes, totalSize);
          }
          
          retryCount = 0; // Reset retry count on successful chunk
        } else if (response.status === 200 || response.status === 201) {
          // Upload complete
          uploadedBytes = totalSize;
          if (progressCallback) {
            progressCallback(totalSize, totalSize);
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
              'Content-Range': `bytes */${totalSize}`,
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
                uploadedBytes = parseInt(match[1]) + 1;
                console.log(`Resuming from byte: ${uploadedBytes} after error`);
              }
            }
          }
        } catch (statusError) {
          console.warn('Failed to get upload status, continuing with current position:', statusError);
        }
      }
    }
  }

  private async bufferToStream(buffer: Buffer)  {
    const readable = new Readable();
    readable.push(buffer);
    readable.push(null); // Signal end of stream
    return readable;
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

    async getFileInfo(filePath: string): Promise<FileSystemItem> {
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
            console.error('Error getting file info from Google Drive:', error);
            throw error;
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

  private async getFileSimple(fileId: string, filePath: string, mimeType: string | null | undefined, progressCallback?: (downloaded: number, total: number) => void): Promise<FileContent> {
    try {
      const file = await this.oauth2Client!.request({
        url: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        method: 'GET',
        responseType: 'arraybuffer'
      });
      
      const data = Buffer.from(file.data as ArrayBuffer);

      if (!data || !mimeType) {
        throw new Error('File not found or empty');
      }

      // Update progress after completion
      if (progressCallback) {
        progressCallback(data.length, data.length);
      }

      const fileContent: FileContent = {
        name: filePath.split('/').pop() || '',
        content: data,
        type: mimeType || 'application/octet-stream',
        path: CLOUD_HOME + filePath,
        sourceCloudType: CloudType.GoogleDrive,
        sourceAccountId: this.accountId || null,
      };
      return fileContent;
    } catch (err) {
      console.warn('Binary content download failed, returning file URL:', err);
      let fileUrl = `https://drive.google.com/uc?id=${fileId}`;
      if (mimeType === 'application/vnd.google-apps.document') {
        fileUrl = `https://docs.google.com/document/d/${fileId}/edit`;
      } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
        fileUrl = `https://docs.google.com/spreadsheets/d/${fileId}/edit`;
      }
      console.log('File URL:', fileUrl);
      if (!fileUrl) {
        throw new Error('File URL not found');
      }

      const fileContent: FileContent = {
        name: filePath.split('/').pop() || '',
        url: fileUrl,
        type: mimeType || 'application/octet-stream',
        path: CLOUD_HOME + filePath,
        sourceCloudType: CloudType.GoogleDrive,
        sourceAccountId: this.accountId || null,
      };
      
      return fileContent;
    }
  }

  private async getFileResumable(fileId: string, fileSize: number, progressCallback: (downloaded: number, total: number) => void, abortSignal?: AbortSignal): Promise<Buffer> {
    console.log('Starting resumable download for file:', fileId, 'Size:', fileSize);
    
    try {
      // Download file in chunks
      const data = await this.downloadFileInChunks(fileId, fileSize, progressCallback, abortSignal);
      
      console.log(`Resumable download completed for file: ${fileId}`);
      return data;
    } catch (error) {
      console.error('Resumable download failed:', error);
      throw error;
    }
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
}
