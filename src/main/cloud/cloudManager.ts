/*
This file works as a middleman between the main process and the cloud storage providers.
*/

import { CloudType } from "../../types/cloudType";
import Store from 'electron-store';
import { AuthTokens, CloudStorage } from './cloudStorage';
import { GoogleDriveStorage } from './googleStorage';
import { FileSystemItem } from "../../types/fileSystem";

export const store = new Store();

// List <CloudStorage> StoredAccounts
const StoredAccounts: Map<CloudType, CloudStorage[]> = new Map();

// Traverse electron local storage to load all stored accounts into StoredAccounts
export async function clearStore(): Promise<void> {
  store.clear(); // debugging
  console.log('Cleared local storage');
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
        const tokens: AuthTokens = typeof tokenData === 'string'
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
            // cloudStorageInstance = new OneDriveStorage();
            break;
          case CloudType.Dropbox:
            // cloudStorageInstance = new iCloudStorage();
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
  let cloudStorageInstance: CloudStorage | null = null;
  switch (cloudType) {
    case CloudType.GoogleDrive:
      console.log('Cloud type is GoogleDrive');
      cloudStorageInstance = new GoogleDriveStorage();
      break;
    case CloudType.Dropbox:
      console.log('Cloud type is Dropbox');
      // cloudStorageInstance = new DropboxStorage();
      break;
    case CloudType.OneDrive:
      console.log('Cloud type is OneDrive');
      // cloudStorageInstance = new OneDriveStorage();
      break;
    case CloudType.ICloud:
      console.log('Cloud type is ICloud');
      // cloudStorageInstance = new ICloudStorage();
      break;
    default:
      console.error('Cloud type is not supported');
      return null;
  }

  if (!cloudStorageInstance) {
    console.error('Cloud storage instance is null');
    return null;
  }

  // oauth2 authentication process ==> get tokens and accountId for the cloudStorageInstance
  await cloudStorageInstance.connect();

  // get the auth tokens and accountId from the cloudStorageInstance
  const authTokens = cloudStorageInstance.getAuthToken();
  const accountId = cloudStorageInstance.getAccountId();
  if (authTokens && accountId) {
    // Save the account to local storage
    await saveCloudAccountLocaStorage(cloudType, accountId, authTokens);
    // Add the account to StoredAccounts
    if (!StoredAccounts.has(cloudType)) {
      StoredAccounts.set(cloudType, []);
    }
    StoredAccounts.get(cloudType)?.push(cloudStorageInstance);
  } else {
    console.error(`Failed to connect to ${cloudType} account`);
  }
  return accountId;
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

export async function readDirectory(CloudType: CloudType, accountId: string, dir: string): Promise<FileSystemItem[]> { // TODO return list of files?
  console.log('Getting files from cloud account:', CloudType, accountId, dir);
  const accounts = StoredAccounts.get(CloudType);
  if (accounts) {
    for (const account of accounts) {
      if (account.getAccountId() === accountId) {
        return await account.readDir(dir);
      }
    }
  }
  console.log(`No ${CloudType} accounts found`);
  return [];
}

// TODO: implement encryption for local storage, or we don't need it?
async function saveCloudAccountLocaStorage(cloudType: CloudType, accountId: string, tokens: AuthTokens): Promise<void> {
  try {
    const serializedTokens = JSON.stringify(tokens);
  
    store.set(`${cloudType}.${encodeAccountId(accountId)}`, serializedTokens);
    console.log(`Saved ${cloudType}.${encodeAccountId(accountId)} to local storage:`, serializedTokens);
  } catch (error) {
    console.error('Error saving cloud account to local storage:', error);
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