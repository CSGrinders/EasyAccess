import { CloudStorage,AuthTokens, isValidToken } from './cloudStorage';
import { FileContent, FileSystemItem } from "../../types/fileSystem";
import { Client } from "@microsoft/microsoft-graph-client";
import { CLOUD_HOME, CloudType } from '../../types/cloudType';
import { BrowserWindow } from 'electron';
import { Dropbox } from 'dropbox';
const mime = require('mime-types');

const DROPBOX_APP_KEY = process.env.DROPBOX_KEY;
const DROPBOX_APP_SECRET = process.env.DROPBOX_SECRET;
const REDIRECT_URI = 'http://localhost';

export class DropboxStorage implements CloudStorage {
    accountId?: string | undefined;
    AuthToken?: AuthTokens | null | undefined;

    client?: Dropbox | null = null;

    async connect(): Promise<void | any> {
        return new Promise((resolve, reject) => {
            const authWindow = new BrowserWindow({
                width: 500,
                height: 600,
                show: true,
                webPreferences: { nodeIntegration: false }
            });

            let handled = false;
        
            const authUrl = `https://www.dropbox.com/oauth2/authorize?response_type=code&client_id=${DROPBOX_APP_KEY}&redirect_uri=${REDIRECT_URI}&token_access_type=offline`;
        
            authWindow.loadURL(authUrl);
        
            authWindow.webContents.on('will-redirect', async (event, url) => {
                const matched = url.match(/[?&]code=([^&]+)/);
                if (matched) {
                    handled = true;
                    const code = matched[1];
                    authWindow.close();
            
                    // Exchange code for access token
                    try {
                        if (!code || !DROPBOX_APP_KEY || !DROPBOX_APP_SECRET) {
                        throw new Error('Missing required parameters');
                        }

                        const tokenResponse = await fetch('https://api.dropboxapi.com/oauth2/token', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            body: new URLSearchParams({
                            code: code,
                            grant_type: 'authorization_code',
                            client_id: DROPBOX_APP_KEY,
                            client_secret: DROPBOX_APP_SECRET,
                            redirect_uri: REDIRECT_URI
                            }).toString()
                        });
                
                        const tokenData = await tokenResponse.json();

                        this.AuthToken = {
                            access_token: tokenData.access_token,
                            refresh_token: tokenData.refresh_token,
                            expiry_date: Date.now() + tokenData.expires_in * 1000
                        };
                        this.client = new Dropbox({ accessToken: tokenData.access_token, fetch });
                        console.log('Token data:', tokenData);
                        const accountInfo = await this.client.usersGetCurrentAccount();
                        this.accountId = accountInfo.result.email;
                        console.log(accountInfo.result.email); 
                
                        resolve(accountInfo);
                    } catch (error) {
                        console.error('Error exchanging code for token:', error);
                        reject('Dropbox client is not initialized');
                    }
                }
            });
        
            authWindow.on('closed', () => {
                if (!handled) {
                    handled = true;
                    reject('User closed window');
                }
            });
        });
    }

    // initialize the Dropbox Client
    async initClient(): Promise<void> {
        if (this.client)
            return;

        if (!this.AuthToken || !this.accountId) {
            console.error('AuthToken or accountId is not set');
            return;
        }

        if (this.AuthToken.expiry_date < Date.now()) {
            console.log('AuthToken is expired');
            // TODO: refresh token
            this.AuthToken.refresh_token
            if (!this.AuthToken.refresh_token || !DROPBOX_APP_KEY || !DROPBOX_APP_SECRET) {
              throw new Error('Missing required parameters');
            }
            const tokenResponse = await fetch('https://api.dropboxapi.com/oauth2/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: DROPBOX_APP_KEY,
                client_secret: DROPBOX_APP_SECRET,
                refresh_token: this.AuthToken.refresh_token
                }).toString()
            });
            const tokenData = await tokenResponse.json();
            this.AuthToken = {
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token,
                expiry_date: Date.now() + tokenData.expires_in * 1000
            };
        }
        this.client = new Dropbox({ accessToken: this.AuthToken.access_token, fetch });
        console.log('Dropbox client initialized');
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
                name: entry.name,
                isDirectory: entry['.tag'] === 'folder',
                path: CLOUD_HOME + entry.path_lower,
                size: 0, // TODO: Set size if available
                modifiedTime: undefined // TODO: Set modified time if available
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
        throw new Error('Not implemented');
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
                'Dropbox-API-Arg': JSON.stringify({ path: folderPath + '/' + fileName, mode: 'add', autorename: true, mute: false }),
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
}