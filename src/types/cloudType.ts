/**
 * Cloud storage service type definitions and constants
 */

/**
 * Enumeration of supported cloud storage providers
 * Used to identify and route operations to the appropriate cloud service
 */
export enum CloudType {
    /** Local file system storage */
    Local = 'Local',
    /** Google Drive cloud storage service */
    GoogleDrive = 'GoogleDrive',
    /** Dropbox cloud storage service */
    Dropbox = 'Dropbox',
    /** Microsoft OneDrive cloud storage service */
    OneDrive = 'OneDrive',
}

export interface StorageError {
    status: number; // HTTP status code
    message: string; // Error message
    body?: string; // Optional response body for more details
}

/** Represents the root/home folder in cloud storage file explorers */
export const CLOUD_HOME = "Home";