/*
This file works as a middleman between the main process and the cloud storage providers.
*/

import { CLOUD_HOME, CloudType } from "../../types/cloudType";
import Store from 'electron-store';
import { AuthTokens, CloudStorage } from './cloudStorage';
import { GoogleDriveStorage } from './googleStorage';
import { FileContent, FileSystemItem } from "../../types/fileSystem";
import { OneDriveStorage } from "./onedriveStorage";
import { BrowserWindow, safeStorage } from "electron";
import { DropboxStorage } from "./dropboxStorage";

const mime = require('mime-types');

export const store = new Store();

// Helper functions for secure storage
function encryptData(data: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('Something went wrong with the secure storage.');
    return data;
  }
  
  try {
    const encrypted = safeStorage.encryptString(data);
    return encrypted.toString('base64');
  } catch (error) {
    console.error('Failed to encrypt data:', error);
    return data; 
  }
}

function decryptData(encryptedData: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('safeStorage decryption is not available');
    return encryptedData;
  }
  
  try {
    const encryptedBuffer = Buffer.from(encryptedData, 'base64');
    return safeStorage.decryptString(encryptedBuffer);
  } catch (error) {
    console.error('Failed to decrypt data, data might be plain text:', error);
    return encryptedData;
  }
}

export const StoredAccounts: Map<CloudType, CloudStorage[]> = new Map();

// To keep track of active authentication processes
interface ActiveAuth {
  cloudType: CloudType;
  promise: Promise<string | null>;
  cancel: () => void;
  browserWindow?: BrowserWindow;
}

const activeAuthentications: Map<CloudType, ActiveAuth> = new Map();

// Traverse electron local storage to load all stored accounts into StoredAccounts
export async function clearStore(): Promise<boolean> {
  try {
    // Clear the in-memory accounts
    StoredAccounts.clear();
    
    // Clear local storage
    store.clear();
    
    console.log('Cleared all stored accounts and local storage');
    return true;
  } catch (error) {
    console.error('Error clearing store:', error);
    return false;
  }
}

// Traverse electron local storage to load all stored accounts into StoredAccounts
export async function loadStoredAccounts(): Promise<void> {
  StoredAccounts.clear(); // Clear the existing accounts

  const allData = store.store; // Get all key-value pairs

  console.log('All stored data:', allData);

  for (const [cloudTypeStr, accountId_tokens] of Object.entries(allData)) {
    const cloudType = cloudTypeStr as CloudType;
    console.log(`Key: ${cloudType}, Value: ${accountId_tokens}`);

    // Ensure this is an object (not a primitive value)
    if (typeof accountId_tokens !== 'object' || accountId_tokens === null) continue;

    for (const [encodedAccountId, tokenData] of Object.entries(accountId_tokens)) {
      const accountId = decodeAccountId(encodedAccountId); 
      
      try {
        let decryptedTokenData: string;
        
        // Handle both encrypted and plain text data for backward compatibility
        if (typeof tokenData === 'string') {
          decryptedTokenData = decryptData(tokenData);
        } else {
          // If it's not a string, it might be legacy plain object data
          decryptedTokenData = JSON.stringify(tokenData);
        }

        const tokens: AuthTokens | null = !decryptedTokenData || decryptedTokenData === 'null'
          ? null
          : JSON.parse(decryptedTokenData);

        console.log(`Cloud: ${cloudType}, Account ID: ${accountId} - tokens loaded securely`);
        
        // Now you can use `tokens` and `accountId` as needed
        let cloudStorageInstance: CloudStorage | null = null;

        switch (cloudType) {
          case CloudType.GoogleDrive:
            cloudStorageInstance = new GoogleDriveStorage();
            break;
          case CloudType.OneDrive:
            cloudStorageInstance = new OneDriveStorage();
            break;
          case CloudType.Dropbox:
            cloudStorageInstance = new DropboxStorage();
            break;
          default:
            console.warn(`Unsupported cloud type: ${cloudType}`);
            continue;
        }
        if (cloudStorageInstance) {
          cloudStorageInstance.AuthToken = tokens;
          cloudStorageInstance.accountId = accountId;
          if (!StoredAccounts.has(cloudType)) {
            StoredAccounts.set(cloudType, []);
          }
          StoredAccounts.get(cloudType)?.push(cloudStorageInstance);
          console.log(`Loaded ${cloudType} account ${accountId} from local storage`);
          console.log(`Loaded Tokens for ${cloudType}.${accountId}:`, tokens);
        }
      } catch (err) {
        console.warn(`Invalid token data for ${cloudType}.${accountId}`, err);
      }
    }
  }
}

