export interface PermissionState {
    filesystemAccess: boolean;
    fullDiskAccess: boolean;
    documentsAccess: boolean;
    downloadsAccess: boolean;
    desktopAccess: boolean;
    rememberChoice: boolean;
    hasBeenPrompted: boolean;
}

export interface PermissionAPI {
    getPermissions: () => Promise<PermissionState>;
    requestPermissions: () => Promise<PermissionState>;
    resetPermissions: () => Promise<PermissionState>;
    showSystemPreferences: () => Promise<void>;
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
    processQuery: (query: string) => Promise<string>;
    reinitialize: () => Promise<MCPReinitializeResult>;
    getStatus: () => Promise<MCPStatus>;
}

declare global {
    interface Window {
        permissionApi: PermissionAPI;
        mcpApi: MCPAPI;
    }
}
