import ElectronGoogleOAuth2 from '@getstation/electron-google-oauth2';
import dotenv from 'dotenv';

import { CloudStorage, AuthTokens, isValidToken } from './cloudStorage';
import { OAuth2Client } from 'google-auth-library';
import { drive_v3, google } from 'googleapis';
import { FileSystemItem } from "../../types/fileSystem";

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

  async connect(): Promise<void> {
    const authTokens = await this.authenticateGoogle();
    if (authTokens) {
      this.AuthToken = authTokens.token;
      this.accountId = authTokens.email; // TODO
      console.log('Google Drive account connected:', this.accountId);
    } else {
      console.error('Failed to authenticate with Google');
    }
  }

  async readDir(dir: string): Promise<FileSystemItem[]> {
    const allFiles: FileSystemItem[] = [];
    try {
      const oauth2Client = await this.getOAuthClient(this.AuthToken as AuthTokens);
      const drive = google.drive({ version: 'v3', auth: oauth2Client });
      let nextPageToken: string | undefined = undefined;
  
      do {
        const res: { data: drive_v3.Schema$FileList } = await drive.files.list({
          q: `'${dir}' in parents`, // Use folder ID
          pageSize: 1000,
          fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size)',
          pageToken: nextPageToken,
        });
  
        const files = res.data.files || [];
        const mappedFiles: FileSystemItem[] = files.map(file => ({
          name: file.name ?? '',
          isDirectory: file.mimeType === 'application/vnd.google-apps.folder',
          path: file.id ?? '',
          size: file.size ? Number(file.size) : undefined,
          modifiedTime: file.modifiedTime ? new Date(file.modifiedTime).getTime() : undefined,
        }));
  
        allFiles.push(...mappedFiles);
        nextPageToken = res.data.nextPageToken || undefined;
      } while (nextPageToken);
      
      return allFiles;
    } catch (error) {
      console.error('Google Drive API error:', error);
      return [];
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
  
    return oauth2Client;
  }
}