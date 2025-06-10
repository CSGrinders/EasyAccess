/*
This file works as a middleman between the main process and the cloud storage providers.
*/

import { CLOUD_HOME, CloudType } from "../../types/cloudType";
import Store from 'electron-store';
import { AuthTokens, CloudStorage } from './cloudStorage';
import { GoogleDriveStorage } from './googleStorage';
import { FileContent, FileSystemItem } from "../../types/fileSystem";
import { OneDriveStorage } from "./onedriveStorage";
import { BrowserWindow } from "electron";
import { DropboxStorage } from "./dropboxStorage";

const mime = require('mime-types');

export const store = new Store();

// List <CloudStorage> StoredAccounts
const StoredAccounts: Map<CloudType, CloudStorage[]> = new Map();

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
        // const tokens: AuthTokens = typeof tokenData === 'string'
        //   ? JSON.parse(tokenData)
        //   : tokenData as AuthTokens;

        const tokens: AuthTokens | null = !tokenData
          ? null
          : typeof tokenData === 'string'
            ? JSON.parse(tokenData)
            : tokenData as AuthTokens;

        console.log(`Cloud: ${cloudType}, Account ID: ${accountId}`, tokens);
        
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
    });

    // Register the active authentication
    activeAuthentications.set(cloudType, {
      cloudType,
      promise: authPromise,
      cancel: cancelAuth
    });

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


  // filePath: /HOME/dir/temp.txt
  // returns the file content in base64 format
export async function getFile(CloudType: CloudType, accountId: string, filePath: string): Promise<FileContent | null> {
  try {
    filePath = filePath.replace(CLOUD_HOME, "");
    console.log('Getting file from cloud account:', CloudType, accountId, filePath);
    
    const accounts = StoredAccounts.get(CloudType);
    if (accounts) {
      for (const account of accounts) {
        if (account.getAccountId() === accountId) {
          try {
            return await account.getFile(filePath);
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
export async function postFile(CloudType: CloudType, accountId: string, fileName: string, folderPath: string, data: Buffer): Promise<void> {
  try {
    folderPath = folderPath.replace(CLOUD_HOME, "");
    console.log('Posting file to cloud account:', CloudType, accountId, fileName, folderPath);
    
    const accounts = StoredAccounts.get(CloudType);
    if (accounts) {
      for (const account of accounts) {
        if (account.getAccountId() === accountId) {
          try {
            const type = mime.lookup(fileName) || 'application/octet-stream'; // default to binary if no mime type found
            return await account.postFile(fileName, folderPath, type, data);
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

// TODO: implement encryption for local storage, or we don't need it?
export async function saveCloudAccountLocaStorage(cloudType: CloudType, accountId: string, tokens: AuthTokens | null): Promise<void> {
  try {
    // token is null on onedrive
    const serializedTokens = JSON.stringify(tokens);
  
    store.set(`${cloudType}.${encodeAccountId(accountId)}`, serializedTokens);
    console.log(`Saved ${cloudType}.${encodeAccountId(accountId)} to local storage:`, serializedTokens);
  } catch (error) {
    console.error('Error saving cloud account to local storage:', error);
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