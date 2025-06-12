import { CloudStorage } from './cloudStorage';
import { FileContent, FileSystemItem } from "../../types/fileSystem";
import { Client } from "@microsoft/microsoft-graph-client";
import { CLOUD_HOME, CloudType } from '../../types/cloudType';
import { BrowserWindow } from 'electron';
import { Dropbox } from 'dropbox';
const mime = require('mime-types');
const DROPBOX_APP_KEY = process.env.DROPBOX_KEY;
const REDIRECT_URI = process.env.DROPBOX_REDIRECT_URI; // Default redirect URI

export class DropboxStorage implements CloudStorage {
    accessToken?: string | undefined;
    accountId?: string | undefined;
    userKey?: string | undefined;


    client?: Dropbox | null = null;

    getAccessToken(): string | null {
        return this.accessToken || null;
    }
    async initAccount(accountId: string | null, userKey?: string | null): Promise<void> {
        if (!accountId) {
            console.error('Account ID is required to initialize Dropbox account');
            return;
        }
        if (! userKey) {
            console.error('User key is required to initialize Dropbox account');
            return;
        }
        console.log('Initializing Dropbox account with ID:', accountId, 'and user key:', userKey);
        this.accountId = accountId;
        this.userKey = userKey;
        const response = await fetch('http://localhost:3001/get-new-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                cloudType: CloudType.Dropbox,
                accountId: this.accountId || '',
                userKey: this.userKey || '', // Implement unique key for the account
            }),
        });
        if (!response.ok) {
            console.error('Failed to get new token:', response.statusText);
            throw new Error('Failed to get new token');
        }
        const data = await response.json();
        console.log('Received new token data:', data);
        if (!data.accessToken) {
            console.error('No access token received from server');
            throw new Error('No access token received from server');
        }
        this.accessToken = data.accessToken;
        this.client = new Dropbox({ accessToken: this.accessToken, fetch });
        console.log('Dropbox account initialized successfully:', this.accountId);
        console.log('Dropbox client initialized with access token:', this.accessToken);
    }

    async connect(userKey: string): Promise<void | any> {
        return new Promise((resolve, reject) => {
            const authWindow = new BrowserWindow({
                width: 500,
                height: 600,
                show: true,
                webPreferences: { nodeIntegration: false }
            });

            let handled = false;

            this.userKey = userKey;
            const authUrl = `https://www.dropbox.com/oauth2/authorize?response_type=code&client_id=${DROPBOX_APP_KEY}&redirect_uri=${REDIRECT_URI}&token_access_type=offline&scope=account_info.read files.metadata.read files.metadata.write files.content.read files.content.write`;

            authWindow.loadURL(authUrl);

            authWindow.webContents.on('will-redirect', async (event, url) => {
                const matched = url.match(/[?&]code=([^&]+)/);
                if (matched) {
                    handled = true;
                    const code = matched[1];
                    authWindow.close();
            
                    // Exchange code for access token
                    try {
                        if (!code || !DROPBOX_APP_KEY) {
                        throw new Error('Missing required parameters');
                        }

                        const response = await fetch('http://localhost:3001/connect-new-account', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Accept': 'application/json',
                            },
                            body: JSON.stringify({
                                cloudType: CloudType.Dropbox,
                                authorizationCode: code,
                                userKey: this.userKey || '', 
                            }),
                        });
                        if (!response.ok) {
                            console.error('Failed to connect new account:', response.statusText);
                            throw new Error('Failed to connect new account');
                        }
                        const data = await response.json();
                        this.accessToken = data.accessToken;
                        this.accountId = data.accountId;
                        console.log('Message :', data.message);
                        console.log('Dropbox connected successfully:', this.accountId);
                        resolve({
                            accessToken: this.accessToken,
                            accountId: this.accountId
                        });
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

        if (!this.accessToken || !this.accountId) {
            console.error('accessToken or accountId is not set');
            return;
        }

        const response = await fetch('http://localhost:3001/get-new-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                cloudType: CloudType.Dropbox,
                accountId: this.accountId || '',
                userKey: this.userKey || '', // Implement unique key for the account
            }),
        });
        if (!response.ok) {
            console.error('Failed to get new token:', response.statusText);
            throw new Error('Failed to get new token');
        }
        const data = await response.json();
        console.log('Received new token data:', data);
        if (!data.accessToken) {
            console.error('No access token received from server');
            throw new Error('No access token received from server');
        }
        this.accessToken = data.accessToken;

        try{
            this.client = new Dropbox({ accessToken: this.accessToken, fetch });
        } catch (error) {
            console.error('Failed to set OAuth2 credentials:', error);
            throw new Error('Failed to set OAuth2 credentials');
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
                id: CLOUD_HOME + entry.path_lower, // Use path_lower for unique ID (Dropbox does NOT allow duplicate names)
                name: entry.name,
                isDirectory: entry['.tag'] === 'folder',
                path: CLOUD_HOME + entry.path_lower,
                size: 0, // TODO: Set size if available
                modifiedTime: undefined // TODO: Set modified time if available
            }));
            return fileSystemItems;
        } catch (err) {
            console.error('Failed to list home folder:', err);
            this.client = null; // Reset client on error
            await this.initClient(); // Reinitialize client
            if (!this.client) {
                console.error('Dropbox client is still not initialized after error');
                return [];
            }
            console.error('Retrying to read directory:', dir);
            return this.readDir(dir); // Retry reading the directory
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
    async getFile(filePath: string): Promise<FileContent> {
        await this.initClient();
        if (!this.client) {
            console.error('Dropbox client is not initialized');
            return Promise.reject('Dropbox client is not initialized');
        }
        try {
            console.log('filePath', filePath);
            
            const response = await fetch('https://content.dropboxapi.com/2/files/download', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Dropbox-API-Arg': JSON.stringify({ path: filePath })
                }
            });

            const metadataResponse = await fetch('https://api.dropboxapi.com/2/files/get_metadata', {
                method: 'POST',
                headers: {
                'Authorization': `Bearer ${this.accessToken}`,
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
        } catch (error) {
            console.error('Failed to get file content:', error);
            this.client = null; // Reset client on error
            await this.initClient(); // Reinitialize client
            if (!this.client) {
                console.error('Dropbox client is still not initialized after error');
                return Promise.reject('Dropbox client is not initialized');
            }
            return this.getFile(filePath); // Retry reading the directory
        }
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
                'Authorization': `Bearer ${this.accessToken}`,
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
            console.error('Failed to get file content:', error);
            this.client = null; // Reset client on error
            await this.initClient(); // Reinitialize client
            if (!this.client) {
                console.error('Dropbox client is still not initialized after error');
                return Promise.reject('Dropbox client is not initialized');
            }
            return this.deleteFile(filePath); // Retry deleting the file
        }
    }
}