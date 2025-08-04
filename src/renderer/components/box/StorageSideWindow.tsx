/**
 * StorageSideWindow Component
 * 
 * This is a slide-out panel that shows on the left side of the screen.
 */

import { useEffect, useState } from "react";
import { FaDropbox, FaGoogleDrive} from "react-icons/fa";
import { TbBrandOnedrive } from "react-icons/tb";
import {StorageWideWindowProps} from "@Types/box";
import { CloudType } from "@Types/cloudType";
import { PopupAccounts } from "./PopupAccounts";
import { HardDrive, Cloud as CloudIcon, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Props interface for individual storage provider cards */
interface StorageCardProps {
    icon: React.ReactNode;           // The icon to show (like Google Drive logo)
    label: string;                   // The name to display (like "Google Drive")
    description: string;             // What it does (like "Connect to your Google Drive")
    onClick: () => void;             // What happens when you click it
    onCancel?: () => void;           // What happens when you click cancel (optional)
    gradient: string;                // The background color theme
    iconColor: string;               // What color the icon should be
    isLoading?: boolean;             // Is it currently connecting? (optional)
    disabled?: boolean;              // Is it clickable right now? (optional)
    type?: string;                   // What type of storage (local or cloud)
    error?: string | null;           // Any error message to show (optional)
}

/**
 * StorageCard Component
 * 
 * This creates one clickable card for each storage type.
 */
function StorageCard({ icon, label, description, onClick, onCancel, gradient, iconColor, isLoading = false, disabled = false, type, error }: StorageCardProps) {
    return (
        <div 
            onClick={!isLoading && !disabled ? onClick : undefined}
            className={cn(
                "group relative overflow-hidden rounded-xl border bg-white dark:bg-slate-800 transition-all duration-500 ease-out transform-gpu",
                isLoading 
                    ? "cursor-wait opacity-75 scale-[0.98] border-slate-200 dark:border-slate-700" 
                    : disabled
                        ? "cursor-not-allowed opacity-50 scale-[0.98] border-slate-200 dark:border-slate-700"
                        : error 
                            ? "cursor-pointer border-red-300 dark:border-red-600 hover:border-red-400 dark:hover:border-red-500 hover:shadow-2xl hover:shadow-red-500/20 hover:-translate-y-2 hover:scale-[1.02] active:scale-[0.98] active:transition-transform active:duration-150"
                            : "cursor-pointer border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-2xl hover:shadow-blue-500/20 hover:-translate-y-2 hover:scale-[1.02] active:scale-[0.98] active:transition-transform active:duration-150"
            )}
        >
            <div className={cn("absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-40 transition-all duration-700 ease-out", 
                disabled ? "group-hover:opacity-0" : error ? "from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20" : gradient)} />
            
            {!isLoading && !error && !disabled && (
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-1000">
                    <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1200 ease-out delay-100" />
                </div>
            )}
            
            {!isLoading && !error && !disabled && (
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700">
                    <div className="absolute top-4 right-4 w-2 h-2 bg-blue-400/30 rounded-full animate-pulse" />
                    <div className="absolute top-8 right-8 w-1 h-1 bg-indigo-400/40 rounded-full animate-ping" style={{ animationDelay: '0.5s' }} />
                    <div className="absolute bottom-8 left-8 w-1.5 h-1.5 bg-blue-300/20 rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
                </div>
            )}
            
            {/* Cancel button for loading states */}
            {isLoading && onCancel && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onCancel();
                    }}
                    className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-300/50 hover:border-red-400/70 transition-all duration-200 hover:scale-110 active:scale-95 group/cancel"
                    title="Cancel connection"
                >
                    <X className="h-4 w-4 text-red-500 group-hover/cancel:text-red-600 transition-colors duration-200" />
                </button>
            )}
            
            <div className="relative p-5">
                <div className="flex items-start gap-4">
                    {/* Icon container */}
                    <div className={cn("p-3 rounded-xl bg-gradient-to-br shadow-lg transition-all duration-500 ease-out group-hover:shadow-2xl group-hover:scale-125 group-hover:rotate-3", error ? "from-red-100 to-red-200 dark:from-red-900/30 dark:to-red-800/30" : gradient)}>
                        <div className={cn("transition-all duration-500 ease-out group-hover:scale-110", error ? "text-red-600 dark:text-red-400" : iconColor)}>
                            {isLoading ? (
                                <Loader2 className="h-6 w-6 animate-spin" />
                            ) : (
                                <div className="transition-transform duration-300 group-hover:rotate-12">
                                    {icon}
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* Content area with title and description */}
                    <div className="flex-1 min-w-0">
                        <h3 className={cn("font-semibold transition-all duration-500 ease-out group-hover:translate-x-1", 
                            error 
                                ? "text-red-700 dark:text-red-300 group-hover:text-red-600 dark:group-hover:text-red-400" 
                                : "text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400"
                        )}>
                            {label}
                        </h3>
                        <p className={cn("text-sm mt-2 transition-all duration-500 ease-out group-hover:translate-x-1",
                            error 
                                ? "text-red-600 dark:text-red-400 group-hover:text-red-700 dark:group-hover:text-red-300" 
                                : disabled
                                    ? "text-slate-400 dark:text-slate-500"
                                    : "text-slate-600 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300"
                        )}>
                            {isLoading ? (
                                <span className="flex items-center gap-2">
                                    {type === "local" ? (<span className="animate-pulse">Opening</span> ): (<span className="animate-pulse">Connecting</span>)}
                                    <span className="flex gap-1">
                                        <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" />
                                        <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                                        <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                                    </span>
                                </span>
                            ) : disabled ? (
                                <span className="flex items-center gap-2">
                                    <span>Please wait for current connection</span>
                                </span>
                            ) : error ? (
                                <span className="flex flex-col gap-4">
                                    <span>⚠️ {error}</span>
                                    <span className="text-xs opacity-75">Click to retry</span>
                                </span>
                            ) : description}
                        </p>
                    </div>
                </div>
            </div>
            <div className={cn("absolute bottom-0 left-0 w-0 h-1 bg-gradient-to-r transition-all duration-700 ease-out", 
                error 
                    ? "from-red-500 via-red-600 to-red-700 group-hover:w-full" 
                    : "from-blue-500 via-indigo-500 to-purple-500 group-hover:w-full"
            )} />
            <div className={cn("absolute bottom-0 left-0 w-0 h-0.5 opacity-0 bg-gradient-to-r transition-all duration-1000 ease-out delay-200", 
                error 
                    ? "from-red-400 via-red-500 to-red-600 group-hover:opacity-100 group-hover:w-full" 
                    : "from-blue-400 via-indigo-400 to-purple-400 group-hover:opacity-100 group-hover:w-full"
            )} />
        </div>
    );
}

