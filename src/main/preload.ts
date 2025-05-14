// preload.ts - Bridge between main and renderer processes
import { contextBridge, ipcRenderer } from 'electron'
import type { FileSystemItem } from '../types/fileSystem'
import { AuthTokens } from './token_storage';

contextBridge.exposeInMainWorld('electronAPI', {
    googleAuth: () => ipcRenderer.invoke('google-auth'),
    saveAuthTokens: (tokens: AuthTokens) => ipcRenderer.invoke('save-auth-tokens', tokens),
    getAuthTokens: () => ipcRenderer.invoke('get-auth-tokens'),
    clearAuthTokens: () => ipcRenderer.invoke('clear-auth-tokens'),
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