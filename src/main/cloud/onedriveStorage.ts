import { CloudStorage,AuthTokens, isValidToken } from './cloudStorage';
import { FileContent, FileSystemItem } from "../../types/fileSystem";
import { Client } from "@microsoft/microsoft-graph-client";
import { CLOUD_HOME, CloudType } from '../../types/cloudType';
import { file } from 'googleapis/build/src/apis/file';
const {
  DataProtectionScope,
  Environment,
  PersistenceCreator,
  PersistenceCachePlugin,
} = require("@azure/msal-node-extensions");
const path = require('path');
const { PublicClientApplication, InteractionRequiredAuthError, LogLevel } = require('@azure/msal-node');
const { shell } = require('electron');
const MSAL_CONFIG = {
  auth: {
      clientId: "004dc6b9-b486-4575-a22d-e6ec9b3435b0",
      authority: "https://login.microsoftonline.com/common",
  },
};

/*

  Before calling api, need to check if client is authenticated. Pull the client from the cache with the accountId

*/
export class OneDriveStorage implements CloudStorage {
  accountId?: string | undefined;
  AuthToken?: AuthTokens | null | undefined;

  client?: typeof PublicClientApplication | null = null; // MSAL client that manage multiple accounts
  graphClient?: any; // Graph client for OneDrive / Need for file operations

  account: any; // an account for this storage

  constructor() {
    this.initClient();
  }

  // load public client application which can access all stored accounts with persistence
  async initClient(): Promise<void> {
    // You can use the helper functions provided through the Environment class to construct your cache path
    // The helper functions provide consistent implementations across Windows, Mac and Linux.
    
    let cachePath;
    if (process.platform === 'win32') {
      cachePath = path.join(process.env.LOCALAPPDATA || '', './msal-cache.json');
    } else if (process.platform === 'darwin') {
      cachePath = path.join(process.env.HOME || '', './Library/Application Support/EasyAccess/msal-cache.json');
    } else {
      // Linux
      cachePath = path.join(process.env.HOME || '', './.config/EasyAccess/msal-cache.json');
    }

    const persistenceConfig = {
      cachePath,
      dataProtectionScope: DataProtectionScope.CurrentUser,
      serviceName: "EasyAccess",
      accountName: "ElectronApp",
      usePlaintextFileOnLinux: true,
    };

      // Initialize MSAL persistence
    const persistence = await PersistenceCreator.createPersistence(persistenceConfig);

    // TODO: Implement Onedrive authentication
    const msalConfig = {
      ...MSAL_CONFIG,
      cache: {
        cachePlugin: new PersistenceCachePlugin(persistence),
      },
    };
    this.client = new PublicClientApplication(msalConfig);
  }

  // initialize the account if the account id is set (loaded from the local storage ==> initialize the client & account for api calls)
  // initialize the graph client with the account access token
  async initAccount(): Promise<any> {
    if (!this.client) {
      await this.initClient();
    }

    if (this.accountId) {
      const accounts = await this.client.getAllAccounts();
      const account = accounts.find((acc: any) => acc.username === this.accountId);
      if (account) {
        this.account = account;
        const response = await this.client.acquireTokenSilent({
          account: this.account,
          scopes: [
            'User.Read',
            'Files.ReadWrite',
            'Files.ReadWrite.All',
            'Sites.ReadWrite.All',
            'offline_access'
          ],
        });
      
        const accessToken = response.accessToken;
        this.graphClient = Client.init({
          authProvider: (done) => {
            done(null, accessToken);
          },
        });
        console.log('Graph client initialized with account:', this.accountId);
        console.log('Graph client with access token:', accessToken);
        console.log('Graph client:', this.graphClient);
        return account;
      } else {
        console.error('Account not found in cache');
      }
    } else {
      console.error('Account ID is not set for the storage');
    }

    await this.connect(); // try with interactive login if account is not found
    return this.account;
  }

  async connect(): Promise<void | any> {
    if (!this.client) {
      await this.initClient();
    }

    if (!this.client) {
      console.error('MSAL client is not initialized');
      return;
    }
    
    const tokenRequest = {
      scopes: [
        'User.Read',
        'Files.ReadWrite',
        'Files.ReadWrite.All',
        'Sites.ReadWrite.All',
        'offline_access'
      ]
    };

    try {
      const openBrowser = async (url: any) => {
          await shell.openExternal(url);
      };

      const authResponse = await this.client.acquireTokenInteractive({
          ...tokenRequest,
          openBrowser,
          successTemplate: '<h1>Successfully signed in!</h1> <p>You can close this window now.</p>',
          errorTemplate: '<h1>Oops! Something went wrong</h1> <p>Check the console for more information.</p>',
      });
      console.log('authResponse: ', authResponse);
      if (authResponse) {
        this.accountId = authResponse.account?.username || '';
        this.AuthToken = null; // AuthToken is not set here since MSAL handles it internally. This should be allowed to be null
        this.account = authResponse.account;
        this.graphClient = Client.init({
          authProvider: (done) => {
            done(null, authResponse.accessToken);
          },
        });
        console.log('OneDrive account connected:', this.accountId);
      } else {
        console.error('Failed to authenticate with OneDrive');
      }
    } catch (error) {
        throw error;
    }
  }

