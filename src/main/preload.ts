// preload.ts - Bridge between main and renderer processes
import { contextBridge, ipcRenderer } from 'electron'
import type { FileSystemItem } from '../types/fileSystem'

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