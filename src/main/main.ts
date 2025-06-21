import { app, BrowserWindow, ipcMain, shell, ipcRenderer } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { config } from 'dotenv';
import { postFile, connectNewCloudAccount, getConnectedCloudAccounts, readDirectory, loadStoredAccounts, clearStore, getFile, deleteFile, removeCloudAccount, cancelCloudAuthentication } from './cloud/cloudManager';
import { openExternalUrl, openFileLocal, postFileLocal, getFileLocal, deleteFileLocal } from './local/localFileSystem';
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
import { createFsServer } from './MCP/globalFsMcpServer';
import { v4 as uuidv4 } from 'uuid';

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
        return Promise.all(items.map(async item => ({
            id: uuidv4(), // Generate unique UUID for each item
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
    return await deleteFileLocal(filePath);
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

// async function invokeRendererFunction(name: string, ...args: any[]) {
//   const win = BrowserWindow.getAllWindows()[0];
//   if (win) {
//     win.webContents.send('invoke-renderer-function', { name, args });
//   } else {
//     console.error('No renderer window available');
//   }
// }

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