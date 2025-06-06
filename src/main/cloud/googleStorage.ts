import ElectronGoogleOAuth2 from '@getstation/electron-google-oauth2';
import dotenv from 'dotenv';

import { CloudStorage, AuthTokens, isValidToken } from './cloudStorage';
import { saveCloudAccountLocaStorage } from './cloudManager';
import { OAuth2Client } from 'google-auth-library';
import { drive_v3, google } from 'googleapis';
import { FileContent, FileSystemItem } from "../../types/fileSystem";
import { CLOUD_HOME, CloudType } from '../../types/cloudType';
const archiver = require('archiver');
const path = require('path');
import * as fs from 'fs'
const { Readable } = require('stream');
dotenv.config();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_SCOPE = [
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive'
]
const SUCCESS_REDIRECT_URL = 'https://www.alesgsanudoo.com/en'; // TODO: redirect uri...

export class GoogleDriveStorage implements CloudStorage {
  accountId?: string | undefined;
  AuthToken?: AuthTokens | null | undefined;

  async connect(): Promise<void | any> {
    const authTokens = await this.authenticateGoogle();
    if (authTokens) {
      this.AuthToken = authTokens.token;
      this.accountId = authTokens.email; // TODO
      console.log('Google Drive account connected:', this.accountId);
    } else {
      console.error('Failed to authenticate with Google');
    }
  }

  // convert the directory path to a folder ID that is used in the Google Drive API
  private async getFolderId(dir: string): Promise<string> {
    const oauth2Client = await this.getOAuthClient(this.AuthToken as AuthTokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
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
    const oauth2Client = await this.getOAuthClient(this.AuthToken as AuthTokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
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
      const oauth2Client = await this.getOAuthClient(this.AuthToken as AuthTokens);
      const drive = google.drive({ version: 'v3', auth: oauth2Client });
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
            id: file.id || '', // Use file ID as unique identifier (Google allows duplicate names)
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
      const oauth2Client = await this.getOAuthClient(this.AuthToken as AuthTokens);
      const drive = google.drive({ version: 'v3', auth: oauth2Client });

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

  private async authenticateGoogle(): Promise<{ token: AuthTokens, email : string } | null> {
      if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
          throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables");
      }
      const myApiOauth = new ElectronGoogleOAuth2(
          GOOGLE_CLIENT_ID,
          GOOGLE_CLIENT_SECRET,
          GOOGLE_SCOPE,
          { successRedirectURL: SUCCESS_REDIRECT_URL }, // TODO: redirect uri...
      );
      const authToken = await myApiOauth.openAuthWindowAndGetTokens();
      const validatedTokens: AuthTokens = {
          access_token: authToken.access_token || '',
          refresh_token: authToken.refresh_token || '',
          expiry_date: authToken.expiry_date || 0,
      };

      // Check if the token is valid
      if (!isValidToken(validatedTokens)) {
          console.error('Invalid token received from Google OAuth');
          return Promise.resolve(null);
      }

      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({
          access_token: validatedTokens.access_token,
          refresh_token: validatedTokens.refresh_token,
          expiry_date: validatedTokens.expiry_date,
      });

      const userinfo = await google.oauth2({version: 'v2', auth: oauth2Client }).userinfo.get();
      const email = userinfo.data.email;
      if (!email) {
          console.error('Failed to retrieve email from Google UserInfo API');
          return Promise.resolve(null);
      }

      // Return the validated tokens along with the email
      const validatedTokensWithEmail = {
          token: validatedTokens,
          email: email,
      };

      return Promise.resolve(validatedTokensWithEmail);
  }

  private async getOAuthClient({
    access_token,
    refresh_token,
    expiry_date
  }: AuthTokens): Promise<OAuth2Client> {
    const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SUCCESS_REDIRECT_URL);
  
    oauth2Client.setCredentials({
      access_token,
      refresh_token,
      expiry_date,
    });

    const { access_token: newAccessToken, refresh_token: newRefreshToken, expiry_date: newExpiryDate } = oauth2Client.credentials;
    if (!newAccessToken || !newRefreshToken || !newExpiryDate) {
      console.error('Invalid credentials received from Google OAuth');
      throw new Error('Invalid credentials');
    }
    saveCloudAccountLocaStorage(
      CloudType.GoogleDrive,
      this.accountId || '',
      {
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        expiry_date: newExpiryDate,
      }
    );

    console.log('New access token:', newAccessToken);
  
    return oauth2Client;
  }

  async getFile(filePath: string): Promise<FileContent> {
    const oauth2Client = await this.getOAuthClient(this.AuthToken as AuthTokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const fileId = await this.getFileId(filePath);
    try {
      const result = await drive.files.get({
        fileId: fileId,
        fields: 'mimeType'
      });
      const mimeType = result.data.mimeType; // maybe use mimetype from mime-types package?

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
    const straem = await this.bufferToStream(data);
    console.log('Posting file to Google Drive:', fileName, folderPath, type);
    console.log("Data", data);
    const oauth2Client = await this.getOAuthClient(this.AuthToken as AuthTokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
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
        body: straem, 
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
    const oauth2Client = await this.getOAuthClient(this.AuthToken as AuthTokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
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
}
