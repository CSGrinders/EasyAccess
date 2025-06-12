import React, { useState, useEffect } from 'react';
import { PermissionState, MCPStatus } from '@Types/permissions';
import { Button } from '@Components/ui/button';
import { Card } from '@Components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '../ui/dialog';
import { Shield, CheckCircle, XCircle, Settings, AlertTriangle, Zap, RefreshCw, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PermissionSettingsProps {
    children: React.ReactNode;
}

export const PermissionSettings: React.FC<PermissionSettingsProps> = ({ children }) => {
    const [permissions, setPermissions] = useState<PermissionState | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [mcpStatus, setMcpStatus] = useState<string>('');
    const [mcpInfo, setMcpInfo] = useState<MCPStatus | null>(null);

    const loadPermissions = async () => {
        try {
            const perms = await window.permissionApi.getPermissions();
            setPermissions(perms);
        } catch (error) {
            console.error('Error loading permissions:', error);
        }
    };

    const loadMCPStatus = async () => {
        try {
            const status = await window.mcpApi.getStatus();
            setMcpInfo(status);
        } catch (error) {
            console.error('Error loading MCP status:', error);
        }
    };

    const reinitializeMCP = async () => {
        try {
            setMcpStatus('Reinitializing MCP...');
            const result = await window.mcpApi.reinitialize();
            if (result.success) {
                setMcpStatus('MCP reinitialized successfully');
                await loadMCPStatus(); 
            } else {
                setMcpStatus(`MCP reinitialization failed: ${result.error}`);
            }
            
            setTimeout(() => setMcpStatus(''), 3000);
        } catch (error) {
            console.error('Error reinitializing MCP:', error);
            setMcpStatus('Failed to reinitialize MCP');
            setTimeout(() => setMcpStatus(''), 3000);
        }
    };

    useEffect(() => {
        if (isOpen) {
            loadPermissions();
            loadMCPStatus();
        }
    }, [isOpen]);

    const handleRequestPermissions = async () => {
        setIsLoading(true);
        try {
            const newPermissions = await window.permissionApi.requestPermissions();
            setPermissions(newPermissions);
            
            // Reinitialize MCP with new permissions
            await reinitializeMCP();
        } catch (error) {
            console.error('Error requesting permissions:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleResetPermissions = async () => {
        setIsLoading(true);
        try {
            const newPermissions = await window.permissionApi.resetPermissions();
            setPermissions(newPermissions);
            
            // Reinitialize MCP with new permissions
            await reinitializeMCP();
        } catch (error) {
            console.error('Error resetting permissions:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleShowSystemPreferences = async () => {
        try {
            await window.permissionApi.showSystemPreferences();
        } catch (error) {
            console.error('Error showing system preferences:', error);
        }
    };

    const getPermissionStatus = (hasPermission: boolean) => {
        return hasPermission ? 
            <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-green-600 dark:text-green-400 font-medium">Granted</span>
            </div> : 
            <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-red-600 dark:text-red-400 font-medium">Denied</span>
            </div>;
    };

    const getOverallStatus = () => {
        if (!permissions) return { status: 'unknown', color: 'gray', message: 'Loading...' };
        
        const criticalPermissions = [
            permissions.filesystemAccess,
            permissions.documentsAccess,
            permissions.downloadsAccess,
            permissions.desktopAccess
        ];
        
        const grantedCount = criticalPermissions.filter(Boolean).length;

        if (grantedCount >= 3) {
            return {
                status: 'excellent',
                color: 'green',
                message: 'Full access granted'
            };
        } else if (grantedCount === 2) {
            return {
                status: 'good',
                color: 'blue',
                message: 'Most permissions granted'
            }
        } else if (grantedCount === 1) {
            return { 
                status: 'limited', 
                color: 'yellow', 
                message: 'Limited access granted' 
            };
        } else {
            return { 
                status: 'denied', 
                color: 'red', 
                message: 'Access restricted'
            };
        };
    };
    

    const renderStatusIcon = (color: string) => {
        switch (color) {
            case 'green':
                return <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />;
            case 'blue':
                return <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />;
            case 'yellow':
                return <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />;
            case 'red':
                return <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />;
            default:
                return <Shield className="h-5 w-5 text-gray-600 dark:text-gray-400" />;
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className="max-w-4xl w-[95vw] sm:max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader className="space-y-4">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-gradient-to-br from-orange-50 to-red-100 dark:from-orange-800/30 dark:to-red-700/30">
                            <Shield className="h-8 w-8 text-orange-600 dark:text-orange-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <DialogTitle className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                                File System Permissions
                            </DialogTitle>
                            <DialogDescription className="text-slate-600 dark:text-slate-400 mt-1">
                                {permissions ? getOverallStatus().message : 'Loading permission status...'}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>
                
                <div className="space-y-6 pt-2">
                    {permissions && (
                        <>
                            <div className={cn(
                                "rounded-xl p-4 border",
                                getOverallStatus().color === 'green' && "bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-900/30 dark:to-emerald-800/30 border-green-200 dark:border-green-700/50",
                                getOverallStatus().color === 'blue' && "bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 border-blue-200 dark:border-blue-700/50",
                                getOverallStatus().color === 'yellow' && "bg-gradient-to-br from-yellow-50 to-orange-100 dark:from-yellow-900/30 dark:to-orange-800/30 border-yellow-200 dark:border-yellow-700/50",
                                getOverallStatus().color === 'red' && "bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/30 border-red-200 dark:border-red-700/50"
                            )}>
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "p-2 rounded-lg",
                                        getOverallStatus().color === 'green' && "bg-green-500/20",
                                        getOverallStatus().color === 'blue' && "bg-blue-500/20",
                                        getOverallStatus().color === 'yellow' && "bg-yellow-500/20",
                                        getOverallStatus().color === 'red' && "bg-red-500/20"
                                    )}>
                                        {renderStatusIcon(getOverallStatus().color)}
                                    </div>
                                    <div>
                                        <p className={cn(
                                            "text-sm font-medium",
                                            getOverallStatus().color === 'green' && "text-green-900 dark:text-green-100",
                                            getOverallStatus().color === 'blue' && "text-blue-900 dark:text-blue-100",
                                            getOverallStatus().color === 'yellow' && "text-yellow-900 dark:text-yellow-100",
                                            getOverallStatus().color === 'red' && "text-red-900 dark:text-red-100"
                                        )}>System Status</p>
                                        <p className={cn(
                                            "text-lg font-bold",
                                            getOverallStatus().color === 'green' && "text-green-800 dark:text-green-200",
                                            getOverallStatus().color === 'blue' && "text-blue-800 dark:text-blue-200",
                                            getOverallStatus().color === 'yellow' && "text-yellow-800 dark:text-yellow-200",
                                            getOverallStatus().color === 'red' && "text-red-800 dark:text-red-200"
                                        )}>{getOverallStatus().message}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700 pb-2">
                                    Permission Details
                                </h3>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                                        <Shield className="h-5 w-5 text-slate-500 dark:text-slate-400 mt-0.5 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">General File Access</p>
                                                {getPermissionStatus(permissions.filesystemAccess)}
                                            </div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Basic file system operations</p>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                                        <Settings className="h-5 w-5 text-slate-500 dark:text-slate-400 mt-0.5 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Documents Folder</p>
                                                {getPermissionStatus(permissions.documentsAccess)}
                                            </div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Access to ~/Documents</p>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                                        <Settings className="h-5 w-5 text-slate-500 dark:text-slate-400 mt-0.5 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Downloads Folder</p>
                                                {getPermissionStatus(permissions.downloadsAccess)}
                                            </div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Access to ~/Downloads</p>
                                        </div>
                                    </div>

    
                                    <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                                        <Settings className="h-5 w-5 text-slate-500 dark:text-slate-400 mt-0.5 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Desktop Folder</p>
                                                {getPermissionStatus(permissions.desktopAccess)}
                                            </div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Access to ~/Desktop</p>
                                        </div>
                                    </div>
                        

                                    <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                                        <Settings className="h-5 w-5 text-slate-500 dark:text-slate-400 mt-0.5 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Remember Choice</p>
                                                <span className={cn(
                                                    "px-2 py-1 rounded-full text-xs font-medium",
                                                    permissions.rememberChoice 
                                                        ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300"
                                                        : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                                                )}>
                                                    {permissions.rememberChoice ? 'Yes' : 'No'}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Save permission preferences</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6">
                                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
                                    <Zap className="h-5 w-5 text-blue-500" />
                                    Model Context Protocol (MCP) Integration 
                                </h3>
                                <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="flex-1">
                                            <p className="text-sm text-slate-700 dark:text-slate-300 mb-2">
                                                MCP integration provides AI Agent with secure file system managment.
                                            </p>
                                            {mcpStatus && (
                                                <div className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-2">
                                                    {mcpStatus}
                                                </div>
                                            )}
                                            <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                                                <div>
                                                    <span className="font-medium">Status:</span> {mcpInfo ? 
                                                        mcpInfo.isEnabled ? 
                                                            (mcpInfo.isInitialized ? 'Active' : 'Enabled (Not Connected)') 
                                                            : 'Disabled' 
                                                        : 'Loading...'
                                                    }
                                                </div>
                                                <div>
                                                    <span className="font-medium">Allowed directories:</span> {mcpInfo?.allowedDirectories.length ? 
                                                        mcpInfo.allowedDirectories.join(', ') 
                                                        : 'None'
                                                    }
                                                </div>
                                            </div>
                                        </div>
                                        <Button
                                            onClick={reinitializeMCP}
                                            size="sm"
                                            variant="outline"
                                            className="flex items-center gap-1"
                                        >
                                            <RefreshCw className="h-3 w-3" />
                                            Refresh
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                        <div className="flex flex-col sm:flex-row gap-3">
                            <Button 
                                onClick={handleRequestPermissions} 
                                disabled={isLoading || (permissions ? getOverallStatus().color === 'green' : false)}
                                className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <div className="flex items-center gap-2">
                                    {isLoading && <RefreshCw className="h-4 w-4 animate-spin" />}
                                    <Shield className="h-4 w-4" />
                                    {isLoading ? 'Processing...' : (permissions && getOverallStatus().color === 'green') ? 'All Permissions Granted' : 'Request Permissions'}
                                </div>
                            </Button>
                            
                            
                            <Button 
                                onClick={handleResetPermissions} 
                                disabled={isLoading}
                                variant="ghost"
                                className="flex-1 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 border-2 border-red-200 dark:border-red-700 hover:border-red-300 dark:hover:border-red-600 shadow-md hover:shadow-lg transition-all duration-200"
                            >
                                <div className="flex items-center gap-2">
                                    {isLoading && <RefreshCw className="h-4 w-4 animate-spin" />}
                                    <RotateCcw className="h-4 w-4" />
                                    Reset Permissions
                                </div>
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default PermissionSettings;
