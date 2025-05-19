import { app, BrowserWindow, ipcMain } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { loadAuthTokens } from './token_storage';
import { CloudType } from "../types/cloudType";


const createWindow = () => {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        frame: false,
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            devTools: true
        }

    });
    console.log('window created');

    win.loadURL('http://localhost:3000').then(r => console.log("loaded"));
    win.once('ready-to-show', () => {
        win.show()
        win.webContents.openDevTools({ mode: 'right' })
    })
};

app.whenReady().then(() => {
    createWindow();
});

ipcMain.handle('load-auth-tokens', async (event, cloudType: CloudType) => {
    loadAuthTokens(cloudType);
});


ipcMain.handle('read-directory', async (_e, dirPath: string) => {
    const items = await fs.promises.readdir(dirPath, { withFileTypes: true })
    return Promise.all(items.map(async item => ({
        name: item.name,
        isDirectory: item.isDirectory(),
        path: path.join(dirPath, item.name),
        size: (await fs.promises.stat(path.join(dirPath, item.name))).size,
        modifiedTime: (await fs.promises.stat(path.join(dirPath, item.name))).mtimeMs
    })))
})

ipcMain.handle('read-file', async (_e, filePath: string) => {
    return fs.promises.readFile(filePath, 'utf8')
})