import { app, BrowserWindow, ipcMain, shell, ipcRenderer } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { config } from 'dotenv';
import { connectNewCloudAccount, getConnectedCloudAccounts, readDirectory, loadStoredAccounts, clearStore, getFile, deleteFile, removeCloudAccount, cancelCloudAuthentication, calculateFolderSize, createDirectory, getFileInfo, getDirectoryTree, readFile } from './cloud/cloudManager';
import { openExternalUrl, openFileLocal, postFileLocal, getFileLocal, deleteItemLocal, createDirectoryLocal, readDirectoryLocal, searchFilesLocal, readFileLocal } from './local/localFileSystem';
// Load environment variables
// In development, load from project root; in production, load from app Contents directory
const envPath = app.isPackaged 
    ? path.join(path.dirname(app.getPath('exe')), '..', '.env')
    : path.join(__dirname, '../../.env');

console.log('Loading .env from:', envPath);
config({ path: envPath });
import { CloudType } from "../types/cloudType";
import { FileContent, FileSystemItem } from '../types/fileSystem';
import MCPClient from './MCP/mcpClient';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { PermissionManager } from './permissions/permissionManager';
import { createFsServer } from './MCP/globalFsMcpServer';
import { v4 as uuidv4 } from 'uuid';
import { transferManager } from './transfer/transferManager';
import {progressCallbackData} from '../types/transfer';

let mcpClient: MCPClient | null = null;
let mainWindow: BrowserWindow | null = null;

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
        // const fsServer = await createFileSystemServer(allowedDirs); // temporarily disabled due to issues with MCP SDK
        const fsServer = await createFsServer(allowedDirs);
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
    mainWindow = win; // Store reference to main window globally
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

// Map to store active download abort controllers by transfer ID
const activeDownloads = new Map<string, AbortController>();

ipcMain.handle('cloud-get-file', async (event, cloudType: CloudType, accountId: string, filePath: string, transferId?: string) => {
    // Create abort controller for this download if transferId is provided
    let abortController: AbortController | undefined;
    if (transferId) {
        abortController = new AbortController();
        activeDownloads.set(transferId, abortController);
    }
    
    // Create progress callback that sends updates to renderer
    const progressCallback = (downloaded: number, total: number) => {
        const fileName = filePath.split('/').pop() || filePath; 
        console.log('Main process sending download progress:', { fileName, downloaded, total });
        event.sender.send('cloud-download-progress', { fileName, downloaded, total });
    };
    
    try {
        const result = await getFile(cloudType, accountId, filePath, progressCallback, abortController?.signal);
        return result;
    } finally {
        // Clean up abort controller
        if (transferId) {
            activeDownloads.delete(transferId);
        }
    }
});


// ipcMain.handle('cloud-post-file', async (event, cloudType: CloudType, accountId: string, fileName: string, folderPath: string, data: Buffer | any, transferId?: string) => {
//     // Ensure data is a Buffer (handle IPC serialization issues)
//     const bufferData = Buffer.isBuffer(data) ? data : Buffer.from(data.data || data);
    
//     // Create abort controller for this upload if transferId is provided
//     let abortController: AbortController | undefined;
//     if (transferId) {
//         abortController = new AbortController();
//         activeUploads.set(transferId, abortController);
//     }
    
//     // Create progress callback that sends updates to renderer
//     const progressCallback = (uploaded: number, total: number) => {
//         console.log('Main process sending upload progress:', { fileName, uploaded, total });
//         event.sender.send('cloud-upload-progress', { fileName, uploaded, total });
//     };
    
//     try {
//         const result = await postFile(cloudType, accountId, fileName, folderPath, bufferData, progressCallback, abortController?.signal);
//         return result;
//     } finally {
//         // Clean up abort controller
//         if (transferId) {
//             activeUploads.delete(transferId);
//         }
//     }
// });



// Map to store active upload abort controllers by transfer ID
const activeTransfer = new Map<string, AbortController>();

// Transfer Operations 
ipcMain.handle('transfer-manager', async (event, transferInfo: any) => { 
    let abortController: AbortController | undefined;
    if (transferInfo.transferId) {
        abortController = new AbortController();
        activeTransfer.set(transferInfo.transferId, abortController);
    }
    // Create progress callback that sends updates to renderer
    const progressCallback = (data: progressCallbackData) => {
        console.log('Main process sending download progress:', data);
        event.sender.send('transfer-progress', data);
    };
    
    try {
        return transferManager(transferInfo, progressCallback, abortController?.signal);
    } finally {
        // Clean up abort controller
        if (transferInfo.transferId) {
            activeDownloads.delete(transferInfo.transferId);
        }
    }
});

