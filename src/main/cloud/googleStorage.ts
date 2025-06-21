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
const SUCCESS_REDIRECT_URL = 'http://localhost:53682';

export class GoogleDriveStorage implements CloudStorage {
  accountId?: string | undefined;
  AuthToken?: AuthTokens | null | undefined;
  private authCancelled = false;
  private currentOAuthInstance: any = null; 
  private currentAuthUrl: string | null = null; // Store the current auth URL to prevent multiple instances
  private oauth2Client: OAuth2Client | null = null;

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
        q: `'${currentFolderId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder'`,
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
          q: `'${currentFolderId}' in parents and name='${folderName}'`,
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
        q: `'${currentFolderId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder'`,
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
          q: `'${folderId}' in parents`, // Use folder ID
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
    // TODO: Implement readFile for Google Drive
    const allFiles: FileSystemItem[] = [];
    try {
      await this.refreshOAuthClientIfNeeded();
      if (!this.oauth2Client) {
        throw new Error('OAuth2 client is not initialized');
      }
      const drive = google.drive({ version: 'v3', auth: this.oauth2Client });

      const res = await drive.files.get(
        {
          fileId: filePath,
          alt: 'media',
        },
        {
          responseType: 'stream',
        }
      );

      const chunks: Buffer[] = [];
      return new Promise((resolve, reject) => {
        res.data
          .on('data', (chunk) => chunks.push(chunk))
          .on('end', () => resolve(Buffer.concat(chunks).toString()))
          .on('error', (error) => {
            console.error('Error reading file stream:', error);
            reject('');
          });
      });
    } catch (error) {
      console.error('Google Drive API error:', error);
      return '';
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
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const reqUrl = new URL(req.url || '', `http://localhost:53682`);
        const code = reqUrl.searchParams.get('code');

        if (code) {
          res.end('Authorization successful! You can close this window.');
          server.close();
          resolve(code);
        } else {
          res.end('Authorization failed. No code received.');
          server.close();
          reject(new Error('No authorization code found'));
        }
      });

      // redirect URI for OAuth2...
      server.listen(53682, () => {
        console.log('Listening for auth redirect on http://localhost:53682');
      });
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

  async getFile(filePath: string): Promise<FileContent> {
    await this.refreshOAuthClientIfNeeded();
    if (!this.oauth2Client) {
      throw new Error('OAuth2 client is not initialized');
    }
    const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
    const fileId = await this.getFileId(filePath);
    try {
      const result = await drive.files.get({
        fileId: fileId,
        fields: 'mimeType'
      });
      const mimeType = result.data.mimeType; 

      try {
        const file = await drive.files.get(
          {
            fileId: fileId,
            alt: 'media',
          }, 
          { responseType: 'arraybuffer' }
        );
        const data = Buffer.from(file.data as ArrayBuffer)

        if (!data || !mimeType) {
          throw new Error('File not found or empty');
        }

        const fileContent: FileContent = {
          name: filePath.split('/').pop() || '',
          content: data,
          type: mimeType, // TODO: get the correct mime type
          path: CLOUD_HOME + filePath, // prepend the cloud home path
          sourceCloudType: CloudType.GoogleDrive,
          sourceAccountId: this.accountId || null, // Optional cloud type if the file is from a cloud storage
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
          type: mimeType || 'application/octet-stream', // default to binary if no mime type found
          path: CLOUD_HOME + filePath, // Path to the file in the source file system
          sourceCloudType: CloudType.GoogleDrive,
          sourceAccountId: this.accountId || null, // Optional cloud type if the file is from a cloud storage
        };
        
        // Return the file content with URL
        return fileContent;
      }
    } catch (err) {
      throw err;
    }
  }

  async postFile(fileName: string, folderPath: string, type: string, data: Buffer): Promise<void> {
    const stream = await this.bufferToStream(data);
    console.log('Posting file to Google Drive:', fileName, folderPath, type);
    console.log("Data", data);
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
  
    console.log(`Uploaded file ID: ${res.data.id}`);
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
          q: `'${currentParentId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder'`,
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
        q: `'${folderId}' in parents`,
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
}
