import { CloudStorage, AuthTokens, isValidToken } from './cloudStorage';
import { FileContent, FileSystemItem } from "../../types/fileSystem";
import { Client, FileUpload, OneDriveLargeFileUploadOptions, OneDriveLargeFileUploadTask, ResponseType, UploadResult } from "@microsoft/microsoft-graph-client";
import { CLOUD_HOME, CloudType, StorageError } from '../../types/cloudType';
import dotenv from 'dotenv';
import { minimatch } from 'minimatch';
import { v4 as uuidv4 } from 'uuid';
import { progressCallbackData } from '@Types/transfer';
import { Semaphore } from '../transfer/transferManager';
dotenv.config();

import mime from "mime-types";
import { promises as fs } from 'fs';

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
  graphClient?: Client; // Graph client for OneDrive / Need for file operations

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

      // console.log(`Retrieved ${allFiles.length} items from OneDrive:`, allFiles);
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

  async getFile(filePath: string, progressCallback?: (downloaded: number, total: number) => void, abortSignal?: AbortSignal): Promise<FileContent> {
    if (!this.graphClient) {
      await this.initAccount();
    }

    if (!this.graphClient) {
      console.error('Graph client is not initialized');
      return Promise.reject(new Error('Graph client is not initialized'));
    }

    // Check for cancellation before download
    if (abortSignal?.aborted) {
      console.log('Download cancelled by user');
      throw new Error('Download cancelled by user');
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

      const dataResponse = await this.graphClient.api(apiPath + ":/content").responseType(ResponseType.ARRAYBUFFER).get();
      console.log('Response from OneDrive API (data):', dataResponse);

      if (!dataResponse) {
        throw new Error('File not found');
      }

      const fileData = Buffer.from(dataResponse as ArrayBuffer);

      console.log("Base64 file data:", fileData.toString('base64'));

      // Update progress after completion
      if (progressCallback) {
        progressCallback(fileData.length, fileData.length);
      }

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
    } catch (error: any) {
      const err: StorageError = {
        status: error.statusCode || 500,
        message: `Failed to create OneDrive folder: ${error.message || 'Unknown error'}`,
        body: error.response?.data || error.message || 'No additional details available'
      };
      console.error('Error creating directory in OneDrive:', err);
      console.error(`Failed to create directory ${dirPath} in OneDrive:`, error);
      return Promise.reject(err);
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
    if (!this.graphClient) {
      await this.initAccount();
    }
    
    if (!this.graphClient) {
      console.error('Graph client is not initialized');
      throw new Error('Graph client is not initialized');
    }
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
    if (!this.graphClient) {
        await this.initAccount();
    }
    
    if (!this.graphClient) {
        console.error('Graph client is not initialized');
        throw new Error('Graph client is not initialized');
    }
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

  async isDirectory(filePath: string): Promise<boolean> {
    if (!this.graphClient) {
      await this.initAccount();
    }

    if (!this.graphClient) {
      console.error('Graph client is not initialized');
      throw new Error('Graph client is not initialized');
    }

    const apiPath = `/me/drive/root:/${filePath.replace(/^\//, '')}`; // remove leading slash if exists, to avoid double slashes

    try {
      const response = await this.graphClient.api(apiPath).get();
      return !!response.folder; // Check if the item is a directory
    } catch (error) {
      console.error('Error checking if path is a directory in OneDrive:', error);
      return false;
    }
  }

  async getItemInfo(filePath: string): Promise<FileSystemItem> {
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

    if (!this.graphClient) {
      await this.initAccount();
    }
    
    if (!this.graphClient) {
      console.error('Graph client is not initialized');
      throw new Error('Graph client is not initialized');
    }

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

  /*
    * Transfers a file or directory from local storage to Google Drive using resumable upload.
    * @param fileInfo - Information about the file or directory to transfer
    * @param progressCallback - Optional callback to report progress
    * @param abortSignal - Optional AbortSignal to cancel the transfer
    * @returns Promise<void>
    * @throws Error if OAuth2 client is not initialized or transfer fails
  */
    async transferLocalToCloud(fileInfo: any, progressCallback?: (data: progressCallbackData) => void, abortSignal?: AbortSignal): Promise<void> {
        const {transferId, fileName, sourcePath, type, targetCloudType, targetAccountId, targetPath} = fileInfo;

        console.log(`From local ${sourcePath} to cloud ${targetCloudType} account ${targetAccountId} at path ${targetPath}`);
        
        if (!this.graphClient) {
            await this.initAccount();
        }

        if (!this.graphClient) {
            console.error('Graph client is not initialized');
            throw new Error('Graph client is not initialized');
        }

        // Get file size from local file
        const fileStats = await fs.stat(sourcePath);
        const fileSize = fileStats.size;

        //Check if it's a directory, then we will handle it separetely
        if (fileStats.isDirectory()) {
            console.log('Starting resumeable upload for directory:', fileName, 'Size:', fileSize, 'Target Path:', targetPath);
            await this.transferDirectoryToCloud(transferId, fileName, sourcePath, targetPath, progressCallback, abortSignal);
            return;

        }


        // Handle resumable for files
        console.log('Starting resumable upload for file:', fileName, 'Size:', fileSize, 'Target Path:', targetPath);

        try {

            await this.uploadFileInChunks(transferId, fileName, sourcePath, targetPath, fileSize, progressCallback, abortSignal);
            // // Initialize resumable upload session
            // const uploadUrl = await this.initiateResumableUpload(fileName, type, targetPath);
            // console.log('Resumable upload session initiated:', uploadUrl);
            
            // // Upload file in chunks
            // await this.uploadFileInChunks(transferId, fileName, uploadUrl, sourcePath, fileSize, progressCallback, abortSignal, false);
            
            console.log(`Resumable upload completed for file: ${fileName}`);
        } catch (error) {
            console.error('Resumable upload failed:', error);
            throw error;
        }
    }

    async transferDirectoryToCloud(
        transferId: string,
        dirName: string,
        sourcePath: string,
        parentDirPath: string,
        progressCallback?: (data: progressCallbackData) => void,
        abortSignal?: AbortSignal
    ): Promise<void> {
        if (!this.graphClient) {
            await this.initAccount();
        }
        if (!this.graphClient) {
            console.error('Graph client is not initialized');
            throw new Error('Graph client is not initialized');
        }

        // Check if the target directory exists, if not create it
        const targetPath = path.join(parentDirPath, dirName);
        await this.createDirectory(targetPath);

        console.log(`Transferring directory ${dirName} from local path ${sourcePath} to cloud path ${targetPath}`);

        await this.transferDirectoryContentsResumable(transferId, sourcePath, targetPath, progressCallback, abortSignal);
    }

    async transferDirectoryContentsResumable(
        transferId: string,
        sourcePath: string,
        targetPath: string,
        progressCallback?: (data: progressCallbackData) => void,
        abortSignal?: AbortSignal
    ): Promise<void> {
        if (!this.graphClient) {
            await this.initAccount();
        }
        if (!this.graphClient) {
            console.error('Graph client is not initialized');
            throw new Error('Graph client is not initialized');
        }

        const items = await fs.readdir(sourcePath, { withFileTypes: true });
        // Create semaphore with desired concurrency limit
        const semaphore = new Semaphore(3); // Max 3 concurrent transfers

        const transferPromises = items.map(async (item) => {
            // Acquire semaphore to limit concurrent transfers
            await semaphore.acquire();

            if (abortSignal?.aborted) {
                console.log('Transfer cancelled by user');
                throw new Error('Transfer cancelled by user');
            }

            const itemPath = path.join(sourcePath, item.name);
            if (item.isDirectory()) {
                try {
                    console.log(`Transferring directory: ${item.name} to target path: ${targetPath}/${item.name}`);
                    // Create the directory in the target path
                    await this.createDirectory(`${targetPath}/${item.name}`);
                    // Recursively transfer the contents of the directory if directory creation is successful
                    console.log(`Directory created successfully: ${item.name}`);
                    await this.transferDirectoryContentsResumable(transferId, itemPath, `${targetPath}/${item.name}`, progressCallback, abortSignal);
                } catch (error) {
                    console.error(`Failed to process directory ${item.name}:`, error);
                    // Extract error message
                    const parts = error instanceof Error ? error.message.split(':') : ["Transfer failed"];
                    let errorMessage = parts[parts.length - 1].trim() + ". Continueing with next file...";
                    if (errorMessage.toLowerCase().includes('permission')) {
                        errorMessage = "You don't have permission to access this file or folder.";
                    } else if (errorMessage.toLowerCase().includes('quota')) {
                        errorMessage = "Google Drive storage quota exceeded.";
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
                        transfered: 0,
                        total: 0, 
                        isDirectory: true,
                        isFetching: true 
                    });
                    console.log(`Transferring file: ${item.name} to target path: ${targetPath}/${item.name}`);
                    const fileStats = await fs.stat(itemPath);
                    const fileSize = fileStats.size;
                    const type = mime.lookup(item.name) || 'application/octet-stream';

                    await this.uploadFileInChunks(transferId, item.name, itemPath, targetPath, fileSize, progressCallback, abortSignal);

                    // const uploadUrl = await this.initiateResumableUpload(item.name, type, targetPath);
                    // await this.uploadFileInChunks(transferId, item.name, uploadUrl, itemPath, fileSize, progressCallback, abortSignal);

                    console.log(`File ${item.name} transferred successfully to ${targetPath}/${item.name}`);
                } catch (error) {
                    console.error(`Failed to process file ${item.name}:`, error);
                    // Extract error message
                    const parts = error instanceof Error ? error.message.split(':') : ["Transfer failed"];
                    let errorMessage = parts[parts.length - 1].trim() + ". Continuing with next file...";
                    if (errorMessage.toLowerCase().includes('permission')) {
                        errorMessage = "You don't have permission to access this file or folder.";
                    } else if (errorMessage.toLowerCase().includes('quota')) {
                        errorMessage = "Google Drive storage quota exceeded.";
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
                    // Release the semaphore after processing the item
                    semaphore.release();
                }
            }
        });

        await Promise.all(transferPromises);
        console.log(`All items in directory ${sourcePath} transferred successfully to ${targetPath}`);
    }

    // use SDK to upload large files in chunks
    // https://learn.microsoft.com/en-us/graph/sdks/large-file-upload?tabs=typescript
    async uploadFileInChunks(transferId: string, fileName: string, sourcePath: string, targetPath: string, fileSize: number, progressCallback?: (data: progressCallbackData) => void, abortSignal?: AbortSignal): Promise<void> {
        if (!this.graphClient) {
            await this.initAccount();
        }
        if (!this.graphClient) {
            console.error('Graph client is not initialized');
            throw new Error('Graph client is not initialized');
        }

        // readFile from fs/promises
        const file = await fs.readFile(sourcePath);


        if (abortSignal?.aborted) {
          console.log('Upload cancelled by user');
          throw new Error('Upload cancelled by user');
        }

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

        const options: OneDriveLargeFileUploadOptions = {
            // Relative path from root folder
            path: targetPath,
            fileName: fileName,
            rangeSize: CHUNK_SIZE, // 32MB chunks
            uploadEventHandlers: {
                // Called as each "slice" of the file is uploaded
                progress: (range, _) => {
                    if (abortSignal?.aborted) {
                      console.log('Upload cancelled by user during progress update');
                      throw new Error('Upload cancelled by user');
                  }
                    console.log(`Uploaded bytes ${range?.minValue} to ${range?.maxValue}`);
                    
                    if (progressCallback) {
                        progressCallback({
                            transferId,
                            fileName: fileName,
                            transfered: range?.maxValue || 0,
                            total: file.byteLength,
                            isDirectory: false,
                        });
                    }
                },
            },
        };


        // Create FileUpload object
        const fileUpload = new FileUpload(file, fileName, file.byteLength);
        
        // Create a OneDrive upload task
        const uploadTask = await OneDriveLargeFileUploadTask.createTaskWithFileObject(
            this.graphClient,
            fileUpload,
            options,
        );

        const onAbort = () => {
            console.warn("Upload aborted by signal. Cancelling task...");
            uploadTask.cancel();
        };
        // Attach abort logic before calling `upload()`
        if (abortSignal) {
            abortSignal.addEventListener("abort", onAbort);
        }

        try {
            const uploadResult: UploadResult = await uploadTask.upload();

            // Check for cancellation after upload completes
            if (abortSignal?.aborted) {
              console.log('Upload cancelled by user after completion');
              throw new Error('Upload cancelled by user');
          }
            const driveItem = uploadResult.responseBody as any;
            console.log(`Uploaded file with ID: ${driveItem.id}`);
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
          throw error;
        } finally {
            if (abortSignal) {
                abortSignal.removeEventListener("abort", onAbort);
            }
        }
    }

    // Not used but keep it if used in cloud-cloud
    async initiateResumableUpload(fileName: string, mimeType: string, targetPath: string): Promise<string> {
        if (!this.graphClient) {
            await this.initAccount();
        }
        if (!this.graphClient) {
            console.error('Graph client is not initialized');
            throw new Error('Graph client is not initialized');
        }

        console.log(`Initiating resumable upload for ${fileName} to ${targetPath}`);

        // Ensure targetPath starts with a slash
        targetPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
        // Ensure targetPath does not end with a slash unless it is the root
        targetPath = targetPath !== '/' && targetPath.endsWith('/') ? targetPath.slice(0, -1) : targetPath;

        // Construct API path correctly - don't use path.join() for URLs
        let apiPath;
        if (targetPath === '/') {
            apiPath = `/me/drive/root:/${fileName}:/createUploadSession`;
        } else {
            apiPath = `/me/drive/root:${targetPath}/${fileName}:/createUploadSession`;
        }

        console.log(`API path for resumable upload: ${apiPath}`);

        try {
            const response = await this.graphClient.api(apiPath)
                .post({
                    item: {
                        '@microsoft.graph.conflictBehavior': 'rename',
                        name: fileName,
                    }
                });
            
            console.log('Upload session created successfully:', response.uploadUrl);
            return response.uploadUrl;

        } catch (error) {
            console.error('Error creating upload session:', error);
            throw error;
        }
    }

    // https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0&tabs=http
    async downloadInChunks(filePath: string, chunkSize?: number, maxQueueSize?: number): Promise<ReadableStream> {
        if (!this.graphClient) {
            await this.initAccount();
        }

        if (!this.graphClient) {
            console.error('Graph client is not initialized');
            throw new Error('Graph client is not initialized');
        }
        chunkSize = chunkSize || 32 * 1024 * 1024; // Default to 32MB chunks
        maxQueueSize = 10 * chunkSize; // Default to 10 chunks in the queue
        const apiPath = `/me/drive/root:/${filePath.replace(/^\//, '')}`;
        console.log(`Creating read stream for OneDrive file at path: ${apiPath}`);

        try {
            // 1. Get file metadata to extract the download URL
            const metadata = await this.graphClient.api(apiPath).get();
            const downloadUrl = metadata['@microsoft.graph.downloadUrl'];
            const fileSize = metadata.size;

            let offset = 0;
            let retryCount = 0;
            let isStreamClosed = false;
            const MAX_RETRIES = 3;

            // 2. Return a ReadableStream that pulls data in chunks
            return new ReadableStream({
              async start(controller) {
                  console.log(`Starting to read file from OneDrive: ${filePath}`);
                  if (!downloadUrl) {
                      controller.error('Download URL not found in file metadata');
                      return;
                  }
              },
              async pull(controller) {
                  if (isStreamClosed) {
                    console.log('Stream is already closed');
                    controller.close();
                    return;
                  }
                  if (offset >= fileSize) {
                      controller.close();
                      return;
                  }

                  // Check if we should pause due to backpressure
                  // Not used as synchronous pull is used.... but could be useful in the future
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

                  try {
                    const end = Math.min(offset + chunkSize - 1, fileSize - 1);
                    const res = await fetch(downloadUrl, {
                        headers: {
                            Range: `bytes=${offset}-${end}`,
                        }
                    });

                    if (!res.ok) {
                        throw new Error(`Failed to fetch bytes ${offset}-${end}: ${res.statusText}`);
                    }

                    const chunk = Buffer.from(await res.arrayBuffer());
                    controller.enqueue(chunk);
                    offset += chunk.length;
                  } catch (error) {
                    // redo the request if it fails

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
                  console.log('Stream cancelled');
                  isStreamClosed = true;
              }
            }, {
                // Set a high water mark to control internal buffering
                highWaterMark: maxQueueSize, // Default to 10 chunks in the queue
            });
        } catch (error) {
            console.error('Error creating read stream from OneDrive:', error);
            throw error;
        }
    }

    async cloudToCloudUploadChunk(uploadUrl: string, chunk: Buffer, offset: number, totalSize: number): Promise<void> {
        if (!this.graphClient) {
            await this.initAccount();
        }
        
        if (!this.graphClient) {
            console.error('Graph client is not initialized');
            throw new Error('Graph client is not initialized');
        }

        try {
          console.log(`start the one drive api for uploading chunk from ${offset} to ${offset + chunk.length - 1}/${totalSize}`);
          const response = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Length': chunk.length.toString(),
              'Content-Range': `bytes ${offset}-${offset + chunk.length - 1}/${totalSize}`,
            },
            body: chunk
          });
          console.log(`Uploaded chunk from ${offset} to ${offset + chunk.length - 1}/${totalSize}`);
          console.log('Response:', response);
          if (!response.ok) {
            const err: StorageError = {
              status: response.status,
              message: `Failed to upload chunk: ${response.statusText}`,
              body: await response.text()
            };
            console.error('Error uploading chunk:', err);
            return Promise.reject(err);
          }
        } catch (error: any) {
          const err: StorageError = {
            status: error.status || 500,
            message: `Failed to upload chunk: ${error.message}`,
            body: error.response?.data || error.message || 'No additional details available'
          };
          console.error('Error uploading chunk:', error);
          return Promise.reject(err);
        }
    }

    async finishResumableUpload(sessionId: string, targetFilePath: string, fileSize: number): Promise<void> {
      console.log(`Finishing resumable upload for session ${sessionId} to file ${targetFilePath} with size ${fileSize}`);
    }

    async moveOrCopyItem(sourcePath: string, targetPath: string, itemName: string, copy: boolean, progressCallback?: (data: progressCallbackData) => void, abortSignal?: AbortSignal): Promise<void> {
      if (!this.graphClient) {
        await this.initAccount();
      }
      if (!this.graphClient) {
        console.error('Graph client is not initialized');
        throw new Error('Graph client is not initialized');
      }

      // Ensure sourcePath starts with a slash
      sourcePath = sourcePath.startsWith('/') ? sourcePath : `/${sourcePath}`;
      // Ensure targetPath starts with a slash
      targetPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
      
      // get target id for the parent reference
      const targetMetadata = await this.graphClient
        .api(`/me/drive/root:${targetPath}`)
        .get();

      const targetId = targetMetadata.id;
      const apiPath = `/me/drive/root:${sourcePath}`;

      const body = {
        parentReference: {
          id: targetId,
        },
        name: itemName // or provide a new name to rename during move
      };

      console.log(`Moving or copying item ${itemName} from ${sourcePath} to ${targetPath} with copy=${copy}`);
      console.log(`API Path: ${apiPath}`);

      try {
        // HEHHEHEHHEHEHEHEHEHEHEHEHHEHEHEHEHHE
        await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate some delay to allow user to cancel if needed
        if (abortSignal?.aborted) {
          console.log('Move or copy operation cancelled by user');
          throw new Error('Move or copy operation cancelled by user');
        }
        // hmm.. Since it takes really short time to move or copy an item, we don't need to use progressCallback...?
        if (copy) {
          await this.graphClient.api(`${apiPath}:/copy`).post(body);
          console.log(`Copied ${itemName} to ${targetPath}`);
        } else {
          await this.graphClient.api(apiPath).patch(body);
          console.log(`Moved ${itemName} from ${sourcePath} to ${targetPath}`);
        }
      } catch (error) {
        console.error('Error moving or copying item:', error);
        throw error;
      }
    }
  }