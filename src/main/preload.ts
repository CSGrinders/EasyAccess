// preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    googleAuth: () => ipcRenderer.invoke('google-auth')
});