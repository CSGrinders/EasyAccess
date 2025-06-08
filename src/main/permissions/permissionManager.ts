import { app, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export interface PermissionState {
    filesystemAccess: boolean;
    documentsAccess: boolean;
    downloadsAccess: boolean;
    desktopAccess: boolean;
    rememberChoice: boolean;
    hasBeenPrompted: boolean;
}

export class PermissionManager {
    private static instance: PermissionManager;
    private permissionsPath: string;
    private permissions: PermissionState;
    private onPermissionsChangedCallback?: () => void;

    private constructor() {
        this.permissionsPath = path.join(app.getPath('userData'), 'permissions.json');
        this.permissions = this.loadPermissions();
    }

    public static getInstance(): PermissionManager {
        if (!PermissionManager.instance) {
            PermissionManager.instance = new PermissionManager();
        }
        return PermissionManager.instance;
    }

    private loadPermissions(): PermissionState {
        try {
            if (fs.existsSync(this.permissionsPath)) {
                const data = fs.readFileSync(this.permissionsPath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Error loading permissions:', error);
        }

        // Defualt permissions, we will store this in local storage
        return {
            filesystemAccess: false,
            documentsAccess: false,
            downloadsAccess: false,
            desktopAccess: false,
            rememberChoice: false,
            hasBeenPrompted: false
        };
    }

    private savePermissions(): void {
        try {
            fs.writeFileSync(this.permissionsPath, JSON.stringify(this.permissions, null, 2));
            // Notify that permissions have changed
            this.notifyPermissionsChanged();
        } catch (error) {
            console.error('Error saving permissions:', error);
        }
    }

    public setOnPermissionsChangedCallback(callback: () => void): void {
        this.onPermissionsChangedCallback = callback;
    }

    private notifyPermissionsChanged(): void {
        if (this.onPermissionsChangedCallback) {
            this.onPermissionsChangedCallback();
        }
    }

    public async checkAndRequestPermissions(): Promise<PermissionState> {
        // If user has already made a choice and wants it remembered, we will return saved state
        if (this.permissions.hasBeenPrompted && this.permissions.rememberChoice) {
            return this.permissions;
        }

        if (this.permissions.hasBeenPrompted && !this.permissions.rememberChoice) {
            this.resetPermissions()
        }
        
        if (!this.permissions.hasBeenPrompted) {
            const result = await this.showPermissionDialog();
            
            this.permissions = {
                ...result,
                hasBeenPrompted: true
            };
            
            this.savePermissions();
        } 
        return this.permissions;
    }


    private async showPermissionDialog(): Promise<Omit<PermissionState, 'hasBeenPrompted'>> {
        const result = await dialog.showMessageBox({
            type: 'info',
            title: 'File System Permissions Required',
            message: 'EasyAccess needs permissions to access your files',
            detail: `This application requires access to your file system to:

• Read and browse directories (Documents, Downloads, Desktop)
• Open and preview files
• Upload files to cloud storage
• Perform file operations (copy, move, delete)
• MCP integration for file management


Would you like to grant these permissions?`,
            buttons: ['Grant Permissions', 'Deny', 'Grant with Limited Access'],
            defaultId: 0,
            cancelId: 1,
            checkboxLabel: 'Remember my choice and don\'t ask again',
            checkboxChecked: false
        });

        const rememberChoice = result.checkboxChecked;
        
        switch (result.response) {
            case 0: // Grant Permissions
                return {
                    filesystemAccess: true,
                    documentsAccess: true,
                    downloadsAccess: true,
                    desktopAccess: true,
                    rememberChoice
                };
            case 1: // Deny
                return {
                    filesystemAccess: false,
                    documentsAccess: false,
                    downloadsAccess: false,
                    desktopAccess: false,
                    rememberChoice
                };
            case 2: // Limited Access
                return await this.showLimitedAcessPrompt();
            default:
                return {
                    filesystemAccess: false,
                    documentsAccess: false,
                    downloadsAccess: false,
                    desktopAccess: false,
                    rememberChoice: false
                };
        }
    }


    private async showLimitedAcessPrompt(): Promise<Omit<PermissionState, 'hasBeenPrompted' | 'fullDiskAccess'>> {
        // First, ask if they want to configure individual permissions
        const initialResult = await dialog.showMessageBox({
            type: 'info',
            title: 'Configure File System Permissions',
            message: 'Choose your permission preferences',
            detail: `EasyAccess can work with different levels of file system access. You can either:

• Grant all permissions for full functionality
• Deny all permissions (limited functionality)
• Configure individual folder access permissions

What would you like to do?`,
            buttons: ['Grant All Permissions', 'Deny All', 'Configure Individual Permissions'],
            defaultId: 0,
            cancelId: 1,
            checkboxLabel: 'Remember my choice and don\'t ask again',
            checkboxChecked: false
        });

        const rememberChoice = initialResult.checkboxChecked;

        switch (initialResult.response) {
            case 0: // Grant All Permissions
                return {
                    filesystemAccess: true,
                    documentsAccess: true,
                    downloadsAccess: true,
                    desktopAccess: true,
                    rememberChoice
                };
            case 1: // Deny All
                return {
                    filesystemAccess: false,
                    documentsAccess: false,
                    downloadsAccess: false,
                    desktopAccess: false,
                    rememberChoice
                };
            case 2: // Configure Individual Permissions
                return await this.showIndividualPermissionDialogs(rememberChoice);
            default:
                return {
                    filesystemAccess: false,
                    documentsAccess: false,
                    downloadsAccess: false,
                    desktopAccess: false,
                    rememberChoice: false
                };
        }
    }

    private async showIndividualPermissionDialogs(rememberChoice: boolean): Promise<Omit<PermissionState, 'hasBeenPrompted' | 'fullDiskAccess'>> {
        const permissions = {
            filesystemAccess: false,
            documentsAccess: false,
            downloadsAccess: false,
            desktopAccess: false,
            rememberChoice
        };

        // Ask for basic filesystem access first
        const filesystemResult = await dialog.showMessageBox({
            type: 'question',
            title: 'Basic File System Access',
            message: 'Allow basic file system access?',
            detail: 'This enables EasyAccess to read and browse files outside of protected directories. Required for core functionality.',
            buttons: ['Allow', 'Deny'],
            defaultId: 0,
            cancelId: 1
        });

        permissions.filesystemAccess = filesystemResult.response === 0;

        // Only ask for specific folder permissions if basic filesystem access is granted
        if (permissions.filesystemAccess) {
            // Ask for Documents access
            const documentsResult = await dialog.showMessageBox({
                type: 'question',
                title: 'Documents Folder Access',
                message: 'Allow access to Documents folder?',
                detail: 'This enables EasyAccess to read, browse, and manage files in your Documents folder.',
                buttons: ['Allow', 'Deny'],
                defaultId: 0,
                cancelId: 1
            });

            permissions.documentsAccess = documentsResult.response === 0;

            // Ask for Downloads access
            const downloadsResult = await dialog.showMessageBox({
                type: 'question',
                title: 'Downloads Folder Access',
                message: 'Allow access to Downloads folder?',
                detail: 'This enables EasyAccess to read, browse, and manage files in your Downloads folder.',
                buttons: ['Allow', 'Deny'],
                defaultId: 0,
                cancelId: 1
            });

            permissions.downloadsAccess = downloadsResult.response === 0;

            // Ask for Desktop access
            const desktopResult = await dialog.showMessageBox({
                type: 'question',
                title: 'Desktop Folder Access',
                message: 'Allow access to Desktop folder?',
                detail: 'This enables EasyAccess to read, browse, and manage files on your Desktop.',
                buttons: ['Allow', 'Deny'],
                defaultId: 0,
                cancelId: 1
            });

            permissions.desktopAccess = desktopResult.response === 0;
        }

        return permissions;
    }

    // Check if the user has permission for a specific file path
    public hasPermissionForPath(filePath: string): boolean {
        const userHome = app.getPath('home');
        const desktopPath = path.join(userHome, 'Desktop');
        const documentsPath = path.join(userHome, 'Documents');
        const downloadsPath = path.join(userHome, 'Downloads');

        // Check general filesystem access
        if (!this.permissions.filesystemAccess) {
            return false;
        }

        // Check specific folder permissions
        if (filePath.startsWith(desktopPath) && !this.permissions.desktopAccess) {
            return false;
        }
        
        if (filePath.startsWith(documentsPath) && !this.permissions.documentsAccess) {
            return false;
        }
        
        if (filePath.startsWith(downloadsPath) && !this.permissions.downloadsAccess) {
            return false;
        }

        return true;
    }

    //Allowed directories for MCP integration
    public getMCPAllowedDirectories(): string[] {
        const allowedDirs: string[] = [];
        
        if (this.permissions.filesystemAccess) {
            allowedDirs.push('~/');
        }

        if (this.permissions.documentsAccess) {
            allowedDirs.push('~/Documents');
        }
        
        if (this.permissions.downloadsAccess) {
            allowedDirs.push('~/Downloads');
        }
        
        if (this.permissions.desktopAccess) {
            allowedDirs.push('~/Desktop');
        }
        
        return allowedDirs;
    }

    public isMCPEnabled(): boolean {
        return this.permissions.filesystemAccess;
    }

    public getPermissions(): PermissionState {
        return { ...this.permissions };
    }

    public async resetPermissions(): Promise<void> {
        this.permissions = {
            filesystemAccess: false,
            documentsAccess: false,
            downloadsAccess: false,
            desktopAccess: false,
            rememberChoice: false,
            hasBeenPrompted: false
        };
        this.savePermissions();
    }
}
