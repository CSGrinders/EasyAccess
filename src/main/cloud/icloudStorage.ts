import dotenv from 'dotenv';

import { CloudStorage,AuthTokens, isValidToken } from './cloudStorage';
import { FileSystemItem } from "../../types/fileSystem";

dotenv.config();


export class ICloudStorage implements CloudStorage {
  accountId?: string | undefined;
  AuthToken?: AuthTokens | null | undefined;

  async connect(): Promise<void> {
    // TODO: Implement iCloud authentication
    throw new Error('Method not implemented.');
  }
  async readDir(dir: string): Promise<FileSystemItem[]> {
    throw new Error('Method not implemented.');
  }
  getAccountId(): string {
    return this.accountId || '';
  }
  getAuthToken(): AuthTokens | null {
    return this.AuthToken || null;
  }
}