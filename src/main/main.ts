import { app, BrowserWindow, ipcMain, shell, ipcRenderer, dialog } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import Store from 'electron-store';
import { config } from 'dotenv';
import { connectNewCloudAccount, getConnectedCloudAccounts, readDirectory, loadStoredAccounts, clearStore, getFile, deleteFile, removeCloudAccount, cancelCloudAuthentication, calculateFolderSize, createDirectory, getDirectoryTree, readFile, getItemInfo } from './cloud/cloudManager';
import { openExternalUrl, openFileLocal, postFileLocal, getFileLocal, deleteItemLocal, createDirectoryLocal, readDirectoryLocal, searchFilesLocal, readFileLocal, calculateDirectorySize } from './local/localFileSystem';
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
import { DashboardState } from '@Types/canvas';
import http from 'http';
import { transferManager } from './transfer/transferManager';
import {progressCallbackData} from '../types/transfer';


export const AppConfig = {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_PUBLIC_KEY: process.env.GOOGLE_PUBLIC_KEY,
    DROPBOX_KEY: process.env.DROPBOX_KEY,
    MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
    NODE_ENV: process.env.NODE_ENV || 'development',
    AGENT_AUTH_REDIRECT_URL: process.env.AGENT_AUTH_REDIRECT_URL,
    AGENT_AUTH_PORT: process.env.AGENT_AUTH_PORT || 8080 // Default port for agent auth
}

const store = new Store();

// let mcpClient: MCPClient | null = null;
let mcpClient: MCPClient | null = null;
let mainWindow: BrowserWindow | null = null;

ipcMain.handle('start-auth-server', async () => {
    const code = await startAuthServer();
    return code;
});

export const focusMainWindow = () => {
    if (mainWindow) {
        mainWindow.show();       
        mainWindow.focus();       
        mainWindow.setAlwaysOnTop(true); 
        mainWindow.setAlwaysOnTop(false);
    } else {
        console.error("Main window is not available to focus.");
    }
};

const startAuthServer = (): Promise<string> => {
    return new Promise(async (resolve, reject) => {
        const server = http.createServer((req, res) => {
            if (req.url?.startsWith('/supabase/auth/callback')) {
                console.log("Auth callback received:", req.url);
                res.writeHead(200, { 'Content-Type': 'text/html' });
                // Respond with a simple HTML page that will extract the tokens
                // Redirect page to EasyAccess website? Currently, set to github.com
                res.end(`
                <html>
                    <body>
                    <script>
                        const params = new URLSearchParams(window.location.hash.slice(1));
                        const accessToken = params.get('access_token');
                        const refreshToken = params.get('refresh_token');

                        // Send to Electron (via postMessage or redirection)
                        fetch('http://127.0.0.1:8080/token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ accessToken, refreshToken })
                        }).then(() => {
                            window.location.replace("https://github.com/");
                        });
                    </script>
                    </body>
                </html>
                `);
            } else if (req.url === '/token' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', () => {
                    const data = JSON.parse(body);
                    const { accessToken, refreshToken } = data;

                    mainWindow?.webContents.send('agent-auth-token', { accessToken, refreshToken });

                    // focus main window
                    focusMainWindow();

                    res.writeHead(200);
                    res.end();
                    server.close();
                    resolve(accessToken || '');
                });
            } else {
                res.writeHead(404);
                res.end('Not Found');
            }
        });

        // redirect URI for OAuth2...
        server.listen(8080, () => {
            console.log("Auth server listening on port 8080");
        });

        // Handle server errors
        server.on('error', (error: any) => {
            console.error("Auth server error:", error);
        });

        // Add timeout to prevent hanging
        setTimeout(() => {
            server.close();
            reject(new Error('Authentication timeout - no response received'));
        }, 300000); // 5 minute timeout
    });
}



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