// Create New CloudStorage Class, connect to the cloud, and save the account to local storage & add to StoredAccounts
export async function connectNewCloudAccount(cloudType: CloudType) : Promise<string | null> {
  console.log('Connecting to cloud account:', cloudType);
  
  // Check if there's already an active authentication 
  if (activeAuthentications.has(cloudType)) {
    throw new Error(`Authentication already in progress for ${cloudType}`);
  }
  
  let cloudStorageInstance: CloudStorage | null = null;
  let authCancelled = false;
  
  const cancelAuth = () => {
    authCancelled = true;
    if (cloudStorageInstance && 'cancelAuthentication' in cloudStorageInstance) {
      (cloudStorageInstance as any).cancelAuthentication();
    }
    activeAuthentications.delete(cloudType);
  };
  
  try {
    switch (cloudType) {
      case CloudType.GoogleDrive:
        console.log('Cloud type is GoogleDrive');
        cloudStorageInstance = new GoogleDriveStorage();
        break;
      case CloudType.Dropbox:
        console.log('Cloud type is Dropbox');
        cloudStorageInstance = new DropboxStorage();
        break;
      case CloudType.OneDrive:
        console.log('Cloud type is OneDrive');
        cloudStorageInstance = new OneDriveStorage();
        break;
      default:
        console.error('Cloud type is not supported');
        throw new Error(`Unsupported cloud type: ${cloudType}`);
    }

    if (!cloudStorageInstance) {
      console.error('Cloud storage instance is null');
      throw new Error('Failed to create cloud storage instance');
    }

    const authPromise = cloudStorageInstance.connect().then(async () => {
      if (authCancelled) {
        throw new Error('Authentication cancelled');
      }
      
      console.log('Connected to cloud account:', cloudType);

      const authTokens = cloudStorageInstance!.getAuthToken();
      const accountId = cloudStorageInstance!.getAccountId();

      // TODO allow null authTokens?
      if (accountId) {
        // Save the account to local storage
        await saveCloudAccountLocaStorage(cloudType, accountId, authTokens);
        // Add the account to StoredAccounts
        if (!StoredAccounts.has(cloudType)) {
          StoredAccounts.set(cloudType, []);
        }
        StoredAccounts.get(cloudType)?.push(cloudStorageInstance!);
        return accountId;
      } else {
        throw new Error(`Failed to connect to ${cloudType} account - no account ID received`);
      }
    })
    .catch((error: any) => {
      console.error(`Error connecting to ${cloudType}:`, error);
      throw error;
    });

    // Register the active authentication
    activeAuthentications.set(cloudType, {
      cloudType,
      promise: authPromise,
      cancel: cancelAuth
    });

    console.log('authPromise: ', authPromise);  

    const result = await authPromise;

    activeAuthentications.delete(cloudType);
    return result;
    
  } catch (error: any) {
    activeAuthentications.delete(cloudType);
    console.error(`Error connecting to ${cloudType}:`, error);
    throw error; 
  }
}

