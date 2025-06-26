import { CloudStorage, AuthTokens, isValidToken } from './cloudStorage';
import { FileContent, FileSystemItem } from "../../types/fileSystem";
import { Client } from "@microsoft/microsoft-graph-client";
import { CLOUD_HOME, CloudType } from '../../types/cloudType';
import dotenv from 'dotenv';
import { minimatch } from 'minimatch';
import { v4 as uuidv4 } from 'uuid';
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
      cachePath = path.join(process.env.LOCALAPPDATA || '', 'EasyAccess', 'msal-cache.json');
    } else if (process.platform === 'darwin') {
      cachePath = path.join(process.env.HOME || '', 'Library', 'Application Support', 'EasyAccess', 'msal-cache.json');
    } else {
      cachePath = path.join(process.env.HOME || '', '.config', 'EasyAccess', 'msal-cache.json');
    }

    try {
      const persistenceConfig = {
        cachePath,
        dataProtectionScope: DataProtectionScope.CurrentUser,
        serviceName: "EasyAccess",
        accountName: "ElectronApp",
        usePlaintextFileOnLinux: true,
      };

      // https://learn.microsoft.com/en-us/entra/identity-platform/msal-node-extensions
      // The PersistenceCreator obfuscates a lot of the complexity by doing the following actions for you :-
      // 1. Detects the environment the application is running on and initializes the right persistence instance for the environment.
      // 2. Performs persistence validation for you.
      // 3. Performs any fallbacks if necessary.
      const persistence = await PersistenceCreator.createPersistence(persistenceConfig);
      const publicClientConfig = {
        ...MSAL_CONFIG,
        // This hooks up the cross-platform cache into MSAL
        cache: {
          cachePlugin: new PersistenceCachePlugin(persistence),
        },
      };

      this.client = new PublicClientApplication(publicClientConfig);

      console.log('MSAL client initialized with safeStorage persistence');
    } catch (error) {
      console.warn('Failed to initialize MSAL with persistence, falling back to in-memory cache:', error);
      
      // Fallback to in-memory cache if persistence fails
      const msalConfig = {
        ...MSAL_CONFIG,
        cache: {
          cachePlugin: {
            beforeCacheAccess: async () => {},
            afterCacheAccess: async () => {},
            getCache: () => new Map(),
            setCache: () => {},
          },
        },
      };
      
      this.client = new PublicClientApplication(msalConfig);
    }
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
          id: uuidv4(), // Generate unique UUID for each item
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

      console.log("Base64 file data:", fileData.toString('base64'));

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

  async postFile(fileName: string, folderPath: string, type: string, data: Buffer, progressCallback?: (uploaded: number, total: number) => void, abortSignal?: AbortSignal): Promise<void> {
    if (!this.graphClient) {
      await this.initAccount();
    }

    if (!this.graphClient) {
      console.error('Graph client is not initialized');
      return Promise.reject(new Error('Graph client is not initialized'));
    }

    // Check for cancellation before upload
    if (abortSignal?.aborted) {
      console.log('Upload cancelled by user');
      throw new Error('Upload cancelled by user');
    }

    const apiPath = `/me/drive/root:/${folderPath.replace(/^\//, '')}/${fileName}:/content`; // remove leading slash if exists, to avoid double slashes

    console.log(`Querying OneDrive API path: ${apiPath}`);

    try {
      const response = await this.graphClient.api(apiPath).put(data);
      console.log('Response from OneDrive API (upload):', response);
      
      // Report progress completion
      if (progressCallback) {
        progressCallback(data.length, data.length);
      }
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
    
    console.log(`Deleting OneDrive file: ${apiPath}`);

    try {
      await this.graphClient.api(apiPath).delete();
      console.log(`File deleted successfully: ${filePath}`);
    } catch (error) {
      console.error('Error deleting file from OneDrive:', error);
      throw error;
    }
  }

  async createDirectory(dirPath: string): Promise<void> {
    if (!this.graphClient) {
      await this.initAccount();
    }
    
    if (!this.graphClient) {
      console.error('Graph client is not initialized');
      throw new Error('Graph client is not initialized');
    }

    try {
      const pathParts = dirPath.split('/').filter(part => part !== '');
      let currentPath = '';
      
      for (const folderName of pathParts) {
        currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;
        
        try {
          // Check if folder already exists
          const checkApiPath = `/me/drive/root:/${currentPath}`;
          await this.graphClient.api(checkApiPath).get();
          console.log(`OneDrive folder already exists: ${currentPath}`);
        } catch (error: any) {
          // If folder doesn't exist, create it
          if (error.statusCode === 404 || error.code === 'itemNotFound') {
            const parentPath = currentPath.split('/').slice(0, -1).join('/');
            const createApiPath = parentPath 
              ? `/me/drive/root:/${parentPath}:/children`
              : '/me/drive/root/children';
            
            const folderData = {
              name: folderName,
              folder: {},
              '@microsoft.graph.conflictBehavior': 'fail' // Fail if folder already exists
            };
            
            try {
              const response = await this.graphClient.api(createApiPath).post(folderData);
              console.log(`OneDrive folder created successfully: ${currentPath}`, response);
            } catch (createError: any) {
              // If folder exist, continue
              if (createError.code === 'nameAlreadyExists') {
                console.log(`OneDrive folder already exists: ${currentPath}`);
              } else {
                throw createError;
              }
            }
          } else {
            throw error;
          }
        }
      }
    } catch (error) {
      console.error('Failed to create OneDrive folder:', error);
      throw error;
    }
  }

  async calculateFolderSize(folderPath: string): Promise<number> {
    if (!this.graphClient) {
      await this.initAccount();
    }
    
    if (!this.graphClient) {
      console.error('Graph client is not initialized');
      throw new Error('Graph client is not initialized');
    }

    try {
      return await this.calculateFolderSizeRecursive(folderPath);
    } catch (error) {
      console.error('Error calculating folder size for OneDrive:', error);
      throw error;
    }
  }

  private async calculateFolderSizeRecursive(folderPath: string): Promise<number> {
    const apiPath = folderPath === '/' || folderPath === '' 
      ? "/me/drive/root/children" 
      : `/me/drive/root:/${folderPath.replace(/^\//, '')}:/children`;

    console.log(`Calculating size for OneDrive folder: ${apiPath}`);

    try {
      const response = await this.graphClient.api(apiPath).get();
      
      if (!response || !response.value || !Array.isArray(response.value)) {
        console.error('Unexpected response format from OneDrive API:', response);
        return 0;
      }

      let totalSize = 0;

      for (const item of response.value) {
        if (item.folder) {
          // Recursively calculate size for subdirectories
          let subFolderPath = '';
          if (item.parentReference && item.parentReference.path) {
            const parentPath = item.parentReference.path.replace('/drive/root:', '');
            subFolderPath = `${parentPath}/${item.name}`.replace(/^\/?/, '/');
          } else {
            subFolderPath = `/${item.name}`;
          }
          const subFolderSize = await this.calculateFolderSizeRecursive(subFolderPath);
          totalSize += subFolderSize;
        } else {
          // Add file size (OneDrive size is in bytes)
          const fileSize = item.size || 0;
          totalSize += fileSize;
        }
      }

      return totalSize;
    } catch (error) {
      console.error('Error calculating OneDrive folder size:', error);
      // If we get an access denied error, try to refresh the token
      if (error instanceof InteractionRequiredAuthError) {
        console.log('Access denied, attempting to refresh token...');
        await this.connect();
        return this.calculateFolderSizeRecursive(folderPath); // Retry after re-authentication
      }
      throw error;
    }
  }

  // Implement missing methods from CloudStorage interface

  async searchFiles(rootPath: string, pattern: string, excludePatterns: string[]): Promise<FileSystemItem[]> {
    // Not implemented for OneDrive yet
    if (!this.graphClient) {
      await this.initAccount();
    }

    if (!this.graphClient) {
      console.error('Graph client is not initialized');
      return Promise.reject(new Error('Graph client is not initialized'));
    }

    const result: FileSystemItem[] = [];

    const search = async (currentPath: string): Promise<void> => {
      let apiPath: string;
      const normalizedPath = path.normalize(currentPath).replace(/^\/+/, ''); // Normalize the path and remove leading slashes if exists
      if (normalizedPath === '') {
        apiPath = '/me/drive/root/children';
      } else {
        apiPath = `/me/drive/root:/${normalizedPath}:/children`;
      }
      console.log(`Querying OneDrive API path: ${apiPath}`);

      try {
        const response = await this.graphClient.api(apiPath).get();
        const files = response.value || [];

        // log file names
        console.log('Onedrive search result Files:', files.map((file: any) => file.name));

        for (const file of files) {
          // Construct the file path for the result
          // Ensure the file path starts with a slash, which represents the root
          const filePath = "/" + (normalizedPath ? `${normalizedPath}/${file.name}` : file.name);

          // Check if the file matches any exclude patterns
          const isExcluded = excludePatterns.some(excludePattern => {
            return file.name.includes(excludePattern) || 
                    (excludePattern.includes("*") && minimatch(file.name, excludePattern, { dot: true }));
          });
          if (isExcluded) {
            continue; // Skip excluded files
          }

          // Check if the file matches the search pattern
          const matchesPattern = file.name.includes(pattern) ||
                    (pattern.includes("*") && minimatch(file.name, pattern, { dot: true }));
          if (matchesPattern) {
            result.push({
              id: file.id || '',
              name: file.name || '',
              isDirectory: file.folder !== undefined,
              path: filePath,
            });
          }

          // If it's a directory, search recursively
          if (file.folder) {
            await search(filePath);
          }
        }
      } catch (error) {
        console.error('Error querying OneDrive API:', error);
      }
    };

    await search(rootPath);
    return result;
  }

  async getFileInfo(filePath: string): Promise<FileSystemItem> {
    if (!this.graphClient) {
      await this.initAccount();
    }

    if (!this.graphClient) {
      console.error('Graph client is not initialized');
      throw new Error('Graph client is not initialized');
    }

    const apiPath = `/me/drive/root:/${filePath.replace(/^\//, '')}`;

    try {
      const response = await this.graphClient.api(apiPath).get();
      
      if (!response) {
        throw new Error('File not found');
      }

      const fileSystemItem: FileSystemItem = {
        id: response.id || '',
        name: response.name || '',
        isDirectory: !!response.folder,
        path: CLOUD_HOME + filePath,
        size: response.size || 0,
        modifiedTime: response.lastModifiedDateTime ? new Date(response.lastModifiedDateTime).getTime() : undefined,
      };

      return fileSystemItem;
    } catch (error) {
      console.error('Error getting file info from OneDrive:', error);
      throw error;
    }
  }

  async getDirectoryTree(dir: string): Promise<FileSystemItem[]> {
    if (!this.graphClient) {
      await this.initAccount();
    }

    if (!this.graphClient) {
      console.error('Graph client is not initialized');
      throw new Error('Graph client is not initialized');
    }

    const result: FileSystemItem[] = [];

    try {
      await this.buildDirectoryTreeRecursive(dir, result);
      return result;
    } catch (error) {
      console.error('Error getting directory tree from OneDrive:', error);
      throw error;
    }
  }

  private async buildDirectoryTreeRecursive(currentPath: string, result: FileSystemItem[]): Promise<void> {
    const apiPath = currentPath === '/' || currentPath === ''
      ? "/me/drive/root/children"
      : `/me/drive/root:/${currentPath.replace(/^\//, '')}:/children`;

    try {
      const response = await this.graphClient.api(apiPath).get();

      if (!response || !response.value || !Array.isArray(response.value)) {
        return;
      }

      for (const item of response.value) {
        let itemPath = '';
        if (item.parentReference && item.parentReference.path) {
          const parentPath = item.parentReference.path.replace('/drive/root:', '');
          itemPath = `${parentPath}/${item.name}`.replace(/^\/?/, '/');
        } else {
          itemPath = `/${item.name}`;
        }

        const fileSystemItem: FileSystemItem = {
          id: item.id || '',
          name: item.name || '',
          isDirectory: !!item.folder,
          path: CLOUD_HOME + itemPath,
          size: item.size || 0,
          modifiedTime: item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime).getTime() : undefined,
        };

        result.push(fileSystemItem);

        // Recursively process subdirectories
        if (item.folder) {
          await this.buildDirectoryTreeRecursive(itemPath, result);
        }
      }
    } catch (error) {
      console.error('Error building directory tree for OneDrive:', error);
      throw error;
    }
  }

  async readFile(filePath: string): Promise<string> {
    if (!this.graphClient) {
      await this.initAccount();
    }

    if (!this.graphClient) {
      console.error('Graph client is not initialized');
      throw new Error('Graph client is not initialized');
    }

    try {
      const fileContent = await this.getFile(filePath);
      if (fileContent.content) {
        return fileContent.content.toString('utf-8');
      } else {
        throw new Error('File content is empty or not available');
      }
    } catch (error) {
      console.error('Error reading file from OneDrive:', error);
      throw error;
    }
  }
}
