// preload.ts - Bridge between main and renderer processes
import { contextBridge, ipcRenderer } from 'electron'
import type { FileSystemItem } from '../types/fileSystem'
import { CloudType } from '../types/cloudType';

contextBridge.exposeInMainWorld('electronAPI', {
    loadAuthTokens: (cloudType: CloudType) => ipcRenderer.invoke('load-auth-tokens', cloudType),
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