export function cancelCloudAuthentication(cloudType: CloudType): boolean {
  console.log('Cancelling authentication for:', cloudType);
  
  const activeAuth = activeAuthentications.get(cloudType);
  if (activeAuth) {
    activeAuth.cancel();

    // not used anymore?
    if (activeAuth.browserWindow && !activeAuth.browserWindow.isDestroyed()) {
      activeAuth.browserWindow.close();
    }
    
    console.log(`Authentication cancelled for ${cloudType}`);
    return true;
  }
  
  console.log(`No active authentication found for ${cloudType}`);
  return false;
}

// Get all connected cloud accounts (of a cloud type) from local storage
export async function getConnectedCloudAccounts(cloudType: CloudType) : Promise<string[] | null> {
  console.log('Getting connected cloud accounts:', cloudType);
  const accountIds: string[] = [];

  console.log('Cloud type is ', cloudType);
  const accounts = StoredAccounts.get(cloudType);
  if (accounts) {
    for (const account of accounts) {
      const accountId = account.getAccountId();
      accountIds.push(accountId);
      console.log(`${cloudType} account ID: ${accountId}`);
    }
  } else {
    console.log(`No ${cloudType} accounts found`);
  }

  return accountIds.length > 0 ? accountIds : null;
}

export async function readDirectory(CloudType: CloudType, accountId: string, dir: string): Promise<FileSystemItem[]> {
  console.log('Getting files from cloud account:', CloudType, accountId, dir);
  
  try {
    const accounts = StoredAccounts.get(CloudType);
    dir = dir.replace(CLOUD_HOME, "");
    
    if (accounts) {
      for (const account of accounts) {
        if (account.getAccountId() === accountId) {
          try {
            return await account.readDir(dir);
          } catch (error: any) {
            console.error(`Error reading directory from ${CloudType}:`, error);
            
            // Categorize and re-throw with user-friendly messages
            if (error.message?.includes('unauthorized') || error.message?.includes('access_denied') || error.message?.includes('Authentication failed')) {
              throw new Error('Authentication expired. Please reconnect your account.');
            } else if (error.message?.includes('network') || error.message?.includes('timeout') || error.message?.includes('ENOTFOUND')) {
              throw new Error('Network connection failed. Please check your internet connection.');
            } else if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
              throw new Error('Directory not found or no longer exists.');
            } else if (error.message?.includes('quota') || error.message?.includes('storage')) {
              throw new Error('Storage quota exceeded or storage service unavailable.');
            } else {
              throw new Error(`Failed to read directory: ${error.message || 'Unknown error'}`);
            }
          }
        }
      }
    }
    
    throw new Error(`No ${CloudType} account found with ID: ${accountId}`);
  } catch (error: any) {
    console.error(`Cloud directory read error for ${CloudType}:`, error);
    throw error; 
  }
}

// read the file content as utf-8 string from the cloud storage
// used for reading the text content of the file
export async function readFile(CloudType: CloudType, accountId: string, filePath: string): Promise<string> {
  try {
    filePath = filePath.replace(CLOUD_HOME, "");
    console.log('Reading file from cloud account:', CloudType, accountId, filePath);
    
    const accounts = StoredAccounts.get(CloudType);
    if (accounts) {
      for (const account of accounts) {
        if (account.getAccountId() === accountId) {
          try {
            return await account.readFile(filePath);
          } catch (error: any) {
            console.error(`Error reading file from ${CloudType}:`, error);
            
            if (error.message?.includes('unauthorized') || error.message?.includes('access_denied') || error.message?.includes('Authentication failed')) {
              throw new Error('Authentication expired. Please reconnect your account.');
            } else if (error.message?.includes('network') || error.message?.includes('timeout') || error.message?.includes('ENOTFOUND')) {
              throw new Error('Network connection failed. Please check your internet connection.');
            } else if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
              throw new Error('File not found or no longer exists.');
            } else if (error.message?.includes('too large') || error.message?.includes('size limit')) {
              throw new Error('File is too large to read.');
            } else if (error.message?.includes('quota') || error.message?.includes('storage')) {
              throw new Error('Storage quota exceeded or storage service unavailable.');
            } else if (error.message?.includes('binary') || error.message?.includes('encoding')) {
              throw new Error('File is not a text file and cannot be read as text.');
            } else {
              throw new Error(`Failed to read file: ${error.message || 'Unknown error'}`);
            }
          }
        }
      }
    }
    
    throw new Error(`No ${CloudType} account found with ID: ${accountId}`);
  } catch (error: any) {
    console.error(`Cloud file read error for ${CloudType}:`, error);
    throw error; 
  }
}


