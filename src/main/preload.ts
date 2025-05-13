// preload.ts
import { contextBridge, ipcRenderer } from 'electron';
import { AuthTokens } from './token_storage';

contextBridge.exposeInMainWorld('electronAPI', {
    googleAuth: () => ipcRenderer.invoke('google-auth'),
    saveAuthTokens: (tokens: AuthTokens) => ipcRenderer.invoke('save-auth-tokens', tokens),
    getAuthTokens: () => ipcRenderer.invoke('get-auth-tokens'),
    clearAuthTokens: () => ipcRenderer.invoke('clear-auth-tokens'),
});