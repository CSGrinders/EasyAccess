import { CloudStorage,AuthTokens, isValidToken, generateCodes } from './cloudStorage';
import { FileContent, FileSystemItem } from "../../types/fileSystem";
import { Client } from "@microsoft/microsoft-graph-client";
import { CLOUD_HOME, CloudType, StorageError } from '../../types/cloudType';
import { BrowserWindow, shell } from 'electron';
import { Dropbox } from 'dropbox';
import { v4 as uuidv4 } from 'uuid';
import * as http from 'http';
import { promises as fs } from 'fs';

const mime = require('mime-types');
import { minimatch } from 'minimatch';
import { progressCallbackData } from '@Types/transfer';
import path from 'path';

const DROPBOX_APP_KEY = process.env.DROPBOX_KEY;
// const DROPBOX_APP_SECRET = process.env.DROPBOX_SECRET;
const PORT = 53685; // Port for the local server to handle Dropbox OAuth redirect
const REDIRECT_URI = 'http://localhost:' + PORT;

import { Semaphore } from '../transfer/transferManager';

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
    async getFile(filePath: string, progressCallback?: (downloaded: number, total: number) => void, abortSignal?: AbortSignal): Promise<FileContent> {
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
            },
            signal: abortSignal
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

        // Update progress after completion
        if (progressCallback) {
            progressCallback(buffer.length, buffer.length);
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

    async postFile(fileName: string, folderPath: string, type: string, data: Buffer, progressCallback?: (uploaded: number, total: number) => void, abortSignal?: AbortSignal): Promise<void> {
        await this.initClient();
        if (!this.client) {
            console.error('Dropbox client is not initialized');
            return Promise.reject('Dropbox client is not initialized');
        }
        
        // Check for cancellation before upload
        if (abortSignal?.aborted) {
            console.log('Upload cancelled by user');
            throw new Error('Upload cancelled by user');
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
            body: data,
            signal: abortSignal
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Dropbox API error: ${response.status} - ${errorText}`);
        }
        
        // Report progress completion
        if (progressCallback) {
            progressCallback(data.length, data.length);
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

    async isDirectory(filePath: string): Promise<boolean> {
        await this.initClient();
        if (!this.client) {
            console.error('Dropbox client is not initialized');
            throw new Error('Dropbox client is not initialized');
        }

        try {
            const response = await this.client.filesGetMetadata({ path: filePath });
            const metadata = response.result;

            // Check if file is deleted
            if (metadata['.tag'] === 'deleted') {
                throw new Error('File not found or has been deleted');
            }

            return metadata['.tag'] === 'folder';
        } catch (error) {
            console.error('Error checking if path is a directory in Dropbox:', error);
            return false;
        }
    }

    async getItemInfo(filePath: string): Promise<FileSystemItem> {
        await this.initClient();
        if (!this.client) {
            console.error('Dropbox client is not initialized');
            throw new Error('Dropbox client is not initialized');
        }

        try {
            const response = await this.client.filesGetMetadata({ path: filePath });
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

            const err: StorageError = {
                status: error.status || 500,
                message: `Failed to create Dropbox folder: ${error.message || 'Unknown error'}`,
                body: error.response ? await error.response.text() : undefined
            };

            console.error('Failed to create Dropbox folder:', err);
            return Promise.reject(err);
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

    /*
        * Transfers a file or directory from local storage to Dropbox using resumable upload.
        * @param fileInfo - Information about the file or directory to transfer
        * @param progressCallback - Optional callback to report progress
        * @param abortSignal - Optional AbortSignal to cancel the transfer
        * @returns Promise<void>
        * @throws Error if OAuth2 client is not initialized or transfer fails
    */
    async transferLocalToCloud(fileInfo: any, progressCallback?: (data: progressCallbackData) => void, abortSignal?: AbortSignal): Promise<void> {
        await this.initClient();
        if (!this.client) {
            console.error('Dropbox client is not initialized');
            throw new Error('Dropbox client is not initialized');
        }

        const {transferId, fileName, sourcePath, type, targetCloudType, targetAccountId, targetPath} = fileInfo;
        

        const parentFolderPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;

        // Get file size from local file 
        const fileStats = await fs.stat(sourcePath)
        const fileSize = fileStats.size;

        //Check if it's a directory, then we will handle it separetely
        if (fileStats.isDirectory()) {
            console.log('Starting resumeable upload for directory:', fileName, 'Size:', fileSize, 'Parent folder path:', parentFolderPath);
            await this.transferDirectoryToCloud(transferId, fileName, sourcePath, parentFolderPath, progressCallback, abortSignal);
            return;
        }


        // Handle resumable for files
        console.log('Starting resumable upload for file:', fileName, 'Size:', fileSize, 'Parent folder path:', parentFolderPath);

        try {
            // Initialize resumable upload session
            const sessionId = await this.initiateResumableUpload(fileName, type, parentFolderPath);
            console.log('Resumable upload session initiated:', sessionId);

            // Upload file in chunks
            await this.uploadFileInChunks(transferId, fileName, sessionId, sourcePath, fileSize, parentFolderPath, progressCallback, abortSignal, false);

            console.log(`Resumable upload completed for file: ${fileName}`);
        } catch (error) {
            console.error('Resumable upload failed:', error);
            throw error;
        }
    }

    /*
    * Transfers a directory from local storage to Dropbox.
    * @param transferId - Unique identifier for the transfer operation
    * @param dirName - Name of the directory to create in Dropbox
    * @param sourcePath - Local path of the directory to transfer
    * @param parentFolderPath - ID of the parent folder in Dropbox where the directory will be created
    * @param progressCallback - Optional callback to report progress
    * @param abortSignal - Optional AbortSignal to cancel the transfer
    * @returns Promise<void>
    * @throws Error if OAuth2 client is not initialized or directory creation fails
    * @description This method creates a new directory in Dropbox and transfers its contents recursively.
    * It handles both files and subdirectories, creating corresponding folders in Dropbox.
    */
    private async transferDirectoryToCloud(transferId: string, dirName: string, sourcePath: string, parentFolderPath: string, progressCallback?: (data: progressCallbackData) => void, abortSignal?: AbortSignal): Promise<void> {
        await this.initClient();
        if (!this.client) {
            console.error('Dropbox client is not initialized');
            throw new Error('Dropbox client is not initialized');
        }

        console.log('Transferring directory:', dirName, 'from source path:', sourcePath, 'to parent folder path:', parentFolderPath);
        const targetFolderPath = path.join(parentFolderPath, dirName);
        await this.createDirectory(targetFolderPath);
        console.log('Directory created:', targetFolderPath);

        await this.transferDirectoryContentsResumable(transferId, sourcePath, targetFolderPath, progressCallback, abortSignal);
    }


    /*
    * Transfers the contents of a directory to Dropbox using resumable upload.
    * @param transferId - Unique identifier for the transfer operation
    * @param sourcePath - Local path of the directory to transfer
    * @param targetFolderPath - Path of the target folder in Dropbox where the contents will be transferred
    * @param progressCallback - Optional callback to report progress
    * @param abortSignal - Optional AbortSignal to cancel the transfer
    * @returns Promise<void>
    * @throws Error if OAuth2 client is not initialized or transfer fails
    * This method recursively processes each item in the directory, creating subdirectories in Dropbox as needed.
    * It handles both files and subdirectories, uploading files in chunks for large files.
    * If an error occurs during processing, it logs the error and continues with the next item.
    */
    private async transferDirectoryContentsResumable(
        transferId: string,
        sourcePath: string,
        targetFolderPath: string,
        progressCallback?: (data: progressCallbackData) => void,
        abortSignal?: AbortSignal
    ): Promise<void> {
        await this.initClient();
        if (!this.client) {
            console.error('Dropbox client is not initialized');
            throw new Error('Dropbox client is not initialized');
        }

        const items = await fs.readdir(sourcePath, { withFileTypes: true });

        const semaphore = new Semaphore(3); // Max 3 concurrent transfers

        const transferPromises = items.map(async (item) => {
            await semaphore.acquire();

            if (abortSignal?.aborted) {
                console.log('Transfer cancelled by user');
                throw new Error('Transfer cancelled by user');
            }

            const itemPath = path.join(sourcePath, item.name);
            if (item.isDirectory()) {
                try {
                    console.log(`Transferring directory: ${item.name} to ${targetFolderPath}`);
                    const newTargetFolderPath = path.join(targetFolderPath, item.name);
                    await this.createDirectory(newTargetFolderPath);
                    console.log(`Directory created: ${newTargetFolderPath}`);
                    progressCallback?.({
                        transferId,
                        fileName: item.name,
                        sourcePath,
                        transfered: 0,
                        total: 0, 
                        isDirectory: false,
                        isFetching: true 
                    });
                    
                    await this.transferDirectoryContentsResumable(transferId, itemPath, newTargetFolderPath, progressCallback, abortSignal);
                } catch (error: any) {
                    if (abortSignal?.aborted || 
                        error?.error?.code === 'itemNotFound' || 
                        error?.code === 'itemNotFound' ||
                        error?.message?.includes('cancelled') ||
                        error?.message?.includes('aborted') ||
                        error?.name === 'AbortError') {
                        console.log('Transfer cancelled by user');
                        throw new Error('Transfer cancelled by user');
                    }
                    console.error(`Failed to process directory ${item.name}:`, error);
                    // Extract error message
                    const parts = error instanceof Error ? error.message.split(':') : ["Transfer failed"];
                    let errorMessage = parts[parts.length - 1].trim() + ". Continueing with next file...";
                    if (errorMessage.toLowerCase().includes('permission')) {
                        errorMessage = "You don't have permission to access this file or folder.";
                    } else if (errorMessage.toLowerCase().includes('quota')) {
                        errorMessage = "Dropbox storage quota exceeded.";
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
                        sourcePath,
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
                }
            } else if (item.isFile()) {
                try {
                    progressCallback?.({
                        transferId,
                        fileName: item.name,
                        sourcePath,
                        transfered: 0,
                        total: 0, 
                        isDirectory: true,
                        isFetching: true 
                    });
                    console.log(`Transferring file: ${item.name} to target path: ${targetFolderPath}/${item.name}`);
                    const fileStats = await fs.stat(itemPath);
                    const fileSize = fileStats.size;
                    const type = mime.lookup(item.name) || 'application/octet-stream';

                    // await this.uploadFile(transferId, item.name, itemPath, targetPath, type, progressCallback, abortSignal);

                    const sessionId = await this.initiateResumableUpload( item.name, type, targetFolderPath);
                    await this.uploadFileInChunks(transferId, item.name, sessionId, itemPath, fileSize, targetFolderPath, progressCallback, abortSignal, true);

                    console.log(`File ${item.name} transferred successfully to ${targetFolderPath}/${item.name}`);
                } catch (error: any) {
                    if (abortSignal?.aborted || 
                        error?.error?.code === 'itemNotFound' || 
                        error?.code === 'itemNotFound' ||
                        error?.message?.includes('cancelled') ||
                        error?.message?.includes('aborted') ||
                        error?.name === 'AbortError') {
                        console.log('Transfer cancelled by user');
                        throw new Error('Transfer cancelled by user');
                    }
                    console.error(`Failed to process file ${item.name}:`, error);
                    // Extract error message
                    const parts = error instanceof Error ? error.message.split(':') : ["Transfer failed"];
                    let errorMessage = parts[parts.length - 1].trim() + ". Continuing with next file...";
                    if (errorMessage.toLowerCase().includes('permission')) {
                        errorMessage = "You don't have permission to access this file or folder.";
                    } else if (errorMessage.toLowerCase().includes('quota')) {
                        errorMessage = "Dropbox storage quota exceeded.";
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
                        sourcePath,
                        transfered: 0,
                        total: 0,
                        isDirectory: false,
                        isFetching: true,
                        errorItemDirectory: `Failed to process directory ${item.name}: ${errorMessage}`
                    });

                    // Wait 5 seconds before continuing with the next item
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    console.log(`Continuing with next item after error: ${errorMessage}`);
                    // Skip this file and continue with the next item
            } finally {
                // Always release semaphore
                semaphore.release();
            }
        }})
        await Promise.all(transferPromises);
        console.log(`All items in directory ${sourcePath} transferred successfully to ${targetFolderPath}`);
    }

    /*
    * Initiates a resumable upload session for a file in Dropbox.
    * @returns Promise<string> - The session ID for resumable upload session
    */
    async initiateResumableUpload(fileName: string, mimeType: string, parentFolderPath: string): Promise<string> {
        // Implementation for initiating a resumable upload
        const res = await fetch('https://content.dropboxapi.com/2/files/upload_session/start', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.AuthToken?.access_token}`,
                    'Content-Type': 'application/octet-stream',
                    'Dropbox-API-Arg': JSON.stringify({ close: false }),
                },
            });
        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Failed to initiate resumable upload: ${res.status} - ${errorText}`);
        }
        
        const sessionData = await res.json();
        const sessionId = sessionData.session_id;

        console.log(`Resumable upload session initiated with ID: ${sessionId}`);

        return sessionId;
    }

    /*
    * Uploads a file in chunks to Dropbox using resumable upload.
    * @param transferId - Unique identifier for the transfer operation
    * @param filename - Name of the file being uploaded
    * @param sessionId - ID for resumable upload session
    * @param sourcePath - Local path of the file to upload
    * @param fileSize - Size of the file in bytes
    * @param parentFolderPath - Path of the parent folder in Dropbox where the file will be uploaded
    * @param progressCallback - Optional callback to report progress
    * @param abortSignal - Optional AbortSignal to cancel the transfer
    * @param isDirectory - Optional flag indicating if the upload is for a directory (default: false)
    * @returns Promise<void>
    * @throws Error if upload fails or is cancelled
    * @description This method reads the file in chunks and uploads each chunk to Dropbox.
    * It handles resumable uploads, retries on failure, and reports progress through the callback.
    * The chunk size is determined based on the file size to optimize upload performance.
    */
    private async uploadFileInChunks(transferId: string, filename: string, sessionId: string, sourcePath: string, fileSize: number, parentFolderPath: string, progressCallback?: (data: progressCallbackData) => void, abortSignal?: AbortSignal, isDirectory?: boolean): Promise<void> {
        // Implementation for uploading a file in chunks
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
                    const response = await fetch('https://content.dropboxapi.com/2/files/upload_session/append_v2', {
                        method: 'POST',
                        headers: {
                        'Authorization': `Bearer ${this.AuthToken?.access_token}`,
                        'Dropbox-API-Arg': JSON.stringify({
                            cursor: {
                                session_id: sessionId,
                                offset: TransferedBytes,
                            },
                            close: false,
                        }),
                        'Content-Type': 'application/octet-stream',
                        },
                        body: chunkData, // or stream if file is large
                        signal: abortSignal,
                    });
                

                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`Failed to upload chunk: ${response.status} - ${errorText}`);
                    }

                    console.log(`Chunk uploaded successfully: ${chunkStart}-${chunkEnd}/${fileSize - 1}`);

                    TransferedBytes = chunkEnd + 1;


                    if (progressCallback) {
                        progressCallback({
                            transferId,
                            fileName: filename,
                            sourcePath,
                            transfered: TransferedBytes,
                            total: fileSize,
                            isDirectory: isDirectory || false,
                            isFetching: false
                        });
                    }

                    if (TransferedBytes >= fileSize) {
                        // Check for cancellation before finalization
                        if (abortSignal?.aborted) {
                            console.log('Transfer cancelled by user during finalization');
                            throw new Error('Transfer cancelled by user');
                        }
                        // Finalize the upload session
                        const closeResponse = await fetch('https://content.dropboxapi.com/2/files/upload_session/finish', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${this.AuthToken?.access_token}`,
                                'Dropbox-API-Arg': JSON.stringify({
                                    commit: {
                                        autorename: true,
                                        mode: "add",
                                        mute: false,
                                        path: path.join(parentFolderPath, filename),
                                        strict_conflict: false
                                    },
                                    cursor: {
                                        offset: fileSize,
                                        session_id: sessionId
                                    }
                                }),
                                'Content-Type': 'application/octet-stream',
                            },
                            signal: abortSignal,
                        });

                        if (!closeResponse.ok) {
                            const errorText = await closeResponse.text();
                            throw new Error(`Failed to finalize upload session: ${closeResponse.status} - ${errorText}`);
                        }

                        if (progressCallback) {
                            progressCallback({transferId, fileName: filename, sourcePath, transfered: fileSize, total: fileSize, isDirectory: (isDirectory || false)});
                        }

                        console.log(`Upload session finalized successfully for file: ${filename}`);
                        return;
                    }
                    
                    retryCount = 0; // Reset retry count on success
                } catch (error: any) {

                    if (error.name === 'AbortError' || abortSignal?.aborted) {
                        console.log('Transfer cancelled by user');
                        throw new Error('Transfer cancelled by user');
                    }
                    retryCount++;
                    console.error(`Chunk upload error (attempt ${retryCount}/${MAX_RETRIES}):`, error);
                    
                    if (retryCount >= MAX_RETRIES) {
                        throw new Error(`Upload failed after ${MAX_RETRIES} attempts: ${error}`);
                    }
                    
                    // Wait before retry
                    const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
                    console.log(`Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    
                    // skip the checking where it failed and continue with the next chunk
                }
            }
        } catch (error: any) {
            console.error(`Error during chunked upload: ${error}`);
            if (error.message?.includes('cancelled') || error.name === 'AbortError') {
                throw error;
            }
            throw new Error(`Upload failed: ${error.message}`);
        } finally {
            if (fileHandle) {
                await fileHandle.close();
            }
        }
    }

  async downloadInChunks(filePath: string, fileSize: number, chunkSize?: number, maxQueueSize?: number, abortSignal?: AbortSignal): Promise<ReadableStream> {
        await this.initClient();
        if (!this.client) {
            console.error('Dropbox client is not initialized');
            throw new Error('Dropbox client is not initialized');
        }

        chunkSize = chunkSize || 32 * 1024 * 1024; // Default to 4MB if not provided
        maxQueueSize = maxQueueSize || 10 * 32 * 1024 * 1024; // Default to 100 if not provided


        let currentPosition = 0;
        let retryCount = 0;
        let isStreamClosed = false;
        const MAX_RETRIES = 3;

        const accessToken = this.AuthToken?.access_token;

        const response = await fetch("https://api.dropboxapi.com/2/files/get_temporary_link", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                path: filePath
            }),
            signal: abortSignal,
        });
        const { link: tempLink } = await response.json();

        if (!tempLink) {
            throw new Error('Failed to get temporary link for file: ' + filePath);
        }

        console.log(`Temporary link for file ${filePath}: ${tempLink}`);


        // Create a ReadableStream that downloads the file in chunks
        const stream = new ReadableStream({
            async start(controller) {
                // Stream started
                if (abortSignal?.aborted) {
                    console.log('Download cancelled during pull');
                    controller.error(new Error('Download cancelled by user'));
                    return;
                }
                console.log('Dropbox read stream started');
            },

            async pull(controller) {
                if (abortSignal?.aborted) {
                    console.log('Download cancelled during pull');
                    controller.error(new Error('Download cancelled by user'));
                    return;
                }
                if (isStreamClosed) {
                    console.log('Stream is already closed, no more data to pull');
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
                // Not used, but can be useful in the future
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

                console.log(`Pulling chunk from position ${currentPosition} with size ${chunkSize}`);

                try {
                    const endPosition = Math.min(currentPosition + chunkSize - 1, fileSize - 1);

                    const res = await fetch(tempLink, {
                        method: 'GET',
                        headers: {
                            Range: `bytes=${currentPosition}-${endPosition}`,
                        }, 
                        signal: abortSignal,
                    });

                    if (!res.ok) {
                        const errorText = await res.text();
                        throw new Error(`Failed to download chunk: ${res.status} - ${errorText}`);
                    }

                    console.log(`Chunk pulled successfully: ${currentPosition}-${endPosition}/${fileSize - 1}`);

                    const chunkData = Buffer.from(await res.arrayBuffer());
                    controller.enqueue(chunkData);
                    currentPosition += chunkSize;
                    retryCount = 0;
                } catch (error: any) {
                    if (abortSignal?.aborted || error.name === 'AbortError') {
                        console.log('Download cancelled during fetch');
                        controller.error(new Error('Download cancelled by user'));
                        return;
                    }
                    // retry logic TODO
                    console.error(`Error pulling chunk: ${error}`);
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

            async cancel() {
                console.log('Cancelling Dropbox read stream');
                isStreamClosed = true;
            }
        }, {
            highWaterMark: maxQueueSize,
        });

        return stream;
    }

  async cloudToCloudUploadChunk(transferId: string, fileName: string, sourcePath: string, sessionId: string, chunk: Buffer, offset: number, totalSize: number, progressCallback?: (data: progressCallbackData) => void, isDirectory?: boolean, abortSignal?: AbortSignal): Promise<void> {
    
    console.log(`Uploading chunk for session ID: ${sessionId}, offset: ${offset}, size: ${chunk.length}`);
    await this.initClient();
    if (!this.client) {
        console.error('Dropbox client is not initialized');
        throw new Error('Dropbox client is not initialized');
    }

    if (abortSignal?.aborted) {
        console.log('Upload cancelled by user');
        throw new Error('Upload cancelled by user');
    }
    try {
        const response = await fetch('https://content.dropboxapi.com/2/files/upload_session/append_v2', {
                method: 'POST',
                headers: {
                'Authorization': `Bearer ${this.AuthToken?.access_token}`,
                'Dropbox-API-Arg': JSON.stringify({
                    cursor: {
                        session_id: sessionId,
                        offset: offset,
                    },
                    close: false,
                }),
                'Content-Type': 'application/octet-stream',
                },
                body: chunk, 
                signal: abortSignal,
            });

            if (!response.ok) {
                const errorText = await response.text();
                const err: StorageError = {
                    status: response.status,
                    message: `Failed to upload chunk: ${response.status} - ${errorText}`,
                    body: errorText
                };
                return Promise.reject(err);
            }
            if (progressCallback) {
                progressCallback({transferId, fileName, sourcePath, transfered: offset + chunk.length - 1, total: totalSize, isDirectory: (isDirectory || false)});
            }
            console.log(`Chunk uploaded successfully: ${offset}-${offset + chunk.length - 1}/${totalSize}`);
        } catch (error: any) {
            console.error(`Error during chunked upload: ${error}`);
            if (error.message?.includes('cancelled') || error.name === 'AbortError') {
                throw error;
            }
            const err: StorageError = {
            status: error.status || 500,
            message: `Failed to upload chunk: ${error.message}`,
            body: error.response?.data || error.message || 'No additional details available'
            };
            console.error('Error uploading chunk:', error);
            return Promise.reject(err);
        }
    }


    // Dropbox requires to send the sessionId and targetFilePath to api to finalize the upload session
    async finishResumableUpload(transferId: string, fileName: string, sourcePath: string, sessionId: string, targetFilePath: string, fileSize: number, progressCallback?: (data: progressCallbackData) => void, isDirectory?: boolean, abortSignal?: AbortSignal): Promise<void> {
        try {
            // ensure starts with a slash: specific to dropbox...
            if (!targetFilePath.startsWith('/')) {
                targetFilePath = '/' + targetFilePath;
            }

            if (abortSignal?.aborted) {
                console.log('Transfer cancelled by user during finalization');
                throw new Error('Transfer cancelled by user');
            }
            const closeResponse = await fetch('https://content.dropboxapi.com/2/files/upload_session/finish', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.AuthToken?.access_token}`,
                    'Dropbox-API-Arg': JSON.stringify({
                        commit: {
                            autorename: true,
                            mode: "add",
                            mute: false,
                            path: targetFilePath,
                            strict_conflict: false
                        },
                        cursor: {
                            offset: fileSize,
                            session_id: sessionId
                        }
                    }),
                    'Content-Type': 'application/octet-stream',
                },
                signal: abortSignal,
            });

            if (!closeResponse.ok) {
                const errorText = await closeResponse.text();
                const err: StorageError = {
                    status: closeResponse.status,
                    message: `Failed to finalize upload session: ${errorText}`,
                    body: errorText
                };
                return Promise.reject(err);
            }

            if (progressCallback) {
                progressCallback({transferId, fileName, sourcePath, transfered: fileSize, total: fileSize, isDirectory: (isDirectory || false)});
            }

            console.log(`Upload session finalized successfully for file: ${targetFilePath}`);
        } catch (error: any) {
            console.error(`Error during chunked upload: ${error}`);
            if (error.message?.includes('cancelled') || error.name === 'AbortError') {
                throw error;
            }
            throw new Error(`Upload failed: ${error.message}`);
        }
    }              

    async moveOrCopyItem(transferId: string, sourcePath: string, targetPath: string, itemName: string, copy: boolean, progressCallback?: (data: progressCallbackData) => void, abortSignal?: AbortSignal): Promise<void> {
        await this.initClient();
        if (!this.client) {
            console.error('Dropbox client is not initialized');
            throw new Error('Dropbox client is not initialized');
        }

        if (abortSignal?.aborted) {
            console.log('Transfer cancelled by user during finalization');
            throw new Error('Transfer cancelled by user');
        }

        let response;
        const body = JSON.stringify({
                    from_path: sourcePath,
                    to_path: `${targetPath}/${itemName}`,
                    allow_shared_folder: false,
                    autorename: true,
                });
        console.log(`body: ${body}`);
        progressCallback?.({
            transferId,
            fileName: itemName,
            sourcePath,
            transfered: 0,
            total: 1, 
            isDirectory: false,
            isFetching: false 
        });
        if (copy) {
            response = await fetch('https://api.dropboxapi.com/2/files/copy_v2', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.AuthToken?.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: body,
                signal: abortSignal,
            });
        } else {
            // Move the item using the Dropbox API
            response = await fetch('https://api.dropboxapi.com/2/files/move_v2', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.AuthToken?.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: body,
                signal: abortSignal,
            });
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to move item: ${response.status} - ${errorText}`);
        }

        progressCallback?.({
            transferId,
            fileName: itemName,
            sourcePath,
            transfered: 1,
            total: 1, 
            isDirectory: false,
            isFetching: false 
        });

        console.log(`Item moved successfully: ${sourcePath}/${itemName} to ${targetPath}/${itemName}`);
    }
}