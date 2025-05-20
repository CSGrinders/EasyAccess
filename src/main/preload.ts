// preload.ts - Bridge between main and renderer processes
import { contextBridge, ipcRenderer } from 'electron'
import type { FileSystemItem } from '../types/fileSystem'
import { CloudType } from '../types/cloudType';

contextBridge.exposeInMainWorld('electronAPI', {
    connectNewCloudAccount: (cloudType: CloudType) =>
        ipcRenderer.invoke('connect-new-cloud-account', cloudType) as Promise<string | null>,
    getConnectedCloudAccounts: (cloudType: CloudType) =>
        ipcRenderer.invoke('get-connected-cloud-accounts', cloudType) as Promise<string[] | null>,
    readDirectory: (cloudType: CloudType, accountId: string, dir: string) =>
        ipcRenderer.invoke('cloud-read-directory', cloudType, accountId, dir) as Promise<FileSystemItem[]>,
    readFile: (cloudType: CloudType, accountId: string, filePath: string) =>
        ipcRenderer.invoke('cloud-read-file', cloudType, accountId, filePath) as Promise<string>,
});

contextBridge.exposeInMainWorld('fsApi', {
    getHome: () => {
        const home = process.env.HOME
        return home
    },
    readDirectory: (dir: string) =>
        ipcRenderer.invoke('read-directory', dir) as Promise<FileSystemItem[]>,
    readFile: (file: string) =>
        ipcRenderer.invoke('read-file', file) as Promise<string>
})