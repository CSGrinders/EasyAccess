import { app, BrowserWindow, ipcMain } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { postFile, connectNewCloudAccount, getConnectedCloudAccounts, readDirectory, loadStoredAccounts, clearStore, getFile } from './cloud/cloudManager';
import { CloudType } from "@Types/cloudType";
import { FileContent } from '@Types/fileSystem';


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
ipcMain.handle('cloud-get-file', async (_e, cloudType: CloudType, accountId: string, filePath: string) => {
    return getFile(cloudType, accountId, filePath);
});
ipcMain.handle('cloud-post-file', async (_e, cloudType: CloudType, accountId: string, fileName: string, folderPath: string, data: Buffer) => {
    return postFile(cloudType, accountId, fileName, folderPath, data);
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

ipcMain.handle('get-file', async (_e, filePath: string) => {
    console.log('Reading file:', filePath);
    const data = await fs.promises.readFile(filePath);
    const fileContent: FileContent = {
        name: filePath.split(path.sep).pop() || '', // Get the file name from the path
        content: data, 
        type: filePath.split('.').pop() || 'txt', // Get the file extension or default to 'txt'
    };

    return fileContent;
})

ipcMain.handle('post-file', async (_e, fileName: string, folderPath: string, data: Buffer) => {
    console.log('Posting file:', fileName, folderPath, data);
    const filePath = path.join(folderPath, fileName);
    fs.writeFileSync(filePath, data);
})