/** Main StorageWideWindow Component */
const StorageWideWindow = ({
    show,             // Whether the window is currently visible
    addStorage,       // Function to add new storage
    onAccountDeleted  // Callback when an account is deleted
}: StorageWideWindowProps) => {

    /** State for showing the account selection popup */
    const [showAccountPopup, setShowAccountPopup] = useState<boolean>(false);
    
    /** Which cloud service the user clicked on */
    const [toAddCloudType, setToAddCloudType] = useState<CloudType | null>(null); 
    
    /** Which specific account was selected */
    const [toAddAccount, setToAddAccount] = useState<string | null>(null);
    
    /** List of accounts available for the selected cloud service */
    const [availableAccounts, setAvailableAccounts] = useState<string[]>([]);
    
    /**  
     * Tracks which services are currently trying to connect
     * Each service can be true (connecting) or false (not connecting)
     */
    const [loadingStates, setLoadingStates] = useState<{[key: string]: boolean}>({
        google: false,
        dropbox: false,
        onedrive: false,
        local: false
    });
    
    /**  
    * Stores error messages for each service
    */
    const [errorStates, setErrorStates] = useState<{[key: string]: string | null}>({
        google: null,
        dropbox: null,
        onedrive: null,
        local: null
    });
    
    /** Are we currently in the process of canceling connections? */
    const [isCancellingConnections, setIsCancellingConnections] = useState<boolean>(false);

    /** Check if any cloud service is currently in connecting state */
    const isAnyServiceConnecting = () => {
        return Object.values(loadingStates).some(isLoading => isLoading);
    };

    /** This runs when the user has selected an account or connected a new one */
    useEffect(() => {
        const fetchData = async () => {
            // Only proceed if an account was actually selected
            if (toAddAccount) {
                console.log("Selected account changed to:", toAddAccount);

                // Handle different types of cloud services
                switch (toAddCloudType) {
                    case CloudType.GoogleDrive:
                        console.log("Google Drive account connected:", toAddAccount);
                        addStorage(
                            "cloud",
                            `Google Drive`,
                            CloudType.GoogleDrive,
                            toAddAccount
                        );
                        break;
                    case CloudType.Dropbox:
                        console.log("Dropbox account connected:", toAddAccount);
                        addStorage(
                            "cloud",
                            `Dropbox`,
                            CloudType.Dropbox,
                            toAddAccount
                        );
                        break;
                    case CloudType.OneDrive:
                        console.log("OneDrive account connected:", toAddAccount);
                        addStorage(
                            "cloud",
                            `OneDrive`,
                            CloudType.OneDrive,
                            toAddAccount
                        ); 
                        break;
                    case null:
                        console.log("Local account connected:", toAddAccount);
                        addStorage(
                            "local",
                            `Local File Directory`,
                        ); 
                        break;
                    default:
                        console.log("No account connected");
                }

                setToAddAccount(null);
            } else {
                console.log("No account selected");
            }
        };

        fetchData();
    }, [toAddAccount]);

    /**
     * Cancels all active cloud authentication processes
     * Called when window is closed or component unmounts during active connections
     */
    const cancelAllConnections = async () => {
        console.log('Cancelling all active connections...');
        setIsCancellingConnections(true);
        
        const cancelPromises = [];
        
        // Check each service and cancel if it's connecting

        if (loadingStates.google) {
            cancelPromises.push(
                (window as any).cloudFsApi.cancelAuthentication(CloudType.GoogleDrive)
                    .catch((error: any) => console.error('Error cancelling Google Drive:', error))
            );
        }
        
        if (loadingStates.dropbox) {
            cancelPromises.push(
                (window as any).cloudFsApi.cancelAuthentication(CloudType.Dropbox)
                    .catch((error: any) => console.error('Error cancelling Dropbox:', error))
            );
        }
        
        if (loadingStates.onedrive) {
            cancelPromises.push(
                (window as any).cloudFsApi.cancelAuthentication(CloudType.OneDrive)
                    .catch((error: any) => console.error('Error cancelling OneDrive:', error))
            );
        }
        
        // Wait for all cancellations to complete
        await Promise.all(cancelPromises);
        
        /**  
         * Reset all states back to normal after cancellation
         * This makes sure no cards show as loading or have errors
         */
        setLoadingStates({
            google: false,
            dropbox: false,
            onedrive: false,
            local: false
        });
        
        setErrorStates({
            google: null,
            dropbox: null,
            onedrive: null,
            local: null
        });
        
        setIsCancellingConnections(false);
    };

    /** This watches for changes in window visibility and popup state */
    useEffect(() => {
        // Only act when the account popup is closed or the main panel is closed
        if (!showAccountPopup || !show) {
            if (!show && isAnyServiceConnecting()) {
                // Panel closed while connecting - cancel everything
                cancelAllConnections();
            } else {
                // Panel closed normally - just reset loading states
                setLoadingStates({
                    google: false,
                    dropbox: false,
                    onedrive: false,
                    local: false
                });
                // Only clear errors when fully closing the panel
                if (!show) {
                    setErrorStates({
                        google: null,
                        dropbox: null,
                        onedrive: null,
                        local: null
                    });
                }
            }
        }
    }, [showAccountPopup, show]);

    /**
     * Cleanup effect to cancel all connections when component unmounts
     */
    useEffect(() => {
        return () => {
            if (isAnyServiceConnecting()) {
                console.log('Component unmounting, cancelling all connections...');
                cancelAllConnections().catch(error => 
                    console.error('Error during cleanup:', error)
                );
            }
        };
    }, []);

    /**
     * Functions for error and state management
     */
    const clearError = (service: string) => {
        setErrorStates(prev => ({ ...prev, [service]: null }));
    };

    const setError = (service: string, message: string) => {
        setErrorStates(prev => ({ ...prev, [service]: message }));
    };

    /** Converts error messages to user-friendly descriptions */
    const getUserFriendlyError = (error: any): string => {
        if (typeof error === 'string') {
            if (error.includes('cancelled')) return 'Authentication cancelled';
            if (error.includes('network') || error.includes('timeout')) return 'Connection failed';
            if (error.includes('Authentication failed')) return 'Authentication failed';
            return 'Connection failed';
        }
        
        if (error?.message) {
            if (error.message.includes('cancelled')) return 'Authentication cancelled';
            if (error.message.includes('network') || error.message.includes('timeout')) return 'Connection failed';
            if (error.message.includes('Authentication failed')) return 'Authentication failed';
            return 'Connection failed';
        }
        
        return 'Connection failed';
    };

    /**
     * Individual cancel handlers for each service
     * 
     * When a user clicks the cancel button on a specific card,
     * these functions handle canceling just that service
     */

    // Cancel Google Drive connection
    const handleCancelGoogle = async () => {
        console.log('Cancelling Google Drive connection');
        try {
            await (window as any).cloudFsApi.cancelAuthentication(CloudType.GoogleDrive);
        } catch (error) {
            console.error('Error cancelling Google Drive authentication:', error);
        }
        setLoadingStates(prev => ({ ...prev, google: false }));
        clearError('google');
    };

    // Cancel Dropbox connection
    const handleCancelDropbox = async () => {
        console.log('Cancelling Dropbox connection');
        try {
            await (window as any).cloudFsApi.cancelAuthentication(CloudType.Dropbox);
        } catch (error) {
            console.error('Error cancelling Dropbox authentication:', error);
        }
        setLoadingStates(prev => ({ ...prev, dropbox: false }));
        clearError('dropbox');
    };

    // Cancel OneDrive connection
    const handleCancelOneDrive = async () => {
        console.log('Cancelling OneDrive connection');
        try {
            await (window as any).cloudFsApi.cancelAuthentication(CloudType.OneDrive);
        } catch (error) {
            console.error('Error cancelling OneDrive authentication:', error);
        }
        setLoadingStates(prev => ({ ...prev, onedrive: false }));
        clearError('onedrive');
    };

    const handleCancelLocal = () => {
        console.log('Cancelling Local connection');
        setLoadingStates(prev => ({ ...prev, local: false }));
        clearError('local');
    };

    /** Google Drive connection handler */
    const handleGoogleClick = async () => {
        if (isAnyServiceConnecting()) {
            console.log('Another service is already connecting, please wait...');
            return;
        }

        console.log('google drive clicked')

        clearError('google');
        setLoadingStates(prev => ({ ...prev, google: true }));
        setToAddCloudType(CloudType.GoogleDrive);
        
        try {
            const accountIds: Array<string> = await (window as any).cloudFsApi.getConnectedCloudAccounts(CloudType.GoogleDrive);
            console.log('accountIds: ', accountIds);

            if (accountIds && accountIds.length > 0) {
                console.log('Google Drive account already connected');
                setAvailableAccounts(accountIds);
                setShowAccountPopup(true);
            } else {
                console.log('Google Drive account not connected, connecting...');
                try {
                    await connectNewCloudAccount(CloudType.GoogleDrive);
                } catch (error) {
                    console.log('Google Drive connection cancelled or failed');
                }
            }
        } catch (error: any) {
            console.error('Google Drive error:', error);
            setError('google', getUserFriendlyError(error));
        } finally {
            setTimeout(() => {
                setLoadingStates(prev => ({ ...prev, google: false }));
            }, 200);
        }
    }

    /** Dropbox connection handler */
    const handleDropBoxClick = async () => {
        if (isAnyServiceConnecting()) {
            console.log('Another service is already connecting, please wait...');
            return;
        }

        console.log('dropbox clicked')
        
        clearError('dropbox');
        setLoadingStates(prev => ({ ...prev, dropbox: true }));
        setToAddCloudType(CloudType.Dropbox);
        
        try {
            await new Promise(resolve => setTimeout(resolve, 300));
            
            const accountIds: Array<string> = await (window as any).cloudFsApi.getConnectedCloudAccounts(CloudType.Dropbox);
            console.log('accountIds: ', accountIds);

            if (accountIds && accountIds.length > 0) {
                console.log('DropBox account already connected');
                setAvailableAccounts(accountIds);
                setShowAccountPopup(true);
            } else {
                console.log('DropBox account not connected, connecting...');
                try {
                    await connectNewCloudAccount(CloudType.Dropbox);
                } catch (error) {
                    console.log('Dropbox connection cancelled or failed');
                }
            }
        } catch (error: any) {
            console.error('Dropbox error:', error);
            setError('dropbox', getUserFriendlyError(error));
        } finally {
            setTimeout(() => {
                setLoadingStates(prev => ({ ...prev, dropbox: false }));
            }, 200);
        }
    }

    /** OneDrive connection handler */
    const handleOneDriveClick = async () => {
        if (isAnyServiceConnecting()) {
            console.log('Another service is already connecting, please wait...');
            return;
        }

        console.log('onedrive clicked')

        clearError('onedrive');
        setLoadingStates(prev => ({ ...prev, onedrive: true }));
        setToAddCloudType(CloudType.OneDrive);
        
        try {
            await new Promise(resolve => setTimeout(resolve, 300));
            
            const accountIds: Array<string> = await (window as any).cloudFsApi.getConnectedCloudAccounts(CloudType.OneDrive);
            console.log('accountIds: ', accountIds);

            if (accountIds && accountIds.length > 0) {
                console.log('OneDrive account already connected');
                setAvailableAccounts(accountIds);
                setShowAccountPopup(true);
            } else {
                console.log('OneDrive account not connected, connecting...');
                try {
                    await connectNewCloudAccount(CloudType.OneDrive);
                } catch (error) {
                    console.log('OneDrive connection cancelled or failed');
                }
            }
        } catch (error: any) {
            console.error('OneDrive error:', error);
            setError('onedrive', getUserFriendlyError(error));
        } finally {
            setTimeout(() => {
                setLoadingStates(prev => ({ ...prev, onedrive: false }));
            }, 200);
        }
    }

    /** Local directory handler */
    const handleLocalClicked = async () => {
        if (isAnyServiceConnecting()) {
            console.log('Another service is already connecting, please wait...');
            return;
        }

        console.log('local clicked')

        clearError('local');
        setLoadingStates(prev => ({ ...prev, local: true }));
        setToAddCloudType(null);
        
        try {
            await new Promise(resolve => setTimeout(resolve, 300));
            setToAddAccount("local");
        } catch (error: any) {
            console.error('Local error:', error);
            setError('local', 'Failed to open local directory');
        } finally {
            setTimeout(() => {
                setLoadingStates(prev => ({ ...prev, local: false }));
            }, 200);
        }
    }

    /**
     * Initiates new cloud account connection process
     * Handles the OAuth flow and account registration
     */
    const connectNewCloudAccount = async (cloudType: CloudType) => {
        try {
            // This opens a browser window for the user to log in
            const accountId = await (window as any).cloudFsApi.connectNewCloudAccount(cloudType);
            setToAddAccount(accountId);
        } catch (error: any) {
            console.error(`${cloudType} authentication error:`, error);
            if (!error.message?.includes('cancelled') && !error.message?.includes('aborted')) {
                const serviceName = cloudType.toLowerCase();
                setError(serviceName, getUserFriendlyError(error));
            }
            throw error; 
        }
    }

    /** Handles account deletion from the popup interface */
    const handleAccountDeleted = async (cloudType: CloudType, accountId: string) => {
        console.log(`Account ${accountId} deleted for ${cloudType}, refreshing available accounts...`)
        setAvailableAccounts(prev => prev.filter(account => account !== accountId))
        
        if (onAccountDeleted) {
            onAccountDeleted(cloudType, accountId)
        }
    }

    return (
        <div
            className={`${
                show ? "w-72" : "w-0"
            } select-none absolute left-0 top-0 h-full z-30 bg-white/95 dark:bg-slate-900/95 border-r border-slate-200 dark:border-slate-700 shadow-2xl transition-all duration-300 ease-out overflow-hidden backdrop-blur-lg`}
        >
            <div className={`h-full flex flex-col transition-all duration-300 ease-out ${
                show ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"
            }`}>
                {/* Header section with title and description */}
                <div className="p-6 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-blue-900/10 dark:to-indigo-900/10">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-3 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 shadow-lg hover:shadow-xl transition-all duration-500 hover:scale-110 hover:rotate-6">
                            <CloudIcon className="h-6 w-6 text-blue-600 dark:text-blue-400 transition-all duration-500 hover:scale-110" />
                        </div>
                        {/* Main title */}
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 transition-all duration-500 bg-gradient-to-r from-slate-900 to-slate-700 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
                                Add Storage
                            </h2>
                            {/* Subtitle */}
                            <p className="text-sm text-slate-600 dark:text-slate-400 transition-all duration-500 hover:text-slate-700 dark:hover:text-slate-300">
                                Connect your storage providers
                            </p>
                        </div>
                    </div>
                </div>
                
                {/* Storage provider cards container */}
                <div className="flex-1 p-6 space-y-4 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 scrollbar-track-transparent hover:scrollbar-thumb-slate-400 dark:hover:scrollbar-thumb-slate-500 transition-all duration-300">
                    <div className="space-y-4">

                        {/* Local file storage card */}
                        <StorageCard
                            icon={<HardDrive className="h-6 w-6" />}
                            label="Local Drive"
                            description="Access local files and folders"
                            onClick={() => handleLocalClicked()}
                            gradient="from-slate-50 to-gray-50 dark:from-slate-800/50 dark:to-slate-700/50"
                            iconColor="text-slate-600 dark:text-slate-400"
                            isLoading={loadingStates.local}
                            disabled={isAnyServiceConnecting() && !loadingStates.local}
                            type="local"
                            error={errorStates.local}
                            onCancel={handleCancelLocal}
                        />
                        
                        {/* Google Drive cloud storage card */}
                        <StorageCard
                            icon={<FaGoogleDrive className="h-6 w-6" />}
                            label="Google Drive"
                            description="Connect to your Google Drive"
                            onClick={() => handleGoogleClick()}
                            gradient="from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20"
                            iconColor="text-blue-600 dark:text-blue-400"
                            isLoading={loadingStates.google}
                            disabled={isAnyServiceConnecting() && !loadingStates.google}
                            error={errorStates.google}
                            onCancel={handleCancelGoogle}
                        />
                        
                        {/* Dropbox cloud storage card */}
                        <StorageCard
                            icon={<FaDropbox className="h-6 w-6" />}
                            label="Dropbox"
                            description="Connect to your Dropbox account"
                            onClick={() => handleDropBoxClick()}
                            gradient="from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20"
                            iconColor="text-blue-600 dark:text-cyan-400"
                            isLoading={loadingStates.dropbox}
                            disabled={isAnyServiceConnecting() && !loadingStates.dropbox}
                            error={errorStates.dropbox}
                            onCancel={handleCancelDropbox}
                        />
                        
                        {/* Microsoft OneDrive cloud storage card */}
                        <StorageCard
                            icon={<TbBrandOnedrive className="h-6 w-6" />}
                            label="OneDrive"
                            description="Connect to your OneDrive account"
                            onClick={() => handleOneDriveClick()}
                            gradient="from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20"
                            iconColor="text-blue-600 dark:text-purple-400"
                            isLoading={loadingStates.onedrive}
                            disabled={isAnyServiceConnecting() && !loadingStates.onedrive}
                            error={errorStates.onedrive}
                            onCancel={handleCancelOneDrive}
                        />
                    </div>
                </div>
                
                {/* Footer section with status indicator */}
                <div className="select-none p-6 border-t border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-50/50 to-gray-50/50 dark:from-slate-800/50 dark:to-slate-700/50">
                    <div className="flex items-center justify-center gap-2 mb-3">
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                        <div className="w-1 h-1 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 text-center transition-all duration-500 hover:text-slate-600 dark:hover:text-slate-300 font-medium">
                        {isCancellingConnections 
                            ? "Cancelling active connections..." 
                            : isAnyServiceConnecting() 
                                ? "Connection in progress..." 
                                : "Choose a storage provider to get started"
                        }
                    </p>
                    <div className="mt-2 w-16 h-0.5 bg-gradient-to-r from-blue-400 to-purple-400 mx-auto rounded-full opacity-50" />
                </div>
            </div>

            {/* Account selection popup */}
            <PopupAccounts 
                open={showAccountPopup} 
                setOpen={setShowAccountPopup} 
                setSelectedAccount={setToAddAccount} 
                availableAccounts={availableAccounts} 
                connectAddNewAccount={connectNewCloudAccount}
                cloudType={toAddCloudType}
                onAccountDeleted={handleAccountDeleted}
            />
        </div>
    );
};

export default StorageWideWindow;
