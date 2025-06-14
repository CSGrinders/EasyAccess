import { CloudStorage,AuthTokens, isValidToken } from './cloudStorage';
import { FileContent, FileSystemItem } from "../../types/fileSystem";
import { Client } from "@microsoft/microsoft-graph-client";
import { CLOUD_HOME, CloudType } from '../../types/cloudType';
import { file } from 'googleapis/build/src/apis/file';
import dotenv from 'dotenv';
dotenv.config();

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
      clientId: process.env.MICROSOFT_CLIENT_ID,
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
  authCancelled: boolean = false; // Flag to track if authentication was cancelled

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

    // Create a persistence plugin for MSAL
    const persistence = await PersistenceCreator.createPersistence(persistenceConfig);

    // Attach the persistence to MSAL config
    const msalConfig = {
      ...MSAL_CONFIG,
      cache: {
        cachePlugin: new PersistenceCachePlugin(persistence),
      },
    };

    // Initialize the MSAL client with the configuration and persistence plugin
    // This will allow the PUBLIC client to access the stored accounts and tokens
    this.client = new PublicClientApplication(msalConfig);
  }

  // initialize the account if the account id is set (loaded from the local storage ==> initialize the client & account for api calls)
  // initialize the graph client with the account access token
  async initAccount(): Promise<any> {
    if (!this.client) {
      await this.initClient();
    }

    if (this.accountId) {
      // get the account from the cache using the accountId
      // the client should store the accounts in the cache
      const accounts = await this.client.getAllAccounts();

      // find the account with the accountId
      const account = accounts.find((acc: any) => acc.username === this.accountId);
      if (account) {
        this.account = account;

        // aquire token silently with the persistence cache
        // this will use the cached token if available, otherwise it will try to refresh the token
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

        // check if the response is valid
        console.log('Response from acquireTokenSilent:', response);
      
        const accessToken = response.accessToken;

        // Initialize the Graph client with the acquired access token
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
    this.authCancelled = false; 
    
    // Initialize the MSAL client if not already initialized
    if (!this.client) {
      await this.initClient();
    }

    if (!this.client) {
      console.error('MSAL client is not initialized');
      throw new Error('OneDrive client initialization failed');
    }
    
    if (this.authCancelled) {
      throw new Error('Authentication cancelled');
    }
    
    // scopes for the OneDrive API
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
      // open browser function to handle the interactive authentication flow
      const openBrowser = async (url: any) => {
          await shell.openExternal(url);
      };

      // Acquire token interactively
      const authResponse = await this.client.acquireTokenInteractive({
          ...tokenRequest,
          openBrowser,
          successTemplate: '<h1>Successfully signed in!</h1> <p>You can close this window now.</p>',
          errorTemplate: '<h1>Oops! Something went wrong</h1> <p>Check the console for more information.</p>',
      });
      
      console.log('authResponse: ', authResponse);
      
      if (this.authCancelled) {
        throw new Error('Authentication cancelled');
      }
      
      if (authResponse && authResponse.account) {
        this.accountId = authResponse.account?.username || '';
        this.AuthToken = null; // AuthToken is not set here since MSAL handles it internally. This should be allowed to be null
        this.account = authResponse.account;

        // Initialize the Graph client with the acquired access token
        this.graphClient = Client.init({
          authProvider: (done) => {
            done(null, authResponse.accessToken); 
          },
        });
        console.log('OneDrive account connected:', this.accountId);
      } else {
        throw new Error('Authentication failed - no account information received');
      }
    } catch (error: any) {
        console.error('OneDrive authentication error:', error);
        if (error.errorCode === 'user_cancelled' || error.message?.includes('cancelled') || error.message?.includes('aborted')) {
            throw new Error('Authentication cancelled');
        } else if (error.errorCode === 'network_error' || error.message?.includes('network') || error.message?.includes('timeout')) {
            throw new Error('Network connection failed');
        } else if (error.errorCode === 'invalid_grant' || error.message?.includes('invalid')) {
            throw new Error('Authentication failed');
        } else {
            throw new Error('Authentication failed. Please try again.');
        }
    }
  }

  // Cancel authentication process
  cancelAuthentication(): void {
    console.log('Cancelling OneDrive authentication...');
    this.authCancelled = true;
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
        path: CLOUD_HOME + filePath, // prepend the cloud home path
        sourceCloudType: CloudType.OneDrive, // specify the cloud type
        sourceAccountId: this.accountId || '', // include the account ID
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

  async deleteFile(filePath: string): Promise<void> {
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
      await this.graphClient.api(apiPath).delete();
      console.log(`File deleted successfully: ${filePath}`);
    } catch (error) {
      console.error('Error deleting file from OneDrive:', error);
      throw error;
    }
  }
}