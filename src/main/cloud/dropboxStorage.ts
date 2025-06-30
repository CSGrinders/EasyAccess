import { CloudStorage,AuthTokens, isValidToken, generateCodes } from './cloudStorage';
import { FileContent, FileSystemItem } from "../../types/fileSystem";
import { Client } from "@microsoft/microsoft-graph-client";
import { CLOUD_HOME, CloudType } from '../../types/cloudType';
import { BrowserWindow, shell } from 'electron';
import { Dropbox } from 'dropbox';
import { v4 as uuidv4 } from 'uuid';
import * as http from 'http';
import fetch from 'node-fetch';

const mime = require('mime-types');
import { minimatch } from 'minimatch';

const DROPBOX_APP_KEY = process.env.DROPBOX_KEY;
// const DROPBOX_APP_SECRET = process.env.DROPBOX_SECRET;
const PORT = 53685; // Port for the local server to handle Dropbox OAuth redirect
const REDIRECT_URI = 'http://localhost:' + PORT;

export class DropboxStorage implements CloudStorage {
    accountId?: string | undefined;
    AuthToken?: AuthTokens | null | undefined;
    currentAuthServer?: http.Server | null = null;

    client?: Dropbox | null = null;

  cancelAuthentication(): void {
    console.log('Cancelling Dropbox authentication');

    if (this.currentAuthServer) {
      this.currentAuthServer.close();
    }

    this.currentAuthServer = null;
    this.AuthToken = null;
    this.client = null;
    this.accountId = undefined;
    console.log('Dropbox authentication cancelled');
  }
  
    // https://dropbox.tech/developers/pkce--what-and-why-
  // local server to handle the OAuth redirect
  // This server listens for the redirect from Google after the user authorizes the app
  private async startAuthServer(): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const reqUrl = new URL(req.url || '', `http://localhost:53683`);
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

      this.currentAuthServer = server;

      // redirect URI for OAuth2...
      server.listen(PORT, () => {
        console.log('Listening for auth redirect on' + REDIRECT_URI);
      });

