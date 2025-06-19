
import { PermissionManager } from '../permissions/permissionManager';
import { FileSystemItem, FileContent} from '../../types/fileSystem';
import * as path from 'path'
import * as fs from 'fs'
import * as mime from 'mime-types';
import { app, BrowserWindow, ipcMain, shell, ipcRenderer } from 'electron'


export const readDirectoryLocal = async (dirPath: string): Promise<FileSystemItem[]> => {
    const permissionManager = PermissionManager.getInstance();

    // Check if we have permission for this path
    if (!permissionManager.hasPermissionForPath(dirPath)) {
        const permissions = permissionManager.getPermissions();
        if (permissions.rememberChoice && !permissions.filesystemAccess) {
            throw new Error(`Access denied to ${dirPath}. Please grant permissions in app settings.`);
        }
        
        throw new Error(`Access denied to ${dirPath}. Insufficient permissions.`);
    }

    try {
        const items = await fs.promises.readdir(dirPath, { withFileTypes: true })
        return Promise.all(items.map(async item => ({
            id: item.name, // Using name as a simple ID, could be improved with a unique identifier
            name: item.name,
            isDirectory: item.isDirectory(),
            path: path.join(dirPath, item.name),
            size: (await fs.promises.stat(path.join(dirPath, item.name))).size,
            modifiedTime: (await fs.promises.stat(path.join(dirPath, item.name))).mtimeMs
        })));
    } catch (error: any) {
        // Handle permission errors specifically
        if (error.code === 'EPERM' || error.code === 'EACCES') {
            const permissionManager = PermissionManager.getInstance();
            throw new Error(`Permission denied accessing ${dirPath}.`);
        }
        throw error;
    }
};

export const getFileLocal = async (filePath: string) => {
    console.log('Reading file:', filePath);

    const permissionManager = PermissionManager.getInstance();
    
    // Check if we have permission for this path
    if (!permissionManager.hasPermissionForPath(filePath)) {
        throw new Error(`Access denied to ${filePath}. Insufficient permissions.`);
    }

    // check if the file or directory exists
    try {
        await fs.promises.access(filePath, fs.constants.R_OK);
    } catch (error: any) {
        if (error.code === 'EPERM' || error.code === 'EACCES') {
            throw new Error(`Permission denied accessing ${filePath}. `);
        }
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
};

// Handle opening external URLs
export const openExternalUrl = async (url: string) => {
    try {
        await shell.openExternal(url);
        return { success: true };
    } catch (error: any) {
        console.error('Failed to open external URL:', error);
        return { success: false, error: error };
    }
};

export const openFileLocal = async (fileContent: FileContent) => {
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
  };

export const postFileLocal = async (fileName: string, folderPath: string, data: Buffer) => {
    console.log('Posting file:', fileName, folderPath, data);
    const filePath = path.join(folderPath, fileName);
    
    const permissionManager = PermissionManager.getInstance();
    
    // Check if we have permission for this path
    if (!permissionManager.hasPermissionForPath(folderPath)) {
        throw new Error(`Access denied to ${folderPath}. Insufficient permissions.`);
    }

    try {
        fs.writeFileSync(filePath, data);
        console.log('File posted successfully:', filePath);
    } catch (error: any) {
        if (error.code === 'EPERM' || error.code === 'EACCES') {
            throw new Error(`Permission denied writing to ${filePath}.`);
        }
        console.error('Error posting file:', error);
        throw error; 
    }
};

export const deleteFileLocal = async (filePath: string) => {
    console.log('deleting file:', filePath);
    
    const permissionManager = PermissionManager.getInstance();
    
    // Check if we have permission for this path
    if (!permissionManager.hasPermissionForPath(filePath)) {
        throw new Error(`Access denied to ${filePath}. Insufficient permissions.`);
    }

    try {
        await fs.promises.unlink(filePath);
        console.log('File deleted successfully:', filePath);
    } catch (error: any) {
        if (error.code === 'EPERM' || error.code === 'EACCES') {
            throw new Error(`Permission denied deleting ${filePath}.`);
        }
        console.error('Error deleting file:', error);
        throw error; 
    }
};