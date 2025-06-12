/*

Each cloud storage provider should implement this interface. 
Each provider should contain its own authentication tokens (access token, refresh token, etc.) and authenticated client.
Each provider has its own authentication method and file retrieval process.
*/

import { FileContent, FileSystemItem } from "../../types/fileSystem";

// load tokens from the store or from the cloud
export interface CloudStorage {
    accountId?: string;
    accessToken?: string;
    userKey?: string;

    connect(userKey: string): Promise<void | any>;
    readDir(dir: string): Promise<FileSystemItem[]>; //TODO
    // readFile(filePath: string): Promise<string>
    getFile(filePath: string): Promise<FileContent>; //TODO
    postFile(fileName: string, folderPath: string, type: string, data: Buffer): Promise<void>; //TODO
    getAccountId(): string;
    getAccessToken(): string | null;
    deleteFile(filePath: string): Promise<void>; //TODO
    initAccount(accountId: string | null, userKey?: string | null): Promise<void>;  // initialize the account with the accountId and userKey (request access token from the server)
}

