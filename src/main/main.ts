import { app, BrowserWindow, ipcMain, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { config } from 'dotenv';
import { postFile, connectNewCloudAccount, getConnectedCloudAccounts, readDirectory, loadStoredAccounts, clearStore, getFile, deleteFile, removeCloudAccount, cancelCloudAuthentication, calculateFolderSize, createDirectory } from './cloud/cloudManager';

// Load environment variables
// In development, load from project root; in production, load from app Contents directory
const envPath = app.isPackaged 
    ? path.join(path.dirname(app.getPath('exe')), '..', '.env')
    : path.join(__dirname, '../../.env');

console.log('Loading .env from:', envPath);
config({ path: envPath });
import { CloudType } from "@Types/cloudType";
import { FileContent, FileSystemItem } from '@Types/fileSystem';
import * as mime from 'mime-types';
import MCPClient from './MCP/mcpClient';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createFileSystemServer } from './MCP/fileSystemMcpServer';
import { PermissionManager } from './permissions/permissionManager';
import { v4 as uuidv4 } from 'uuid';

let mcpClient: MCPClient | null = null;

const setUpMCP = async () => {
    const mcpClient = new MCPClient();
    const transports = InMemoryTransport.createLinkedPair();
    const fsClientTransport = transports[0];
    const fsServerTransport = transports[1];
    
    // Get permission manager and check current permissions
    const permissionManager = PermissionManager.getInstance();
    
    // Check if MCP should be enabled
    if (!permissionManager.isMCPEnabled()) {
        console.log('MCP Server not initialized - filesystem access not granted');
        return mcpClient;
    }
    
    // Get allowed directories from permission manager
    const allowedDirs = permissionManager.getMCPAllowedDirectories();
    
    if (allowedDirs.length === 0) {
        console.log('MCP Server not initialized - no directories allowed');
        return mcpClient;
    }
    
    try {
        const fsServer = await createFileSystemServer(allowedDirs);
        fsServer.connect(fsServerTransport);
        
        await mcpClient.connectToServer([fsClientTransport]);
        console.log('MCP Server initialized with access to:', allowedDirs);
    } catch (error) {
        console.error('Error initializing MCP Server:', error);
    }
    
    return mcpClient;
};