      // Handle server errors
      server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`Port ${PORT} is already in use. Trying alternative port...`);
          server.close();
          // TODO
          // Implement logic to try another port
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

    async connect(): Promise<void | any> {
        return new Promise(async (resolve, reject) => {
            if (!DROPBOX_APP_KEY) {
                throw new Error('DROPBOX_APP_KEY is not set');
            }

            let handled = false;

            // code verifier and code challenge generation for PKCE
            const { codeVerifier, codeChallenge } = await generateCodes();

            // https://www.dropbox.com/oauth2/authorize?client_id=<APP_KEY>&response_type=code&code_challenge=<CHALLENGE>&code_challenge_method=<METHOD>
            const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${DROPBOX_APP_KEY}&response_type=code&code_challenge=${codeChallenge}&code_challenge_method=S256&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&token_access_type=offline`;
            shell.openExternal(authUrl);

            const code = await this.startAuthServer(); // Get code from redirect
            console.log('Authorization code received:', code);

            // Exchange the authorization code for an access token
            const tokenResponse = await fetch('https://api.dropboxapi.com/oauth2/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    code: code,
                    grant_type: 'authorization_code',
                    client_id: DROPBOX_APP_KEY,
                    redirect_uri: REDIRECT_URI,
                    code_verifier: codeVerifier, // Include the code verifier
                }).toString()
            });
    
            const tokenData = await tokenResponse.json();

            console.log('Token Data:', tokenData);

            // parse the token data and initialize AuthToken and client
            this.AuthToken = {
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token,
                expiry_date: Date.now() + tokenData.expires_in * 1000
            };
            this.client = new Dropbox({ accessToken: tokenData.access_token, fetch });
            console.log('AuthToken Initialized:', this.AuthToken);

            // Get the current account information
            const accountInfo = await this.client.usersGetCurrentAccount();

            this.accountId = accountInfo.result.email;

            console.log(accountInfo.result.email);

            resolve(this.accountId);
        });
    }

    // initialize the Dropbox Client
    async initClient(): Promise<void> {
        if (!this.AuthToken || !this.accountId) {
            console.error('AuthToken or accountId is not set');
            return;
        }

        // if the token is not valid, refresh it and reinitialize the client
        if (this.AuthToken.expiry_date < Date.now()) {
            console.log('AuthToken is expired, refreshing...');
            try {
                if (!this.AuthToken.refresh_token || !DROPBOX_APP_KEY) {
                    throw new Error('Missing required parameters for token refresh');
                }
                
                const tokenResponse = await fetch('https://api.dropboxapi.com/oauth2/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        grant_type: 'refresh_token',
                        client_id: DROPBOX_APP_KEY,
                        refresh_token: this.AuthToken.refresh_token
                    }).toString()
                });
                
                if (!tokenResponse.ok) {
                    throw new Error(`Token refresh failed: ${tokenResponse.status}`);
                }
                
                const tokenData = await tokenResponse.json();
                this.AuthToken = {
                    access_token: tokenData.access_token,
                    refresh_token: tokenData.refresh_token || this.AuthToken.refresh_token, // Keep old refresh token if new one not provided
                    expiry_date: Date.now() + (tokenData.expires_in * 1000)
                };
                this.client = new Dropbox({ accessToken: this.AuthToken.access_token, fetch });
                console.log('AuthToken refreshed:', this.AuthToken);
                return;
            } catch (error) {
                console.error('Failed to refresh token:', error);
                throw new Error('Authentication expired. Please reconnect your account.');
            }
        }

        // check if the client is already initialized, otherwise create a new client
        if (this.client) {
            console.log('Dropbox client already initialized');
        } else {
            this.client = new Dropbox({ accessToken: this.AuthToken.access_token, fetch });
            console.log('Dropbox client created with access token:', this.AuthToken.access_token);
        }
    }

    async readDir(dir: string): Promise<FileSystemItem[]> {
        await this.initClient();
        if (!this.client) {
            console.error('Dropbox client is not initialized');
            return [];
        }
        try {
            if (dir === '/') {
                dir = '';
            } // DROPBOX API HOME
            const response = await this.client.filesListFolder({ path: dir }); 
            const entries = response.result.entries;
        
            const fileSystemItems: FileSystemItem[] = entries.map(entry => ({
                id: uuidv4(), // Generate unique UUID for each item
                name: entry.name,
                isDirectory: entry['.tag'] === 'folder',
                path: CLOUD_HOME + entry.path_lower,
                size: entry['.tag'] === 'file' ? (entry as any).size || 0 : 0,
                modifiedTime: (entry as any).server_modified ? new Date((entry as any).server_modified).getTime() : undefined
            }));
            return fileSystemItems;
        } catch (err) {
            console.error('Failed to list home folder:', err);
        }
        return [];
    }

    async readFile(filePath: string): Promise<string> {
        await this.initClient();
        if (!this.client) {
            console.error('Dropbox client is not initialized');
            return '';
        }
        
        try {
            const fileContent = await this.getFile(filePath);
            if (fileContent.content) {
                return fileContent.content.toString('utf-8');
            } else {
                throw new Error('File content is empty or not available');
            }
        } catch (error) {
            console.error('Error reading file from Dropbox:', error);
            throw error;
        }
    }
    getAccountId(): string {
        return this.accountId || '';
    }
    getAuthToken(): AuthTokens | null {
        return this.AuthToken || null;
    }
    async getFile(filePath: string): Promise<FileContent> {
        await this.initClient();
        if (!this.client) {
            console.error('Dropbox client is not initialized');
            return Promise.reject('Dropbox client is not initialized');
        }
        console.log('filePath', filePath);
        
        const response = await fetch('https://content.dropboxapi.com/2/files/download', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.AuthToken?.access_token}`,
                'Dropbox-API-Arg': JSON.stringify({ path: filePath })
            }
        });

        const metadataResponse = await fetch('https://api.dropboxapi.com/2/files/get_metadata', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.AuthToken?.access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ path: filePath })
        });
    
        const metadata = await metadataResponse.json();
    
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
    
        // Use arrayBuffer() instead of buffer()
        const arrayBuffer = await response.arrayBuffer();

        console.log('metadata', metadata);
        
        const buffer = Buffer.from(arrayBuffer as ArrayBuffer);
        const name = filePath.split('/').pop() || 'file';
        const type = mime.lookup(name) || 'application/octet-stream';
        
        console.log('Buffer:', buffer, name, type);

        if (!buffer) {
            console.error('Buffer is empty');
            return Promise.reject('Buffer is empty');
        }

        const fileContent: FileContent = {
            name: name,
            type: type,
            content: buffer,
            path: CLOUD_HOME + filePath, // prepend the cloud home path
            sourceCloudType: CloudType.Dropbox, // specify the cloud type
            sourceAccountId: this.accountId || null // specify the account ID
        };
        return fileContent;
    }

    async postFile(fileName: string, folderPath: string, type: string, data: Buffer): Promise<void> {
        await this.initClient();
        if (!this.client) {
            console.error('Dropbox client is not initialized');
            return Promise.reject('Dropbox client is not initialized');
        }
        console.log('folderPath: ', folderPath);
        if (folderPath.startsWith('/')) {
            folderPath = folderPath.substring(1); // Remove leading slash if present
        }
    

        /*
        curl -X POST https://content.dropboxapi.com/2/files/upload \
            --header "Authorization: Bearer <get access token>" \
            --header "Dropbox-API-Arg: {\"autorename\":false,\"mode\":\"add\",\"mute\":false,\"path\":\"/Homework/math/Matrices.txt\",\"strict_conflict\":false}" \
            --header "Content-Type: application/octet-stream" \
            --data-binary @local_file.txt
        */

        const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.AuthToken?.access_token}`,
                'Dropbox-API-Arg': JSON.stringify({ path: (folderPath !== '' ? '/' + folderPath : '') + '/' + fileName, mode: 'add', autorename: true, mute: false }),
                'Content-Type': 'application/octet-stream'
            },
            body: data
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Dropbox API error: ${response.status} - ${errorText}`);
        }
    
        console.log(`File "${fileName}" uploaded successfully to "${folderPath}"`);
    }

    async deleteFile(filePath: string): Promise<void> {
        await this.initClient();
        if (!this.client) {
            console.error('Dropbox client is not initialized');
            return Promise.reject('Dropbox client is not initialized');
        }
        try {
            const response = await this.client.filesDeleteV2({ path: filePath });
            console.log(`response`, response);
            console.log(`File "${filePath}" deleted successfully`);
        } catch (error) {
            console.error('Failed to delete file:', error);
            throw error;
        }
    }

    async searchFiles(rootPath: string, pattern: string, excludePatterns: string[]): Promise<FileSystemItem[]> {
        // Not implemented for Dropbox yet
        await this.initClient();
        if (!this.client) {
            console.error('Dropbox client is not initialized');
            return Promise.reject('Dropbox client is not initialized');
        }

        const result: FileSystemItem[] = [];

        try {
            if (rootPath === '/') {
                rootPath = '';
            } // DROPBOX API HOME
            const response = await this.client.filesListFolder({ path: rootPath, recursive: true, include_media_info: false, include_deleted: false }); 
            const entries = response.result.entries;

            console.log('Dropbox search response:', response);
            console.log('Dropbox search entries:', entries);

            for (const entry of entries) {
                try {
                    if (entry['.tag'] === 'file') {
                        const fileName = entry.name;
                        const filePath = entry.path_lower || '';
                        const fileNameCheck = fileName.toLowerCase();
                        const folderNameCheck = filePath.toLowerCase();
                        // Check if the file matches the pattern and does not match any exclude patterns
                        if ((fileNameCheck.includes(pattern.toLowerCase()) || 
                            (pattern.includes("*") && minimatch(fileNameCheck, pattern.toLowerCase(), { dot: true })))
                            && !excludePatterns.some(exclude => fileNameCheck.includes(exclude.toLowerCase()))) {
                            result.push({
                                id: entry.id,
                                name: fileName,
                                isDirectory: false,
                                path: filePath,
                            });
                        }
                    } else if (entry['.tag'] === 'folder') {
                        const folderPath = entry.path_lower || '';
                        const folderNameCheck = folderPath.toLowerCase();
                        // Check if the folder matches the pattern and does not match any exclude patterns
                        if ((folderNameCheck.includes(pattern.toLowerCase()) || pattern.includes("*") && minimatch(folderNameCheck, pattern.toLowerCase(), { dot: true }))
                            && !excludePatterns.some(exclude => folderNameCheck.includes(exclude.toLowerCase()))) {
                            result.push({
                                id: entry.id,
                                name: entry.name,
                                isDirectory: true,
                                path: folderPath,
                            });
                        }
                    }
                } catch (error) {
                    console.error('Error processing entry:', entry, error);
                    console.log('Skipping entry due to error');
                }
            }
        } catch (error) {
            console.error('Error searching Dropbox folder:', error);
        }
        return result;
    }

    async getFileInfo(filePath: string): Promise<FileSystemItem> {
        await this.initClient();
        if (!this.client) {
            console.error('Dropbox client is not initialized');
            throw new Error('Dropbox client is not initialized');
        }

        try {
            const response = await this.client.filesGetMetadata({ path: filePath });
            if (!response.result) {
                throw new Error('File not found');
            }
            const metadata = response.result;

            // Check if file is deleted
            if (metadata['.tag'] === 'deleted') {
                throw new Error('File not found or has been deleted');
            }

            const fileSystemItem: FileSystemItem = {
                id: (metadata as any).id || '',
                name: metadata.name || '',
                isDirectory: metadata['.tag'] === 'folder',
                path: CLOUD_HOME + filePath,
                size: (metadata as any).size || 0,
                modifiedTime: (metadata as any).server_modified ? new Date((metadata as any).server_modified).getTime() : undefined,
            };

            return fileSystemItem;
        } catch (error) {
            console.error('Error getting file info from Dropbox:', error);
            throw error;
        }
    }

    async getDirectoryTree(dir: string): Promise<FileSystemItem[]> {
        await this.initClient();
        if (!this.client) {
            console.error('Dropbox client is not initialized');
            throw new Error('Dropbox client is not initialized');
        }

        const result: FileSystemItem[] = [];

        try {
            await this.buildDirectoryTreeRecursive(dir, result);
            return result;
        } catch (error) {
            console.error('Error getting directory tree from Dropbox:', error);
            throw error;
        }
    }

    private async buildDirectoryTreeRecursive(currentPath: string, result: FileSystemItem[]): Promise<void> {
        try {
            let path = currentPath;
            if (path === '/') {
                path = '';
            }

            const response = await this.client!.filesListFolder({ 
                path: path,
                recursive: true,
                include_media_info: false,
                include_deleted: false
            });
            
            const entries = response.result.entries;

            for (const entry of entries) {
                // Skip deleted files
                if (entry['.tag'] === 'deleted') {
                    continue;
                }

                const fileSystemItem: FileSystemItem = {
                    id: (entry as any).id || '',
                    name: entry.name || '',
                    isDirectory: entry['.tag'] === 'folder',
                    path: CLOUD_HOME + (entry.path_lower || ''),
                    size: (entry as any).size || 0,
                    modifiedTime: (entry as any).server_modified ? new Date((entry as any).server_modified).getTime() : undefined,
                };

                result.push(fileSystemItem);
            }
        } catch (error) {
            console.error('Error building directory tree for Dropbox:', error);
            throw error;
        }
    }

    async createDirectory(dirPath: string): Promise<void> {
        await this.initClient();
        if (!this.client) {
            console.error('Dropbox client is not initialized');
            throw new Error('Dropbox client is not initialized');
        }

        try {
            const normalizedPath = dirPath.startsWith('/') ? dirPath : `/${dirPath}`;
            
            const response = await this.client.filesCreateFolderV2({ 
                path: normalizedPath,
                autorename: false // Don't auto-rename if folder exists
            });
            
            console.log(`Dropbox folder "${normalizedPath}" created successfully:`, response);
        } catch (error: any) {
            // Check if the error is because the folder already exists
            if (error?.error?.error?.['.tag'] === 'path' && 
                error?.error?.error?.path?.['.tag'] === 'conflict') {
                console.log(`Dropbox folder "${dirPath}" already exists`);
                return; 
            }
            
            console.error('Failed to create Dropbox folder:', error);
            throw error;
        }
    }

    async calculateFolderSize(folderPath: string): Promise<number> {
        await this.initClient();
        if (!this.client) {
            console.error('Dropbox client is not initialized');
            throw new Error('Dropbox client is not initialized');
        }

        try {
            return await this.calculateFolderSizeRecursive(folderPath);
        } catch (error) {
            console.error('Error calculating folder size for Dropbox:', error);
            throw error;
        }
    }

    async getDirectoryInfo(dirPath: string): Promise<FileSystemItem> {
        await this.initClient();
        if (!this.client) {
            console.error('Dropbox client is not initialized');
            throw new Error('Dropbox client is not initialized');
        }

        try {
            if (dirPath === '/') {
                dirPath = '';
                const folderSize = await this.calculateFolderSizeRecursive(dirPath);
                return {
                    id: 'home',
                    name: 'home',
                    isDirectory: true,
                    path: '/',
                    size: folderSize || 0,
                    modifiedTime: undefined,
                };
            } // DROPBOX API HOME
            // Dropbox does not allow reading root directory directly, so we need to handle it separately
            const response = await this.client.filesGetMetadata({ path: dirPath });
            const metadata = response.result;

            // Check if directory is deleted
            if (metadata['.tag'] === 'deleted') {
                throw new Error('Directory not found or has been deleted');
            }

            if (metadata['.tag'] !== 'folder') {
                throw new Error('Path is not a directory');
            }

            const folderSize = await this.calculateFolderSizeRecursive(dirPath);

            const fileSystemItem: FileSystemItem = {
                id: (metadata as any).id || '',
                name: metadata.name || '',
                isDirectory: metadata['.tag'] === 'folder',
                path: (metadata.path_lower || ''),
                size: folderSize || 0,
                modifiedTime: (metadata as any).server_modified ? new Date((metadata as any).server_modified).getTime() : undefined,
            };

            return fileSystemItem;
        } catch (error) {
            console.error('Error getting directory info for Dropbox:', error);
            throw error;
        }
    }

    private async calculateFolderSizeRecursive(folderPath: string): Promise<number> {
        try {
            let path = folderPath;
            if (path === '/') {
                path = '';
            }

            console.log(`Calculating size for Dropbox folder: ${path}`);
            
            const response = await this.client!.filesListFolder({ path: path });
            const entries = response.result.entries;

            let totalSize = 0;

            for (const entry of entries) {
                if (entry['.tag'] === 'folder') {
                    // Recursively calculate size for subdirectories
                    const subFolderSize = await this.calculateFolderSizeRecursive(entry.path_lower!);
                    totalSize += subFolderSize;
                } else if (entry['.tag'] === 'file') {
                    // Add file size 
                    const fileSize = (entry as any).size || 0;
                    totalSize += fileSize;
                }
            }

            return totalSize;
        } catch (error) {
            console.error('Error calculating Dropbox folder size:', error);
            throw error;
        }
    }
}