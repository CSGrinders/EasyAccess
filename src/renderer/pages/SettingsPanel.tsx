import React, { useState } from 'react';
import { Shield, Info, HelpCircle, Settings, Bell, Palette, Database, Github, Trash2 } from 'lucide-react';
import { Button } from '@Components/ui/button';
import { Card } from '@Components/ui/card';
import PermissionSettings from '@/components/settings/PermissionSettings';
import { toast } from 'sonner';

interface SettingsPanelProps {
    className?: string;
    onAccountsCleared?: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ className, onAccountsCleared }) => {
    const [isClearing, setIsClearing] = useState(false);

    const handleClearAccounts = async () => {
        if (!window.confirm("Are you sure you want to delete all your accounts? This action is irreversible.")) {
            return;
        }

        setIsClearing(true);
        
        try {
            const success = await (window as any).cloudFsApi.clearData();
            
            if (success) {
                toast.success("All accounts have been deleted successfully.");
                onAccountsCleared?.(); 
            } else {
                toast.error("Failed to delete accounts. Please try again.");
            }
        } catch (error) {
            console.error("Error clearing accounts:", error);
            toast.error("An error occurred while deleting accounts.");
        } finally {
            setIsClearing(false);
        }
    };
    return (
        <div className={`p-6 space-y-6 ${className} overflow-y-auto`}>
            <div className="space-y-2">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Settings</h1>
                <p className="text-slate-600 dark:text-slate-400">
                    Manage your permissions
                </p>
            </div>

            <div className="grid gap-6">
                <Card className="p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/50">
                                <Shield className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                                    Security & Permissions
                                </h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400">
                                    Manage file system access and security settings
                                </p>
                            </div>
                        </div>
                        
                        <div className="space-y-3">
                            <PermissionSettings>
                                <Button
                                    variant="outline"
                                    className="w-full justify-start h-auto p-4 bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 border-orange-200 dark:border-orange-700 hover:bg-gradient-to-r hover:from-orange-100 hover:to-red-100 dark:hover:from-orange-900/30 dark:hover:to-red-900/30"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/50">
                                            <Shield className="h-4 w-4 text-orange-600 dark:text-orange-400"/>
                                        </div>
                                        <div className="text-left">
                                            <div className="text-sm font-medium text-orange-800 dark:text-orange-200">
                                                File System Permissions
                                            </div>
                                            <div className="text-xs text-orange-600 dark:text-orange-400">
                                                Configure macOS file access permissions
                                            </div>
                                        </div>
                                    </div>
                                </Button>
                            </PermissionSettings>
                        </div>
                    </div>
                </Card>


                <Card className="p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/50">
                                <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                                    Delete Your Data
                                </h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400">
                                    Delete all the accounts linked to EasyAction
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            className="w-full justify-start h-auto p-4 bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 border-orange-200 dark:border-orange-700 hover:bg-gradient-to-r hover:from-orange-100 hover:to-red-100 dark:hover:from-orange-900/30 dark:hover:to-red-900/30"
                            onClick={handleClearAccounts}
                            disabled={isClearing}
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/50">
                                    <Trash2 className="h-4 w-4 text-orange-600 dark:text-orange-400"/>
                                </div>
                                <div className="text-left">
                                    <div className="text-sm font-medium text-red-800 dark:text-red-200">
                                        {isClearing ? "Deleting..." : "Delete Accounts"}
                                    </div>
                                    <div className="text-xs text-yellow-600 dark:text-yellow-400">
                                       This action is irreversible and will delete all your accounts.
                                    </div>
                                </div>
                            </div>
                        </Button>
                    </div>
                </Card>
                <Card className="p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700">
                                <Info className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                                    About
                                </h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400">
                                    Application information and help
                                </p>
                            </div>
                        </div>
                        
                        <div className="space-y-3">
                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Version</span>
                                    <span className="text-sm text-slate-600 dark:text-slate-400">v0.1.0</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Platform</span>
                                    <span className="text-sm text-slate-600 dark:text-slate-400">macOS</span>
                                </div>
                            </div>

                            <Button
                                variant="outline"
                                className="w-full justify-start h-auto p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/50">
                                        <Github className="h-4 w-4 text-cyan-600 dark:text-cyan-400"/>
                                    </div>
                                    <div className="text-left">
                                        <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                            Github
                                        </div>
                                        <div className="text-xs text-slate-600 dark:text-slate-400">
                                            Readme and troubleshooting
                                        </div>
                                    </div>
                                </div>
                            </Button>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default SettingsPanel;