const createWindow = async () => {
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

    // Initialize permission manager and check permissions
    const permissionManager = PermissionManager.getInstance();
    
    // Set up MCP reinitialization when permissions change
    permissionManager.setOnPermissionsChangedCallback(async () => {
        console.log('Permissions changed, reinitializing MCP...');
        if (mcpClient) {
            await mcpClient.cleanup();
        }
        mcpClient = await setUpMCP();
    });
    
    await permissionManager.checkAndRequestPermissions();

    mcpClient = await setUpMCP();

    // load auth tokens from local storage
    loadStoredAccounts(); 

    if (process.env.NODE_ENV === 'development') {
        win.loadURL('http://localhost:3000').then(r => console.log("loaded"));
    } else {
        win.loadFile(path.join(__dirname, '../index.html')).then(r => console.log("loaded"));
    }
    
    win.once('ready-to-show', () => {
        win.show()
        win.webContents.openDevTools({ mode: 'right' })
    })

    // Add IPC handler for MCP queries
    ipcMain.handle('mcp-process-query', async (_e, query: string) => {
        try {
            if (!mcpClient) {
                throw new Error('MCP client not initialized - insufficient permissions');
            }
            console.log("Processing MCP query:", query);
            return await mcpClient.processQuery(query);
        } catch (error) {
            console.error("Error in MCP query:", error);
            throw error;
        }
    });
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
ipcMain.handle('cloud-post-file', async (_e, cloudType: CloudType, accountId: string, fileName: string, folderPath: string, data: Buffer | any) => {
    // Ensure data is a Buffer (handle IPC serialization issues)
    const bufferData = Buffer.isBuffer(data) ? data : Buffer.from(data.data || data);
    return postFile(cloudType, accountId, fileName, folderPath, bufferData);
});
ipcMain.handle('cloud-delete-file', async (_e, cloudType: CloudType, accountId: string, filePath: string) => {
    return deleteFile(cloudType, accountId, filePath);
});
ipcMain.handle('cloud-calculate-folder-size', async (_e, cloudType: CloudType, accountId: string, folderPath: string) => {
    return calculateFolderSize(cloudType, accountId, folderPath);
});
ipcMain.handle('cloud-create-directory', async (_e, cloudType: CloudType, accountId: string, dirPath: string) => {
    return createDirectory(cloudType, accountId, dirPath);
});
ipcMain.handle('remove-cloud-account', async (_e, cloudType: CloudType, accountId: string) => {
    return removeCloudAccount(cloudType, accountId);
});
ipcMain.handle('cancel-cloud-authentication', async (_e, cloudType: CloudType) => {
    return cancelCloudAuthentication(cloudType);
});

ipcMain.handle('delete-accounts', async (_e) => {
    return await clearStore();
});

// Permission management handlers
ipcMain.handle('get-permissions', async (_e) => {
    const permissionManager = PermissionManager.getInstance();
    return permissionManager.getPermissions();
});

ipcMain.handle('request-permissions', async (_e) => {
    const permissionManager = PermissionManager.getInstance();
    return await permissionManager.checkAndRequestPermissions();
});

ipcMain.handle('reset-permissions', async (_e) => {
    const permissionManager = PermissionManager.getInstance();
    await permissionManager.resetPermissions();
    
    // Reinitialize MCP with new permissions
    if (mcpClient) {
        await mcpClient.cleanup();
    }
    mcpClient = await setUpMCP();
    
    return permissionManager.getPermissions();
});

// Add IPC handler to reinitialize MCP when permissions change
ipcMain.handle('reinitialize-mcp', async (_e) => {
    try {
        if (mcpClient) {
            await mcpClient.cleanup();
        }
        mcpClient = await setUpMCP();
        return { success: true };
    } catch (error) {
        console.error("Error reinitializing MCP:", error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});

// Add IPC handler to get MCP status
ipcMain.handle('get-mcp-status', async (_e) => {
    const permissionManager = PermissionManager.getInstance();
    return {
        isEnabled: permissionManager.isMCPEnabled(),
        allowedDirectories: permissionManager.getMCPAllowedDirectories(),
        isInitialized: mcpClient !== null
    };
});


/**
 * Recursively calculates the total size of a directory.
 * This version calculates size based on blocks allocated on disk.
 */
async function calculateDirectorySize(
    dirPath: string, 
    processedInodes: Set<string> = new Set(),
    depth: number = 0
): Promise<number> {

    // Prevent infinite recursion 
    if (depth > 100) {
        console.warn(`Max recursion depth reached at ${dirPath}`);
        return 0;
    }

    let stats;
    try {
        // Use lstat to get file info without following symlinks.
        stats = await fs.promises.lstat(dirPath);
    } catch (error: any) {
        if (error.code !== 'ENOENT' && error.code !== 'EPERM' && error.code !== 'EACCES') {
            console.warn(`Cannot lstat ${dirPath}: ${error.code}`);
        }
        return 0;
    }

    //  if we've seen this inode, don't count it again.
    const inodeKey = `${stats.dev}-${stats.ino}`;
    if (processedInodes.has(inodeKey)) {
        return 0;
    }
    processedInodes.add(inodeKey);

    // If it's a directory, sum the sizes of its children recursively.
    // If it's a file, return its allocated size on disk.
    if (stats.isDirectory()) {
        let totalSize = 0;
        try {
            const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
            
            // Use Promise.all for concurrent recursion.
            const childSizes = await Promise.all(items.map(item => {
                const itemPath = path.join(dirPath, item.name);
                return calculateDirectorySize(itemPath, processedInodes, depth + 1);
            }));

            totalSize = childSizes.reduce((sum, size) => sum + size, 0);

        } catch (error: any) {
            if (error.code !== 'EPERM' && error.code !== 'EACCES') {
                console.warn(`Cannot read directory ${dirPath}: ${error.code}`);
            }
        }
        return totalSize;
    }

    // For files and symlinks, return their allocated size.
    return (stats.blocks || 0) * 512;
}

ipcMain.handle('read-directory', async (_e, dirPath: string) => {
    const permissionManager = PermissionManager.getInstance();
    
    // Check if we fhave permission for this path
    if (!permissionManager.hasPermissionForPath(dirPath)) {
        const permissions = permissionManager.getPermissions();
        if (permissions.rememberChoice && !permissions.filesystemAccess) {
            throw new Error(`Access denied to ${dirPath}. Please grant permissions in app settings.`);
        }
        
        throw new Error(`Access denied to ${dirPath}. Insufficient permissions.`);
    }

    try {
        const items = await fs.promises.readdir(dirPath, { withFileTypes: true })
        return Promise.all(items.map(async item => {
            const itemPath = path.join(dirPath, item.name);
            const stats = await fs.promises.stat(itemPath);
            
            // For files, use actual size. For directories, use 0 initially (will be calculated on demand)
            const size = item.isDirectory() ? 0 : stats.size;
            
            return {
                id: uuidv4(), // Generate unique UUID for each item
                name: item.name,
                isDirectory: item.isDirectory(),
                path: itemPath,
                size: size,
                modifiedTime: stats.mtimeMs
            };
        }));
    } catch (error: any) {
        // Handle permission errors specifically
        if (error.code === 'EPERM' || error.code === 'EACCES') {
            const permissionManager = PermissionManager.getInstance();
            throw new Error(`Permission denied accessing ${dirPath}.`);
        }
        throw error;
    }
})

// Handler for calculating folder size on demand
ipcMain.handle('calculate-folder-size', async (_e, dirPath: string) => {
    const permissionManager = PermissionManager.getInstance();
    
    // Check if we have permission for this path
    if (!permissionManager.hasPermissionForPath(dirPath)) {
        throw new Error(`Access denied to ${dirPath}. Insufficient permissions.`);
    }

    try {
        return await calculateDirectorySize(dirPath);
    } catch (error: any) {
        console.error('Error calculating folder size:', error);
        throw error;
    }
})

ipcMain.handle('get-file', async (_e, filePath: string) => {
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
        try {
            const archiver = require('archiver');
            const tempFilePath = path.join(app.getPath('temp'), `${path.basename(filePath)}.zip`);
            
            await new Promise<void>((resolve, reject) => {
                const output = fs.createWriteStream(tempFilePath);
                const archive = archiver('zip', { 
                    zlib: { level: 9 },
                    statConcurrency: 1 
                });
            
                output.on('close', () => resolve());
                output.on('error', (err) => reject(err));
                archive.on('error', (err: any) => reject(err));
                archive.on('warning', (err: any) => {
                    if (err.code === 'ENOENT') {
                        console.warn('Archive warning:', err);
                    } else {
                        reject(err);
                    }
                });
            
                archive.pipe(output);
                archive.directory(filePath, false);
                archive.finalize();
            });
            
            data = await fs.promises.readFile(tempFilePath);
            filePath = tempFilePath; // Update filePath to the zip file path
        } catch (error) {
            console.error('Error creating zip archive:', error);
            throw new Error(`Failed to create archive: ${error}`);
        }
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

ipcMain.handle('post-file', async (_e, fileName: string, folderPath: string, data: Buffer | any) => {
    console.log('Posting file:', fileName, folderPath, data);
    
    // Ensure data is a Buffer (handle IPC serialization issues)
    const bufferData = Buffer.isBuffer(data) ? data : Buffer.from(data.data || data);
    
    const filePath = path.join(folderPath, fileName);
    
    const permissionManager = PermissionManager.getInstance();
    
    // Check if we have permission for this path
    if (!permissionManager.hasPermissionForPath(folderPath)) {
        throw new Error(`Access denied to ${folderPath}. Insufficient permissions.`);
    }

    try {
        fs.writeFileSync(filePath, bufferData);
        console.log('File posted successfully:', filePath);
    } catch (error: any) {
        if (error.code === 'EPERM' || error.code === 'EACCES') {
            throw new Error(`Permission denied writing to ${filePath}.`);
        }
        console.error('Error posting file:', error);
        throw error; 
    }
})

ipcMain.handle('delete-file', async (_e, filePath: string)  => {
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
})

// Handler for creating new directories in local file system
ipcMain.handle('create-directory', async (_e, dirPath: string) => {
    console.log('Creating directory:', dirPath);
    
    const permissionManager = PermissionManager.getInstance();
    const parentDir = path.dirname(dirPath);
    
    // Check if we have permission for the parent directory
    if (!permissionManager.hasPermissionForPath(parentDir)) {
        throw new Error(`Access denied to ${parentDir}. Insufficient permissions.`);
    }

    try {
        await fs.promises.mkdir(dirPath, { recursive: true });
        console.log('Directory created successfully:', dirPath);
        return { success: true, path: dirPath };
    } catch (error: any) {
        if (error.code === 'EPERM' || error.code === 'EACCES') {
            throw new Error(`Permission denied creating directory ${dirPath}.`);
        } else if (error.code === 'EEXIST') {
            throw new Error(`Directory already exists: ${dirPath}`);
        }
        console.error('Error creating directory:', error);
        throw error; 
    }
})