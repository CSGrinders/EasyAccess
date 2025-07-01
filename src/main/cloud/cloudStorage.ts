/*

Each cloud storage provider should implement this interface. 
Each provider should contain its own authentication tokens (access token, refresh token, etc.) and authenticated client.
Each provider has its own authentication method and file retrieval process.
*/

import { FileContent, FileSystemItem } from "../../types/fileSystem";
import { progressCallbackData } from "../transfer/transferManager";

export type AuthTokens = {
    access_token: string;
    refresh_token: string;
    expiry_date: number;
};
  
export type StoredTokens = {
    [accountId: string]: AuthTokens;
};

// load tokens from the store or from the cloud
export interface CloudStorage {
    accountId?: string;
    AuthToken?: AuthTokens | null;

    // auth token and accountId are set after connect
    connect(): Promise<void | any>;
    readDir(dir: string): Promise<FileSystemItem[]>;
    readFile(filePath: string): Promise<string>;
    getFile(filePath: string, progressCallback?: (downloaded: number, total: number) => void, abortSignal?: AbortSignal): Promise<FileContent>;
    postFile(fileName: string, folderPath: string, type: string, data: Buffer, progressCallback?: (uploaded: number, total: number) => void, abortSignal?: AbortSignal): Promise<void>;
    createDirectory(dirPath: string): Promise<void>; // Create a new directory
    getAccountId(): string;
    getAuthToken(): AuthTokens | null;
    deleteFile(filePath: string): Promise<void>;
    transferLocalToCloud(
        fileInfo: any,
        progressCallback?: (data: progressCallbackData) => void,
        abortSignal?: AbortSignal
    ): Promise<void>; // Transfer file to another cloud or local storage

    searchFiles(rootPath: string, pattern: string, excludePatterns: string[]): Promise<FileSystemItem[]>;
    getFileInfo(filePath: string): Promise<FileSystemItem>;
    getDirectoryTree(dir: string): Promise<FileSystemItem[]>;
    calculateFolderSize(folderPath: string): Promise<number>; // Calculate total size of a folder recursively
}

export async function generateCodes(): Promise<{ codeVerifier: string, codeChallenge: string }> {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const codeVerifier = btoa(String.fromCharCode(...array))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const base64 = btoa(String.fromCharCode(...hashArray));
    const codeChallenge = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    return { codeVerifier, codeChallenge };
}


export function isValidToken(tokens: AuthTokens): boolean {
    return !!tokens.access_token && tokens.expiry_date > Date.now();
}