// GOING TO BE REPLACED 

  // filePath: /HOME/dir/temp.txt
  // returns the file content in base64 format
export async function getFile(CloudType: CloudType, accountId: string, filePath: string, progressCallback?: (downloaded: number, total: number) => void, abortSignal?: AbortSignal): Promise<FileContent | null> {
  try {
    filePath = filePath.replace(CLOUD_HOME, "");
    console.log('Getting file from cloud account:', CloudType, accountId, filePath);
    
    const accounts = StoredAccounts.get(CloudType);
    if (accounts) {
      for (const account of accounts) {
        if (account.getAccountId() === accountId) {
          try {
            return await account.getFile(filePath, progressCallback, abortSignal);
          } catch (error: any) {
            console.error(`Error getting file from ${CloudType}:`, error);
            
            // Categorize and re-throw with user-friendly messages
            if (error.message?.includes('unauthorized') || error.message?.includes('access_denied') || error.message?.includes('Authentication failed')) {
              throw new Error('Authentication expired. Please reconnect your account.');
            } else if (error.message?.includes('network') || error.message?.includes('timeout') || error.message?.includes('ENOTFOUND')) {
              throw new Error('Network connection failed. Please check your internet connection.');
            } else if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
              throw new Error('File not found or no longer exists.');
            } else if (error.message?.includes('too large') || error.message?.includes('size limit')) {
              throw new Error('File is too large to download.');
            } else if (error.message?.includes('quota') || error.message?.includes('storage')) {
              throw new Error('Storage quota exceeded or storage service unavailable.');
            } else {
              throw new Error(`Failed to download file: ${error.message || 'Unknown error'}`);
            }
          }
        }
      }
    }
    
    throw new Error(`No ${CloudType} account found with ID: ${accountId}`);
  } catch (error: any) {
    console.error(`Cloud file get error for ${CloudType}:`, error);
    throw error; 
  }
}

// post the file content (Buffer) to the cloud
// filePath: /HOME/dir/temp.txt
// data: Buffer
export async function postFile(CloudType: CloudType, accountId: string, fileName: string, folderPath: string, data: Buffer, progressCallback?: (uploaded: number, total: number) => void, abortSignal?: AbortSignal): Promise<void> {
  try {
    folderPath = folderPath.replace(CLOUD_HOME, "");
    console.log('Posting file to cloud account:', CloudType, accountId, fileName, folderPath);
    
    const accounts = StoredAccounts.get(CloudType);
    if (accounts) {
      for (const account of accounts) {
        if (account.getAccountId() === accountId) {
          try {
            const type = mime.lookup(fileName) || 'application/octet-stream'; // default to binary if no mime type found
            return await account.postFile(fileName, folderPath, type, data, progressCallback, abortSignal);
          } catch (error: any) {
            console.error(`Error posting file to ${CloudType}:`, error);
            
            // Categorize and re-throw with user-friendly messages
            if (error.message?.includes('unauthorized') || error.message?.includes('access_denied') || error.message?.includes('Authentication failed')) {
              throw new Error('Authentication expired. Please reconnect your account.');
            } else if (error.message?.includes('network') || error.message?.includes('timeout') || error.message?.includes('ENOTFOUND')) {
              throw new Error('Network connection failed. Please check your internet connection.');
            } else if (error.message?.includes('quota') || error.message?.includes('storage full') || error.message?.includes('insufficient storage')) {
              throw new Error('Storage quota exceeded. Please free up space or upgrade your account.');
            } else if (error.message?.includes('too large') || error.message?.includes('size limit') || error.message?.includes('file size')) {
              throw new Error('File is too large for upload. Please reduce file size.');
            } else if (error.message?.includes('permission') || error.message?.includes('forbidden')) {
              throw new Error('Permission denied. You may not have write access to this location.');
            } else if (error.message?.includes('exists') || error.message?.includes('conflict')) {
              throw new Error('A file with this name already exists.');
            } else {
              throw new Error(`Failed to upload file: ${error.message || 'Unknown error'}`);
            }
          }
        }
      }
    }
    
    throw new Error(`No ${CloudType} account found with ID: ${accountId}`);
  } catch (error: any) {
    console.error(`Cloud file post error for ${CloudType}:`, error);
    throw error; 
  }
}