  async readDir(dir: string): Promise<FileSystemItem[]> {
    if (!this.graphClient) {
      await this.initAccount();
    }
    
    if (!this.graphClient) {
      console.error('Graph client is not initialized');
      return [];
    }
    
    try {
      // get the api path for the requested directory
      const apiPath = dir === '/' || dir === '' 
        ? "/me/drive/root/children" 
        : `/me/drive/root:/${dir.replace(/^\//, '')}:/children`; // remove leading slash if exists, to avoid double slashes
      
      console.log(`Querying OneDrive API path: ${apiPath}`);
      
      const response = await this.graphClient.api(apiPath).get();
      console.log('Response from OneDrive API:', response);
      
      if (!response || !response.value || !Array.isArray(response.value)) {
        console.error('Unexpected response format from OneDrive API:', response);
        return [];
      }
      
      // Convert the OneDrive items into FileSystemItem objects
      const allFiles: FileSystemItem[] = response.value.map((item: any) => {
        // Extract the path, handling OneDrive's path format
        let itemPath = '';
        if (item.parentReference && item.parentReference.path) {
          // Strip the '/drive/root:' prefix from OneDrive paths
          const parentPath = item.parentReference.path.replace('/drive/root:', '');
          // Ensure the path starts with a slash
          itemPath = `${parentPath}/${item.name}`.replace(/^\/?/, '/'); // ensure leading slash
        } else {
          // Root level items
          itemPath = `/${item.name}`;
        }
        
        let modifiedTime: number | undefined = undefined;
        if (item.lastModifiedDateTime) {
          modifiedTime = new Date(item.lastModifiedDateTime).getTime();
        }

        const fileItem : FileSystemItem = {
          // id: item.id, // Use the OneDrive item ID as the unique identifier
          id: item.id, // Use the OneDrive item ID or the path as the unique identifier (One Drive allows duplicate names)
          name: item.name,
          isDirectory: !!item.folder,
          path: CLOUD_HOME + itemPath,
          size: item.size || 0,
          modifiedTime: modifiedTime
        };
        return fileItem;
      });
      
      console.log(`Retrieved ${allFiles.length} items from OneDrive:`, allFiles);
      return allFiles;
      
    } catch (error) {
      console.error('Error reading directory from OneDrive:', error);
      
      // If we get an access denied error, try to refresh the token
      if (error instanceof InteractionRequiredAuthError) {
        console.log('Access denied, attempting to refresh token...');
        await this.connect();
        return this.readDir(dir); // Retry reading the directory after re-authentication
      }
      
      return [];
    }
  }

  getAccountId(): string {
    return this.accountId || '';
  }
  getAuthToken(): AuthTokens | null {
    return this.AuthToken || null;
  }

  async getFile(filePath: string): Promise<FileContent> {
    if (!this.graphClient) {
      await this.initAccount();
    }
    
    if (!this.graphClient) {
      console.error('Graph client is not initialized');
      return Promise.reject(new Error('Graph client is not initialized'));
    }
    
    const apiPath = `/me/drive/root:/${filePath.replace(/^\//, '')}`; // remove leading slash if exists, to avoid double slashes
    
    console.log(`Querying OneDrive API path: ${apiPath}`);

    try {
      const metadataResponse = await this.graphClient.api(apiPath).get();
      console.log('Response from OneDrive API (metadata):', metadataResponse);

      if (!metadataResponse) {
        throw new Error('File not found');
      }

      const fileType = metadataResponse.file.mimeType;
      const fileName = metadataResponse.name;

      const dataResponse = await this.graphClient.api(apiPath + ":/content").responseType("arraybuffer").get();
      console.log('Response from OneDrive API (data):', dataResponse);

      if (!dataResponse) {
        throw new Error('File not found');
      }

      const fileData = Buffer.from(dataResponse as ArrayBuffer);

      const fileContent: FileContent = {
        name: fileName,
        content: fileData,
        type: fileType,
      };

      return fileContent;
    } catch (error) {
      console.error('Error getting file from OneDrive:', error);
      throw error;
    }
  }

  async postFile(fileName: string, folderPath: string, type: string, data: Buffer): Promise<void> {
    if (!this.graphClient) {
      await this.initAccount();
    }
    
    if (!this.graphClient) {
      console.error('Graph client is not initialized');
      return Promise.reject(new Error('Graph client is not initialized'));
    }

    const apiPath = `/me/drive/root:/${folderPath.replace(/^\//, '')}/${fileName}:/content`; // remove leading slash if exists, to avoid double slashes
    
    console.log(`Querying OneDrive API path: ${apiPath}`);

    try {
      const response = await this.graphClient.api(apiPath).put(data);
      console.log('Response from OneDrive API (upload):', response);
    } catch (error) {
      console.error('Error getting file from OneDrive:', error);
      throw error;
    }
  }
}