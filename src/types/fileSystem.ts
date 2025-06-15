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
            
            /** Read file content as string */
            readFile: (file: string) => Promise<string>;
        };
    }
}

export {};