// Store cloud account tokens using safeStorage
export async function saveCloudAccountLocaStorage(cloudType: CloudType, accountId: string, tokens: AuthTokens | null): Promise<void> {
  try {
    // token is null on onedrive
    const serializedTokens = JSON.stringify(tokens);
    
    // Encrypt data
    const encryptedTokens = encryptData(serializedTokens);
  
    store.set(`${cloudType}.${encodeAccountId(accountId)}`, encryptedTokens);
    console.log(`Saved encrypted ${cloudType}.${encodeAccountId(accountId)} to secure storage`);
  } catch (error) {
    console.error('Error saving cloud account to secure storage:', error);
  }
}

export async function deleteFile(cloudType: CloudType, accountId: string, filePath: string): Promise<void> {
  try {
    filePath = filePath.replace(CLOUD_HOME, "");
    console.log('Deleting file from cloud account:', cloudType, accountId, filePath);
    
    const accounts = StoredAccounts.get(cloudType);
    if (accounts) {
      for (const account of accounts) {
        if (account.getAccountId() === accountId) {
          try {
            return await account.deleteFile(filePath);
          } catch (error: any) {
            console.error(`Error deleting file from ${cloudType}:`, error);
            
            if (error.message?.includes('unauthorized') || error.message?.includes('access_denied') || error.message?.includes('Authentication failed')) {
              throw new Error('Authentication expired. Please reconnect your account.');
            } else if (error.message?.includes('network') || error.message?.includes('timeout') || error.message?.includes('ENOTFOUND')) {
              throw new Error('Network connection failed. Please check your internet connection.');
            } else if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
              throw new Error('File not found or already deleted.');
            } else if (error.message?.includes('permission') || error.message?.includes('forbidden')) {
              throw new Error('Permission denied. You may not have delete access for this file.');
            } else if (error.message?.includes('locked') || error.message?.includes('in use')) {
              throw new Error('File is currently locked or in use by another application.');
            } else {
              throw new Error(`Failed to delete file: ${error.message || 'Unknown error'}`);
            }
          }
        }
      }
    }
    
    throw new Error(`No ${cloudType} account found with ID: ${accountId}`);
  } catch (error: any) {
    console.error(`Cloud file delete error for ${cloudType}:`, error);
    throw error; 
  }
}

