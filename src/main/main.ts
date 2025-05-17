import { app, BrowserWindow, ipcMain } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { clearStore, connectNewCloudAccount, getConnectedCloudAccounts, readDirectory, loadStoredAccounts } from './cloud/cloudManager';
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

    // load auth tokens from local storage
    loadStoredAccounts(); 

    win.loadURL('http://localhost:3000').then(r => console.log("loaded"));
    win.once('ready-to-show', () => {
        win.show()
        win.webContents.openDevTools({ mode: 'right' })
    })
};

app.whenReady().then(() => {
    createWindow();
});

ipcMain.handle('connect-new-cloud-account', async (_e, cloudType: CloudType) => {
    return connectNewCloudAccount(cloudType);
});
ipcMain.handle('get-connected-cloud-accounts', async (_e, cloudType: CloudType) => {
    return getConnectedCloudAccounts(cloudType);
});
ipcMain.handle('cloud-read-directory', async (_e, cloudType: CloudType, accountId: string, dir: string) => {
    return readDirectory(cloudType, accountId, dir);
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