// preload.ts - Bridge between main and renderer processes
import { contextBridge, ipcRenderer } from 'electron'
import type { FileContent, FileSystemItem } from '../types/fileSystem'
import { CloudType } from '../types/cloudType';
import { deleteFile } from './cloud/cloudManager';

contextBridge.exposeInMainWorld('cloudFsApi', {
    connectNewCloudAccount: (cloudType: CloudType) =>
        ipcRenderer.invoke('connect-new-cloud-account', cloudType) as Promise<string | null>,
    getConnectedCloudAccounts: (cloudType: CloudType) =>
        ipcRenderer.invoke('get-connected-cloud-accounts', cloudType) as Promise<string[] | null>,
    readDirectory: (cloudType: CloudType, accountId: string, dir: string) =>
        ipcRenderer.invoke('cloud-read-directory', cloudType, accountId, dir) as Promise<FileSystemItem[]>,
    getFile: (cloudType: CloudType, accountId: string, filePath: string) =>
        ipcRenderer.invoke('cloud-get-file', cloudType, accountId, filePath) as Promise<FileContent>,
    postFile: (cloudType: CloudType, accountId: string, fileName: string, folderPath: string, data: Buffer) =>
        ipcRenderer.invoke('cloud-post-file', cloudType, accountId, fileName, folderPath, data) as Promise<void>,
    deleteFile: (cloudType: CloudType, accountId: string, filePath: string) =>
        ipcRenderer.invoke('cloud-delete-file', cloudType, accountId, filePath) as Promise<void>,
    createDirectory: (cloudType: CloudType, accountId: string, folderPath: string, folderName: string) =>
        ipcRenderer.invoke('cloud-create-directory', cloudType, accountId, folderPath, folderName) as Promise<void>,
    calculateFolderSize: (cloudType: CloudType, accountId: string, folderPath: string) =>
        ipcRenderer.invoke('cloud-calculate-folder-size', cloudType, accountId, folderPath) as Promise<number>,
    removeAccount: (cloudType: CloudType, accountId: string) =>
        ipcRenderer.invoke('remove-cloud-account', cloudType, accountId) as Promise<boolean>,
    cancelAuthentication: (cloudType: CloudType) =>
        ipcRenderer.invoke('cancel-cloud-authentication', cloudType) as Promise<boolean>,
    clearData: () =>
        ipcRenderer.invoke('delete-accounts') as Promise<boolean>
});

contextBridge.exposeInMainWorld('fsApi', {
    getHome: () => {
        const home = process.env.HOME
        return home
    },
    readDirectory: (dir: string) =>
        ipcRenderer.invoke('read-directory', dir) as Promise<FileSystemItem[]>,
    calculateFolderSize: (dirPath: string) =>
        ipcRenderer.invoke('calculate-folder-size', dirPath) as Promise<number>,
    getFile: (filePath: string) =>
        ipcRenderer.invoke('get-file', filePath) as Promise<FileContent>,
    postFile: (fileName: string, folderPath: string, data: Buffer) =>
        ipcRenderer.invoke('post-file', fileName, folderPath, data) as Promise<void>,
    deleteFile: (filePath: string) =>
        ipcRenderer.invoke('delete-file', filePath) as Promise<void>,
    createDirectory: (dirPath: string, dirName: string) =>
        ipcRenderer.invoke('create-directory', dirPath, dirName) as Promise<void>,
})

contextBridge.exposeInMainWorld('electronAPI', {
    openExternalUrl: (url: string) => ipcRenderer.invoke('open-external-url', url) as Promise<{ success: boolean, error?: any }>,
    openFile: (fileContent: FileContent) => ipcRenderer.invoke('open-file', fileContent) as Promise<void>,
});

contextBridge.exposeInMainWorld('mcpApi', {
    processQuery: (query: string) => ipcRenderer.invoke('mcp-process-query', query),
    reinitialize: () => ipcRenderer.invoke('reinitialize-mcp'),
    getStatus: () => ipcRenderer.invoke('get-mcp-status')
});

contextBridge.exposeInMainWorld('permissionApi', {
    getPermissions: () => ipcRenderer.invoke('get-permissions'),
    requestPermissions: () => ipcRenderer.invoke('request-permissions'),
    resetPermissions: () => ipcRenderer.invoke('reset-permissions'),
});