ipcMain.handle('transfer-cancel', async (_e, transferId: string) => {
    const abortController = activeTransfer.get(transferId);
    if (abortController) {
        abortController.abort();
        activeTransfer.delete(transferId);
        return true;
    }
    return false;
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
ipcMain.handle('cloud-get-file-info', async (_e, cloudType: CloudType, accountId: string, filePath: string) => {
    return getFileInfo(cloudType, accountId, filePath);
});
ipcMain.handle('cloud-get-directory-tree', async (_e, cloudType: CloudType, accountId: string, dirPath: string) => {
    return getDirectoryTree(cloudType, accountId, dirPath);
});
ipcMain.handle('cloud-read-file', async (_e, cloudType: CloudType, accountId: string, filePath: string) => {
    return readFile(cloudType, accountId, filePath);
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
    return await readDirectoryLocal(dirPath);
})

ipcMain.handle('read-file', async (_e, filePath: string) => {
    return await readFileLocal(filePath);
})

ipcMain.handle('search-file', async (_e, 
    rootPath: string,
    pattern: string,
    excludePatterns: string[] = []) => {
        // not fully implemented yet
    return await searchFilesLocal(rootPath, pattern, excludePatterns);
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
    return await getFileLocal(filePath);
});

// Handle opening external URLs
ipcMain.handle('open-external-url', async (event, url) => {
    return await openExternalUrl(url);
});

ipcMain.handle('open-file', async (event, fileContent: FileContent) => {
    return await openFileLocal(fileContent);
});

ipcMain.handle('post-file', async (_e, fileName: string, folderPath: string, data: Buffer) => {
    return await postFileLocal(fileName, folderPath, data);
});

ipcMain.handle('delete-file', async (_e, filePath: string)  => {
    return await deleteItemLocal(filePath);
});

ipcMain.handle('mcp-process-query-test', (_e, toolName, toolArgs) => {
    console.log("Processing MCP tool test:", toolName, toolArgs);
    let parsedArgs: { [x: string]: unknown };
  
    if (typeof toolArgs === "string") {
        try {
        parsedArgs = JSON.parse(toolArgs);
        } catch (e) {
        throw new Error("Invalid JSON passed as tool arguments");
        }
    } else {
        parsedArgs = toolArgs;
    }

    console.log("Processing MCP tool test:", toolName, parsedArgs);
    return mcpClient?.callToolTest(toolName, parsedArgs);
});

// Store pending promises
const pendingInvocations = new Map<string, { resolve: (value: any) => void; reject: (error: any) => void }>();

async function invokeRendererFunction(name: string, ...args: any[]): Promise<any> {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    throw new Error('No renderer window available');
  }

  // Generate unique ID for this invocation
  const invocationId = uuidv4(); // or crypto.randomUUID()
  
  // Create promise and store resolvers
  const promise = new Promise((resolve, reject) => {
    pendingInvocations.set(invocationId, { resolve, reject });
    
    // Optional: Add timeout to prevent hanging forever
    setTimeout(() => {
      if (pendingInvocations.has(invocationId)) {
        pendingInvocations.delete(invocationId);
        reject(new Error(`Function "${name}" timed out after 30 seconds`));
      }
    }, 30000); // 30 second timeout
  });

  // Send message with invocation ID
  win.webContents.send('invoke-renderer-function', { 
    invocationId, 
    name, 
    args 
  });

  return promise;
}

// Listen for responses from renderer
ipcMain.on('renderer-function-response', (event, { invocationId, success, result, error }) => {
  const pending = pendingInvocations.get(invocationId);
  if (pending) {
    pendingInvocations.delete(invocationId);
    console.log(`Renderer function response received: ${invocationId}`);
    if (success) {
      pending.resolve(result);
    } else {
      pending.reject(new Error(error));
    }
  }
});

export async function triggerRefreshAgentMessage(text: string) {
    return await invokeRendererFunction('refreshAgentMessage', text);
}

export async function triggerOpenAccountWindow(type: string, title: string, icon?: React.ReactNode, cloudType?: CloudType, accountId?: string) {
    return await invokeRendererFunction('openAccountWindow', type, title, icon, cloudType, accountId);
}

export async function triggerReloadAccountWindow(cloudType: string, accountId: string) {
    return await invokeRendererFunction('reloadAccountWindow', cloudType, accountId);
}

// (filePaths: string[], cloudType?: CloudType, accountId?: string, showProgress?: boolean) => Promise<void>;
export async function triggerGetFileOnRenderer(filePaths: string[], cloudType?: CloudType, accountId?: string, showProgress?: boolean) {
    return await invokeRendererFunction('getFileOnRenderer', filePaths, cloudType, accountId, showProgress);
}

// tempPostFile: (parentPath: string, cloudType?: CloudType, accountId?: string) => Promise<void>;
export async function triggerPostFileOnRenderer(parentPath: string, cloudType?: CloudType, accountId?: string, fileName?: string) {
    return await invokeRendererFunction('postFileOnRenderer', parentPath, cloudType, accountId, fileName);
}

export async function triggerChangeDirectoryOnAccountWindow(dir: string, cloudType?: CloudType, accountId?: string | undefined) {
    return await invokeRendererFunction('changeDirectoryOnAccountWindow', dir, cloudType, accountId);
}

// Handler for creating new directories in local file system
ipcMain.handle('create-directory', async (_e, dirPath: string) => {
    return await createDirectoryLocal(dirPath);
})