export async function searchFilesFromStorageAccount(cloudType: CloudType, accountId: string, rootPath: string, pattern: string, excludePatterns: string[]): Promise<FileSystemItem[]> {
  try {
    rootPath = rootPath.replace(CLOUD_HOME, "");
    console.log('Searching files in cloud account:', cloudType, accountId, rootPath, pattern, excludePatterns);
    const accounts = StoredAccounts.get(cloudType);
    if (accounts) {
      for (const account of accounts) {
        if (account.getAccountId() === accountId) {
          try {
            return await account.searchFiles(rootPath, pattern, excludePatterns);
          } catch (error: any) {
            console.error(`Error searching files in ${cloudType}:`, error);
            // Categorize and re-throw with user-friendly messages
            if (error.message?.includes('unauthorized') || error.message?.includes('access_denied') || error.message?.includes('Authentication failed')) {
              throw new Error('Authentication expired. Please reconnect your account.');
            } else if (error.message?.includes('network') || error.message?.includes('timeout') || error.message?.includes('ENOTFOUND')) {
              throw new Error('Network connection failed. Please check your internet connection.');
            } else if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
              throw new Error('Root path not found or no longer exists.');
            } else if (error.message?.includes('quota') || error.message?.includes('storage')) {
              throw new Error('Storage quota exceeded or storage service unavailable.');
            } else if (error.message?.includes('invalid pattern') || error.message?.includes('syntax error')) {
              throw new Error('Invalid search pattern. Please check your search criteria.');
            } else if (error.message?.includes('permission') || error.message?.includes('forbidden')) {
              throw new Error('Permission denied. You may not have access to search in this location.');
            } else {
              throw new Error(`Failed to search files: ${error.message || 'Unknown error'}`);
            }
          }
        }
      }
    }
    throw new Error(`No ${cloudType} account found with ID: ${accountId}`);
  } catch (error: any) {
    console.error(`Cloud file search error for ${cloudType}:`, error);
    throw error;
  }
}

// Calculate the total size of a folder recursively for cloud storage
export async function calculateFolderSize(cloudType: CloudType, accountId: string, folderPath: string): Promise<number> {
  try {
    folderPath = folderPath.replace(CLOUD_HOME, "");
    console.log('Calculating folder size for cloud account:', cloudType, accountId, folderPath);
    
    const accounts = StoredAccounts.get(cloudType);
    if (accounts) {
      for (const account of accounts) {
        if (account.getAccountId() === accountId) {
          try {
            return await account.calculateFolderSize(folderPath);
          } catch (error: any) {
            console.error(`Error calculating folder size for ${cloudType}:`, error);
            
            // error messages
            if (error.message?.includes('unauthorized') || error.message?.includes('access_denied') || error.message?.includes('Authentication failed')) {
              throw new Error('Authentication expired. Please reconnect your account.');
            } else if (error.message?.includes('network') || error.message?.includes('timeout') || error.message?.includes('ENOTFOUND')) {
              throw new Error('Network connection failed. Please check your internet connection.');
            } else if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
              throw new Error('Folder not found or no longer exists.');
            } else if (error.message?.includes('quota') || error.message?.includes('storage')) {
              throw new Error('Storage quota exceeded or storage service unavailable.');
            } else {
              throw new Error(`Failed to calculate folder size: ${error.message || 'Unknown error'}`);
            }
          }
        }
      }
    }
    
    throw new Error(`No ${cloudType} account found with ID: ${accountId}`);
  } catch (error: any) {
    console.error(`Cloud folder size calculation error for ${cloudType}:`, error);
    throw error; 
  }
}