const saveCurrentLayout = async () => {
    /*
    Save the current layout of the main window to a file.
    current scale
    current view position
    storage boxes that are open
    Each Storagebox:
    - cloud type
    - account id
    - current path
    - box position in canvas
    - box size
    */
    return new Promise<void>((resolve, reject) => {
        // Set up one-time listener for the response
        const layoutResponseHandler = (event: Electron.IpcMainEvent, state: DashboardState) => {
            ipcMain.removeListener('save-current-state', layoutResponseHandler);
            try {
                console.log('Saving current layout:', state.scale, state.pan, state.boxes);
                store.set('savedAppState', state);
                resolve();
            } catch (error) {
                reject(error);
            }
        };

        // Register the one-time listener
        ipcMain.once('save-current-state', layoutResponseHandler);

        // Request layout from renderer
        mainWindow?.webContents.send('request-current-state');

        // Add timeout to prevent hanging
        setTimeout(() => {
            ipcMain.removeListener('save-current-state', layoutResponseHandler);
            reject(new Error('Timeout waiting for layout save response'));
        }, 5000);
    });
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

    if (AppConfig.NODE_ENV === 'development') {
        console.log("Development mode - loading from localhost");
        win.loadURL('http://localhost:3000').then(r => console.log("loaded"));
    } else {
        console.log("Production mode - loading from index.html");
        win.loadFile(path.join(__dirname, '../index.html')).then(r => console.log("loaded"));
    }

    win.on('close', function (e) {
        e.preventDefault(); // Prevent default close behavior
        dialog.showMessageBox(win, {
            type: 'question',
            buttons: ['Yes', 'No'],
            title: 'Confirm',
            message: 'Are you sure you want to quit?',
            checkboxLabel: 'Save current layout before closing?',
            checkboxChecked: true
        }).then(async (result) => {
            if (result.response === 0) { // Yes
                try {
                    if (result.checkboxChecked) {
                        console.log("Saving current layout before closing...");
                        await saveCurrentLayout();
                        console.log("Layout saved successfully");
                    } else {
                        console.log("Skipping layout save");
                        console.log("Remove the savedAppState from store");
                        store.delete('savedAppState'); // Remove saved state if not saving
                    }
                    win.destroy(); // Close the window
                } catch (error) {
                    console.error("Error saving layout:", error);
                }
            }
        });
    });

    win.once('ready-to-show', () => {
        console.log('Window is ready to show');
        // Load saved layout if available
        const savedState = store.get('savedAppState') as DashboardState | undefined;
        if (savedState) {
            console.log(savedState.scale, savedState.pan, savedState.boxes);
        }
        win.webContents.send('load-saved-state', savedState);
        win.show()
        win.webContents.openDevTools({ mode: 'right' })
    })

    // Add IPC handler for MCP queries
    ipcMain.handle('mcp-process-query', async (_e, query: string, access_token: string) => {
        if (!mcpClient) {
            throw new Error('MCP client not initialized - insufficient permissions');
        }
        console.log("Processing MCP query:", query);
        return await mcpClient.processQuery(query, access_token);
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
const activeDownloads = new Map<string, AbortController>()





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
ipcMain.handle('cloud-get-item-info', async (_e, cloudType: CloudType, accountId: string, itemPath: string) => {
    return getItemInfo(cloudType, accountId, itemPath);
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

// Handle opening external URLs
ipcMain.handle('open-external-url', async (event, url) => {
    return await openExternalUrl(url);
});

ipcMain.handle('open-file', async (event, fileContent: FileContent) => {
    return await openFileLocal(fileContent);
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

export async function triggerSendTextDelta(delta: string) {
    return await invokeRendererFunction('sendTextDeltaMessage', delta);
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

export async function triggerRequestClarification(question: string) {
    return await invokeRendererFunction('requestClarification', question);
}

// tempPostFile: (parentPath: string, cloudType?: CloudType, accountId?: string) => Promise<void>;
export async function triggerPostFileOnRenderer(parentPath: string, cloudType?: CloudType, accountId?: string, fileName?: string) {
    return await invokeRendererFunction('postFileOnRenderer', parentPath, cloudType, accountId, fileName);
}

export async function triggerChangeDirectoryOnAccountWindow(dir: string, cloudType?: CloudType, accountId?: string | undefined) {
    return await invokeRendererFunction('changeDirectoryOnAccountWindow', dir, cloudType, accountId);
}

export async function triggerAgentWorkStop(reason: string) {
    return await invokeRendererFunction('agentWorkStop', reason);
}

// prevent hang on the renderer
export async function triggerGracefulClose() {
    return await invokeRendererFunction('gracefulClose');
}

export async function triggerToolResultMessage(toolName: string, toolArgs: any, resultContent: any, isError: boolean) {
    // implement rendering the tool result in readable format
    console.log("Triggering tool result message:", toolName, toolArgs, resultContent, isError);
    if (isError) {
        return await invokeRendererFunction('toolResultMessage', "Something went wrong while processing the request...");
    }
    let message: string;

    if (toolArgs.provider && toolArgs.provider !== "local" && toolArgs.accountId) {
        message = `<tool_header><provider>${toolArgs.provider}</provider>\t<accountId>${toolArgs.accountId}</accountId></tool_header>`;
    } else {
        message = `<tool_header>Local file system</tool_header>`;
    }
    switch (toolName) {
        case "read_file":
            message += `\nRead a file at "${toolArgs.path}".`;
            break;

        case "read_multiple_files":
            message += `\nRead files: ${
                Array.isArray(toolArgs.paths) ? toolArgs.paths.join(", ") : ""
            }.`;
            break;

        case "write_file":
            message += `\nWrote content to "${toolArgs.path}".`;
            break;

        case "create_directory":
            message += `\nCreated a directory at "${toolArgs.path}".`;
            break;

        case "list_directory":
            message += `\nContents under "${toolArgs.path}":\n${resultContent.map((item: any) => item.text).join("\n")}.`;
            break;

        case "directory_tree":
            message += `\nDirectory tree for "${toolArgs.path}":\n${resultContent.map((item: any) => item.text).join("\n")}.`;
            break;

        case "move_file":
            message += `\nStarted moving a file from "${toolArgs.source}" to "${toolArgs.destination}".`;
            break;

        case "search_files":
            message += `\nSearch "${toolArgs.path}" for "${toolArgs.patterns}":\n${resultContent.map((item: any) => item.text).join("\n")}`;
            break;

        case "get_file_info":
            message += `Get file info for "${toolArgs.path}".\nDetails:\n${resultContent.map((item: any) => item.text).join("\n")}`;
            break;

        case "get_folder_info":
            message += `Get folder info for "${toolArgs.path}".\nDetails:\n${resultContent.map((item: any) => item.text).join("\n")}`;
            break;

        case "list_allowed_directories":
            message += `${resultContent.map((item: any) => item.text).join("\n")}`;
            break;

        case "list_connected_cloud_accounts":
            message = `Connected cloud accounts for "${toolArgs.provider}":\n${resultContent.map((item: any) => item.text).join("\n")}`;
            break;

        case "get_information_from_user":
            message = `${toolArgs.question}\n • ${resultContent.map((item: any) => item.text).join("\n")}`;
            break;

        default:
            message += `Attempted to handle an unknown tool: "${toolName}".`;
            break;
    }

    await invokeRendererFunction('toolResultMessage', message);

    if (toolArgs.provider && toolArgs.provider !== "local" && toolArgs.accountId) {
        // display corresponding storage box in the canvas
        console.log(`Displaying storage box for provider: ${toolArgs.provider}, accountId: ${toolArgs.accountId}`);
        // You can implement logic to open or focus the corresponding storage box in the canvas here
        // For example, you might send a message to the renderer to open or focus the box
        await invokeRendererFunction('openStorageBox', 
            toolArgs.provider,
            toolArgs.accountId,
            toolArgs.path || "/"
        );
    } else if (toolArgs.path) {
        // If it's a local file system operation, open the local storage box
        console.log(`Displaying local storage box for path: ${toolArgs.path}`);
        await invokeRendererFunction('openStorageBox', 'local', null, toolArgs.path);
    }
}

// Handler for creating new directories in local file system
ipcMain.handle('create-directory', async (_e, dirPath: string) => {
    return await createDirectoryLocal(dirPath);
})