/**
 * File system type definitions and API interfaces
 * Handles both local and cloud file system operations, metadata, and content management
 */

import { CloudType } from "./cloudType";

/**
 * Represents a file or directory item in the file system
 * Used for displaying file listings and metadata across local and cloud storage
 */
export interface FileSystemItem {
    /** Unique identifier for the item  */
    id: string;
    
    /** Display name of the file or directory */
    name: string;
    
    /** Whether this item is a directory (true) or file (false) */
    isDirectory: boolean;
    
    /** Full path to the item in the file system */
    path: string;
    
    /** File size in bytes */
    size?: number;
    
    /** Last modification timestamp */
    modifiedTime?: number;
}

/**
 * Represents file content and metadata for file operations
 * Handles different content types including binary files and cloud-specific formats
 */
export interface FileContent {
    /** Original filename */
    name: string;
    
    /** File content as Buffer */
    content?: Buffer;
    
    /** MIME type of the file */
    type: string;
    
    /** Direct URL to the file */
    url?: string;
    
    /** Full path to the file in the source file system */
    path: string;
    
    /** Cloud service type if file originates from cloud storage */
    sourceCloudType: CloudType | null;
    
    /** Account identifier for cloud storage source */
    sourceAccountId: string | null;
}

/**
 * Global API extensions for Electron main process communication
 * Provides file system operations exposed to the renderer process
 */
declare global {
    interface Window {
        /** File system API exposed by Electron preload script */
        fsApi: {
            /** Get the user's home directory path */
            getHome: () => string;
            
            /** Read directory contents and return file/folder items */
            readDirectory: (dir: string) => Promise<FileSystemItem[]>;
            
            /** Calculate the total size of a directory in bytes */
            calculateFolderSize: (dirPath: string) => Promise<number>;
            
            /** Read file content as string */
            readFile: (file: string) => Promise<string>;
        };

        /** Cloud file system API exposed by Electron preload script */
        cloudFsApi: {
            /** Connect to a new cloud account */
            connectNewCloudAccount: (cloudType: CloudType) => Promise<string | null>;
            
            /** Get connected cloud accounts for a service */
            getConnectedCloudAccounts: (cloudType: CloudType) => Promise<string[] | null>;
            
            /** Read directory contents from cloud storage */
            readDirectory: (cloudType: CloudType, accountId: string, dir: string) => Promise<FileSystemItem[]>;
            
            /** Get file content from cloud storage */
            getFile: (cloudType: CloudType, accountId: string, filePath: string) => Promise<FileContent>;
            
            /** Upload file to cloud storage */
            postFile: (cloudType: CloudType, accountId: string, fileName: string, folderPath: string, data: Buffer) => Promise<void>;
            
            /** Delete file from cloud storage */
            deleteFile: (cloudType: CloudType, accountId: string, filePath: string) => Promise<void>;
            
            /** Calculate the total size of a cloud directory in bytes */
            calculateFolderSize: (cloudType: CloudType, accountId: string, folderPath: string) => Promise<number>;
            
            /** Remove cloud account */
            removeAccount: (cloudType: CloudType, accountId: string) => Promise<boolean>;
            
            /** Cancel cloud authentication */
            cancelAuthentication: (cloudType: CloudType) => Promise<boolean>;
            
            /** Clear all cloud data */
            clearData: () => Promise<boolean>;
        };
    }
}

export {};