// Create a new directory in cloud storage
export async function createDirectory(cloudType: CloudType, accountId: string, dirPath: string): Promise<void> {
  try {
    dirPath = dirPath.replace(CLOUD_HOME, "");
    console.log('Creating directory in cloud account:', cloudType, accountId, dirPath);

    if (dirPath === '' || dirPath === '/') {
      console.log('Skipping directory creation for root path');
      return; // Skip creating root directory
    }
    
    const accounts = StoredAccounts.get(cloudType);
    if (accounts) {
      for (const account of accounts) {
        if (account.getAccountId() === accountId) {
          try {
            return await account.createDirectory(dirPath);
          } catch (error: any) {
            console.error(`Error creating directory in ${cloudType}:`, error);
            
            // error messages
            if (error.message?.includes('unauthorized') || error.message?.includes('access_denied') || error.message?.includes('Authentication failed')) {
              throw new Error('Authentication expired. Please reconnect your account.');
            } else if (error.message?.includes('network') || error.message?.includes('timeout') || error.message?.includes('ENOTFOUND')) {
              throw new Error('Network connection failed. Please check your internet connection.');
            } else if (error.message?.includes('exists') || error.message?.includes('conflict') || error.message?.includes('nameAlreadyExists')) {
              throw new Error('A folder with this name already exists.');
            } else if (error.message?.includes('permission') || error.message?.includes('forbidden')) {
              throw new Error('Permission denied. You may not have write access to this location.');
            } else if (error.message?.includes('quota') || error.message?.includes('storage full') || error.message?.includes('insufficient storage')) {
              throw new Error('Storage quota exceeded. Please free up space or upgrade your account.');
            } else if (error.message?.includes('invalid') || error.message?.includes('name')) {
              throw new Error('Invalid folder name. Please use a different name.');
            } else {
              throw new Error(`Failed to create directory: ${error.message || 'Unknown error'}`);
            }
          }
        }
      }
    }
    
    throw new Error(`No ${cloudType} account found with ID: ${accountId}`);
  } catch (error: any) {
    console.error(`Cloud directory creation error for ${cloudType}:`, error);
    throw error; 
  }
}

