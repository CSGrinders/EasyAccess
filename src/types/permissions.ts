export interface PermissionState {
    filesystemAccess: boolean;
    documentsAccess: boolean;
    downloadsAccess: boolean;
    desktopAccess: boolean;
    rememberChoice: boolean;
}

export interface PermissionAPI {
    getPermissions: () => Promise<PermissionState>;
    requestPermissions: () => Promise<PermissionState>;
    resetPermissions: () => Promise<PermissionState>;
}

export interface MCPReinitializeResult {
    success: boolean;
    error?: string;
}

export interface MCPStatus {
    isEnabled: boolean;
    allowedDirectories: string[];
    isInitialized: boolean;
}

export interface MCPAPI {
    mcpRenderer: any;
    processQuery: (query: string) => Promise<string>;
    reinitialize: () => Promise<MCPReinitializeResult>;
    getStatus: () => Promise<MCPStatus>;
    onReloadAgentMessage: (callback: (event: Electron.IpcRendererEvent, ...args: any[]) => void) => void;
    removeReloadAgentMessageListener: () => void;
}

declare global {
    interface Window {
        permissionApi: PermissionAPI;
        mcpApi: MCPAPI;
    }
}
