import { app, BrowserWindow, ipcMain, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { postFile, connectNewCloudAccount, getConnectedCloudAccounts, readDirectory, loadStoredAccounts, clearStore, getFile, deleteFile } from './cloud/cloudManager';
import { CloudType } from "@Types/cloudType";
import { FileContent, FileSystemItem } from '@Types/fileSystem';
import mime from 'mime';


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
ipcMain.handle('cloud-delete-file', async (_e, cloudType: CloudType, accountId: string, filePath: string) => {
    return deleteFile(cloudType, accountId, filePath);
});

ipcMain.handle('read-directory', async (_e, dirPath: string) => {
    const items = await fs.promises.readdir(dirPath, { withFileTypes: true })
return Promise.all(items.map(async item => ({
    id: item.name, // Using name as a simple ID, could be improved with a unique identifier
    name: item.name,
    isDirectory: item.isDirectory(),
    path: path.join(dirPath, item.name),
    size: (await fs.promises.stat(path.join(dirPath, item.name))).size,
    modifiedTime: (await fs.promises.stat(path.join(dirPath, item.name))).mtimeMs
})));
})

ipcMain.handle('get-file', async (_e, filePath: string) => {
    console.log('Reading file:', filePath);

    // check if the file or directory exists
    try {
        await fs.promises.access(filePath, fs.constants.R_OK);
    } catch (error) {
        console.error('File or directory does not exist:', filePath, error);
        throw new Error(`File or directory does not exist: ${filePath}`);
    }
    // if the file is a directory, zip it and return the zip file
    const stat = await fs.promises.stat(filePath);
    let data: Buffer;
    if (stat.isDirectory()) {
        const archiver = require('archiver');
        const archive = archiver('zip', { zlib: { level: 9 }});
        const tempFilePath = path.join(app.getPath('temp'), `${path.basename(filePath)}.zip`);
        const stream = fs.createWriteStream(tempFilePath);

        await new Promise<void>((resolve, reject) => {
            const output = fs.createWriteStream(tempFilePath);
            const archive = archiver('zip', { zlib: { level: 9 }});
        
            output.on('close', () => resolve());
            output.on('error', (err) => reject(err));
            archive.on('error', (err: any) => reject(err));
        
            archive.pipe(output);
            archive.directory(filePath, false);
            archive.finalize();
          });
        
        data = await fs.promises.readFile(tempFilePath);
        filePath = tempFilePath; // Update filePath to the zip file path
    } else {
        data = await fs.promises.readFile(filePath);
    }

    const mimeType = mime.lookup(filePath) || 'application/octet-stream'; // Fallback to generic binary

    const fileContent: FileContent = {
        name: filePath.split(path.sep).pop() || '', // Get the file name from the path
        content: data, 
        type: mimeType, // Get the file extension or default to 'txt'
        path: filePath, // Full path to the file
        sourceAccountId: null, // No cloud source for local files
        sourceCloudType: null // No cloud source for local files
    };

    return fileContent;
})

// Handle opening external URLs
ipcMain.handle('open-external-url', async (event, url) => {
    try {
        await shell.openExternal(url);
        return { success: true };
    } catch (error: any) {
        console.error('Failed to open external URL:', error);
        return { success: false, error: error };
    }
});

ipcMain.handle('open-file', async (event, fileContent: FileContent) => {
    try {
      if (fileContent.sourceCloudType) {
        // If the file is from a cloud source, we need to download it first
        const tempFilePath = path.join(app.getPath('temp'), fileContent.name);
        if (fileContent.content) {
            fs.writeFileSync(tempFilePath, fileContent.content);
        } else {
            throw new Error("File content is undefined");
        }
        await shell.openPath(tempFilePath);
        return { success: true };
      }
      await shell.openPath(fileContent.path);
      return { success: true };
    } catch (err) {
      console.error("Error opening Python file:", err);
      return { success: false };
    }
  });

ipcMain.handle('post-file', async (_e, fileName: string, folderPath: string, data: Buffer) => {
    console.log('Posting file:', fileName, folderPath, data);
    const filePath = path.join(folderPath, fileName);
    fs.writeFileSync(filePath, data);
})

ipcMain.handle('delete-file', async (_e, filePath: string)  => {
    console.log('deleting file:', filePath);
    try {
        await fs.promises.unlink(filePath);
        console.log('File deleted successfully:', filePath);
    } catch (error) {
        console.error('Error deleting file:', error);
        throw error; // Re-throw the error to be handled by the renderer process
    }
})