// Remove CloudStorage account from local storage and StoredAccounts
export async function removeCloudAccount(cloudType: CloudType, accountId: string): Promise<boolean> {
  try {
    console.log(`Removing cloud account: ${cloudType}, Account ID: ${accountId}`);
    
    // Remove from local storage
    const encodedAccountId = encodeAccountId(accountId);
    const cloudTypeData = store.get(cloudType) as Record<string, any> || {};
    
    if (cloudTypeData[encodedAccountId]) {
      delete cloudTypeData[encodedAccountId];
      
      // If there are no more accounts for this cloud type, remove the cloud type 
      if (Object.keys(cloudTypeData).length === 0) {
        store.delete(cloudType);
      } else {
        store.set(cloudType, cloudTypeData);
      }
      
      console.log(`Removed ${cloudType} account ${accountId} from local storage`);
    }
    
    const accounts = StoredAccounts.get(cloudType);
    if (accounts) {
      const index = accounts.findIndex(account => account.getAccountId() === accountId);
      if (index !== -1) {
        accounts.splice(index, 1);
        console.log(`Removed ${cloudType} account ${accountId} from StoredAccounts`);
        
        // If no more accounts for this cloud type, remove the entry
        if (accounts.length === 0) {
          StoredAccounts.delete(cloudType);
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error(`Failed to remove cloud account ${cloudType}.${accountId}:`, error);
    return false;
  }
}

// to avoid conflict with dot in accountId
function encodeAccountId(key: string): string {
  return key.replace(/\./g, '__dot__');
}

// to avoid conflict with dot in accountId
function decodeAccountId(key: string): string {
  return key.replace(/__dot__/g, '.');
}

// Get item info from cloud storage
export async function getItemInfo(cloudType: CloudType, accountId: string, itemPath: string): Promise<FileSystemItem> {
  try {
    itemPath = itemPath.replace(CLOUD_HOME, "");
    console.log('Getting item info from cloud account:', cloudType, accountId, itemPath);

    const accounts = StoredAccounts.get(cloudType);
    if (accounts) {
      for (const account of accounts) {
        if (account.getAccountId() === accountId) {
          try {
            return await account.getItemInfo(itemPath);
          } catch (error: any) {
            console.error(`Error getting item info from ${cloudType}:`, error);

            // Categorize and re-throw with user-friendly messages
            if (error.message?.includes('unauthorized') || error.message?.includes('access_denied') || error.message?.includes('Authentication failed')) {
              throw new Error('Authentication expired. Please reconnect your account.');
            } else if (error.message?.includes('network') || error.message?.includes('timeout') || error.message?.includes('ENOTFOUND')) {
              throw new Error('Network connection failed. Please check your internet connection.');
            } else if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
              throw new Error('File not found or no longer exists.');
            } else if (error.message?.includes('quota') || error.message?.includes('storage')) {
              throw new Error('Storage quota exceeded or storage service unavailable.');
            } else {
              throw new Error(`Failed to get file info: ${error.message || 'Unknown error'}`);
            }
          }
        }
      }
    }
    
    throw new Error(`No ${cloudType} account found with ID: ${accountId}`);
  } catch (error: any) {
    console.error(`Cloud file info error for ${cloudType}:`, error);
    throw error; 
  }
}

export async function getDirectoryInfo(cloudType: CloudType, accountId: string, dirPath: string): Promise<FileSystemItem> {
  try {
    dirPath = dirPath.replace(CLOUD_HOME, "");
    console.log('Getting directory info from cloud account:', cloudType, accountId, dirPath);

    const accounts = StoredAccounts.get(cloudType);
    if (accounts) {
      for (const account of accounts) {
        if (account.getAccountId() === accountId) {
          try {
            return await account.getDirectoryInfo(dirPath);
          } catch (error: any) {
            console.error(`Error getting directory info from ${cloudType}:`, error);

            // Categorize and re-throw with user-friendly messages
            if (error.message?.includes('unauthorized') || error.message?.includes('access_denied') || error.message?.includes('Authentication failed')) {
              throw new Error('Authentication expired. Please reconnect your account.');
            } else if (error.message?.includes('network') || error.message?.includes('timeout') || error.message?.includes('ENOTFOUND')) {
              throw new Error('Network connection failed. Please check your internet connection.');
            } else if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
              throw new Error('Directory not found or no longer exists.');
            } else if (error.message?.includes('quota') || error.message?.includes('storage')) {
              throw new Error('Storage quota exceeded or storage service unavailable.');
            } else {
              throw new Error(`Failed to get directory info: ${error.message || 'Unknown error'}`);
            }
          }
        }
      }
    }
    
    throw new Error(`No ${cloudType} account found with ID: ${accountId}`);
  } catch (error: any) {
    console.error(`Cloud directory tree error for ${cloudType}:`, error);
    throw error; 
  }
}

// Get directory tree from cloud storage
export async function getDirectoryTree(cloudType: CloudType, accountId: string, dirPath: string): Promise<FileSystemItem[]> {
  try {
    dirPath = dirPath.replace(CLOUD_HOME, "");
    console.log('Getting directory tree from cloud account:', cloudType, accountId, dirPath);
    
    const accounts = StoredAccounts.get(cloudType);
    if (accounts) {
      for (const account of accounts) {
        if (account.getAccountId() === accountId) {
          try {
            return await account.getDirectoryTree(dirPath);
          } catch (error: any) {
            console.error(`Error getting directory tree from ${cloudType}:`, error);
            
            // Categorize and re-throw with user-friendly messages
            if (error.message?.includes('unauthorized') || error.message?.includes('access_denied') || error.message?.includes('Authentication failed')) {
              throw new Error('Authentication expired. Please reconnect your account.');
            } else if (error.message?.includes('network') || error.message?.includes('timeout') || error.message?.includes('ENOTFOUND')) {
              throw new Error('Network connection failed. Please check your internet connection.');
            } else if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
              throw new Error('Directory not found or no longer exists.');
            } else if (error.message?.includes('quota') || error.message?.includes('storage')) {
              throw new Error('Storage quota exceeded or storage service unavailable.');
            } else {
              throw new Error(`Failed to get directory tree: ${error.message || 'Unknown error'}`);
            }
          }
        }
      }
    }
    
    throw new Error(`No ${cloudType} account found with ID: ${accountId}`);
  } catch (error: any) {
    console.error(`Cloud directory tree error for ${cloudType}:`, error);
    throw error; 
  }
}