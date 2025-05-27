// preload.ts - Bridge between main and renderer processes
import { contextBridge, ipcRenderer } from 'electron'
import type { FileContent, FileSystemItem } from '../types/fileSystem'
import { CloudType } from '../types/cloudType';

contextBridge.exposeInMainWorld('cloudFsApi', {
    connectNewCloudAccount: (cloudType: CloudType) =>
        ipcRenderer.invoke('connect-new-cloud-account', cloudType) as Promise<string | null>,
    getConnectedCloudAccounts: (cloudType: CloudType) =>
        ipcRenderer.invoke('get-connected-cloud-accounts', cloudType) as Promise<string[] | null>,
    readDirectory: (cloudType: CloudType, accountId: string, dir: string) =>
        ipcRenderer.invoke('cloud-read-directory', cloudType, accountId, dir) as Promise<FileSystemItem[]>,
    getFile: (cloudType: CloudType, accountId: string, filePath: string) =>
        ipcRenderer.invoke('cloud-get-file', cloudType, accountId, filePath) as Promise<FileContent>,
    postFile: (cloudType: CloudType, accountId: string, fileName: string, folderPath: string, data: string) =>
        ipcRenderer.invoke('cloud-post-file', cloudType, accountId, fileName, folderPath, data) as Promise<void>,
});

contextBridge.exposeInMainWorld('fsApi', {
    getHome: () => {
        const home = process.env.HOME
        return home
    },
    readDirectory: (dir: string) =>
        ipcRenderer.invoke('read-directory', dir) as Promise<FileSystemItem[]>,
    getFile: (filePath: string) =>
        ipcRenderer.invoke('get-file', filePath) as Promise<FileContent>,
    postFile: (fileName: string, folderPath: string, data: Buffer) =>
        ipcRenderer.invoke('post-file', fileName, folderPath, data) as Promise<void>
})