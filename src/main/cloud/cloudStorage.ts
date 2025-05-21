/*

Each cloud storage provider should implement this interface. 
Each provider should contain its own authentication tokens (access token, refresh token, etc.) and authenticated client.
Each provider has its own authentication method and file retrieval process.
*/

import { FileSystemItem } from "../../types/fileSystem";

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

    connect(): Promise<void | any>;
    readDir(dir: string): Promise<FileSystemItem[]>; //TODO
    readFile(filePath: string): Promise<string>
    getAccountId(): string;
    getAuthToken(): AuthTokens | null;
}


export function isValidToken(tokens: AuthTokens): boolean {
    return !!tokens.access_token && tokens.expiry_date > Date.now();
}
