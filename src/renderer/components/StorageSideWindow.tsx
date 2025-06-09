import { useEffect, useState } from "react";
import { CloudItem } from "./ui/cloudItem";
import { FaDropbox, FaGoogleDrive} from "react-icons/fa";
import { TbBrandOnedrive } from "react-icons/tb";
import { SiIcloud } from "react-icons/si";
import {StorageWideWindowProps} from "@Types/box";
import { CloudType } from "../../types/cloudType";
import { PopupAccounts } from "./PopupAccounts";
import { HardDrive, Cloud as CloudIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface StorageCardProps {
    icon: React.ReactNode;
    label: string;
    description: string;
    onClick: () => void;
    gradient: string;
    iconColor: string;
    isLoading?: boolean;
    type?: string;
    error?: string | null;
}

function StorageCard({ icon, label, description, onClick, gradient, iconColor, isLoading = false, type, error }: StorageCardProps) {
    return (
        <div 
            onClick={!isLoading ? onClick : undefined}
            className={cn(
                "group relative overflow-hidden rounded-xl border bg-white dark:bg-slate-800 transition-all duration-500 ease-out transform-gpu",
                isLoading 
                    ? "cursor-wait opacity-75 scale-[0.98] border-slate-200 dark:border-slate-700" 
                    : error 
                        ? "cursor-pointer border-red-300 dark:border-red-600 hover:border-red-400 dark:hover:border-red-500 hover:shadow-2xl hover:shadow-red-500/20 hover:-translate-y-2 hover:scale-[1.02] active:scale-[0.98] active:transition-transform active:duration-150"
                        : "cursor-pointer border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-2xl hover:shadow-blue-500/20 hover:-translate-y-2 hover:scale-[1.02] active:scale-[0.98] active:transition-transform active:duration-150"
            )}
        >
            <div className={cn("absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-40 transition-all duration-700 ease-out", error ? "from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20" : gradient)} />
            
            {!isLoading && !error && (
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-1000">
                    <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1200 ease-out delay-100" />
                </div>
            )}
            
            {!isLoading && !error && (
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700">
                    <div className="absolute top-4 right-4 w-2 h-2 bg-blue-400/30 rounded-full animate-pulse" />
                    <div className="absolute top-8 right-8 w-1 h-1 bg-indigo-400/40 rounded-full animate-ping" style={{ animationDelay: '0.5s' }} />
                    <div className="absolute bottom-8 left-8 w-1.5 h-1.5 bg-blue-300/20 rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
                </div>
            )}
            
            <div className="relative p-5">
                <div className="flex items-start gap-4">
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


const StorageWideWindow = ({show, addStorage}: StorageWideWindowProps) => {
    const [showAccountPopup, setShowAccountPopup] = useState<boolean>(false);
    const [toAddCloudType, setToAddCloudType] = useState<CloudType | null>(null); 
    const [toAddAccount, setToAddAccount] = useState<string | null>(null);
    const [availableAccounts, setAvailableAccounts] = useState<string[]>([]);
    const [loadingStates, setLoadingStates] = useState<{[key: string]: boolean}>({
        google: false,
        dropbox: false,
        onedrive: false,
        local: false
    });
    const [errorStates, setErrorStates] = useState<{[key: string]: string | null}>({
        google: null,
        dropbox: null,
        onedrive: null,
        local: null
    });

    // when the user selects an account from the popup / or connects a new account, effect will be triggered
    useEffect(() => {
        const fetchData = async () => {
            if (toAddAccount) {
                console.log("Selected account changed to:", toAddAccount);

                switch (toAddCloudType) {
                    case CloudType.GoogleDrive:
                        console.log("Google Drive account connected:", toAddAccount);
                        addStorage(
                            "cloud",
                            `Google Drive: ${toAddAccount}`,
                            <FaGoogleDrive className="h-6 w-6" />,
                            CloudType.GoogleDrive,
                            toAddAccount
                        );
                        break;
                    case CloudType.Dropbox:
                        console.log("Dropbox account connected:", toAddAccount);
                        addStorage(
                            "cloud",
                            `Dropbox: ${toAddAccount}`,
                            <FaDropbox className="h-6 w-6" />,
                            CloudType.Dropbox,
                            toAddAccount
                        );
                        break;
                    case CloudType.OneDrive:
                        console.log("OneDrive account connected:", toAddAccount);
                        addStorage(
                            "cloud",
                            `OneDrive: ${toAddAccount}`,
                            <TbBrandOnedrive className="h-6 w-6" />,
                            CloudType.OneDrive,
                            toAddAccount
                        ); 
                        break;
                    case null:
                            console.log("Local account connected:", toAddAccount);
                            addStorage(
                                "local",
                                `Local File Directory`,
                                <HardDrive className="h-6 w-6" />,
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

    // Reset loading states when popup is closed without selection
    useEffect(() => {
        if (!showAccountPopup || !show) {
            setLoadingStates({
                google: false,
                dropbox: false,
                onedrive: false,
                local: false
            });
            // Clear errors when closing sidebar
            if (!show) {
                setErrorStates({
                    google: null,
                    dropbox: null,
                    onedrive: null,
                    local: null
                });
            }
        }
    }, [showAccountPopup, show]);

    // Helper function to clear error for a specific service
    const clearError = (service: string) => {
        setErrorStates(prev => ({ ...prev, [service]: null }));
    };

    // Helper function to set error for a specific service
    const setError = (service: string, message: string) => {
        setErrorStates(prev => ({ ...prev, [service]: message }));
    };

    // Helper function to get user-friendly error message
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


    const handleGoogleClick = async () => {
        // TODO added for testing
        // await (window as any).electronAPI.clearAuthTokens(); 
        console.log('google drive clicked')

        // Clear any existing error
        clearError('google');
        setLoadingStates(prev => ({ ...prev, google: true }));
        
        // change selected cloud type to google drive
        setToAddCloudType(CloudType.GoogleDrive);
        try {
            
            // if not exist in store, load token from google
            // if exist in store, load token from store
            const accountIds: Array<string> = await (window as any).cloudFsApi.getConnectedCloudAccounts(CloudType.GoogleDrive);

            console.log('accountIds: ', accountIds);

            if (accountIds && accountIds.length > 0) {
                console.log('Google Drive account already connected');

                // show connected accounts on POP UP UI
                setAvailableAccounts(accountIds);
                setShowAccountPopup(true);
            } else {
                console.log('Google Drive account not connected, connecting...');
                // no need to show popup, just connect new account
                await connectNewCloudAccount(CloudType.GoogleDrive);
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

    const handleDropBoxClick = async () => {
        // TODO added for testing
        // await (window as any).electronAPI.clearAuthTokens(); 
        console.log('dropbox clicked')
        
        // Clear any existing error
        clearError('dropbox');
        setLoadingStates(prev => ({ ...prev, dropbox: true }));
        
        // change selected cloud type to dropbox  
        setToAddCloudType(CloudType.Dropbox);
        // TODO: implement getConnectedCloudAccounts for dropbox
        try {
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // if not exist in store, load token from google
            // if exist in store, load token from store
            const accountIds: Array<string> = await (window as any).cloudFsApi.getConnectedCloudAccounts(CloudType.Dropbox);

            console.log('accountIds: ', accountIds);

            if (accountIds && accountIds.length > 0) {
                console.log('DropBox account already connected');

                // show connected accounts on POP UP UI
                setAvailableAccounts(accountIds);
                setShowAccountPopup(true);
            } else {
                console.log('DropBox account not connected, connecting...');
                // no need to show popup, just connect new account
                await connectNewCloudAccount(CloudType.Dropbox);
            }
        } catch (error: any) {
            console.error('Dropbox error:', error);
            setError('dropbox', getUserFriendlyError(error));
        } finally {
            // Add a small delay before removing loading state for smoother UX
            setTimeout(() => {
                setLoadingStates(prev => ({ ...prev, dropbox: false }));
            }, 200);
        }
    }

    const handleOneDriveClick = async () => {
        // TODO added for testing
        // await (window as any).electronAPI.clearAuthTokens(); 
        console.log('onedrive clicked')

        // Clear any existing error
        clearError('onedrive');
        setLoadingStates(prev => ({ ...prev, onedrive: true }));

        // change selected cloud type to OneDrive
        setToAddCloudType(CloudType.OneDrive);
        try {
            // Add a small delay for smooth UX
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // if not exist in store, load token from OneDrive
            // if exist in store, load token from store
            const accountIds: Array<string> = await (window as any).cloudFsApi.getConnectedCloudAccounts(CloudType.OneDrive);

            console.log('accountIds: ', accountIds);

            if (accountIds && accountIds.length > 0) {
                console.log('OneDrive account already connected');

                // show connected accounts on POP UP UI
                setAvailableAccounts(accountIds);
                setShowAccountPopup(true);
            } else {
                console.log('OneDrive account not connected, connecting...');
                // no need to show popup, just connect new account
                await connectNewCloudAccount(CloudType.OneDrive);
            }
        } catch (error: any) {
            console.error('OneDrive error:', error);
            setError('onedrive', getUserFriendlyError(error));
        } finally {
            // Always reset loading state
            setTimeout(() => {
                setLoadingStates(prev => ({ ...prev, onedrive: false }));
            }, 200);
        }
    }

    const handleLocalClicked = async () => {
        // TODO added for testing
        // await (window as any).electronAPI.clearAuthTokens(); 
        console.log('local clicked')

        // Clear any existing error
        clearError('local');
        setLoadingStates(prev => ({ ...prev, local: true }));

        // change selected cloud type to google drive
        setToAddCloudType(null);
        try {
            await new Promise(resolve => setTimeout(resolve, 300));
            
            setToAddAccount("local");
        } catch (error: any) {
            console.error('Local error:', error);
            setError('local', 'Failed to open local directory');
        } finally {
            // Add a small delay before removing loading state for smoother UX
            setTimeout(() => {
                setLoadingStates(prev => ({ ...prev, local: false }));
            }, 200);
        }
    }

    const connectNewCloudAccount = async (cloudType: CloudType) => {
        const accountId = await (window as any).cloudFsApi.connectNewCloudAccount(cloudType);
        setToAddAccount(accountId);
    }

    return (
        <div
            className={`${
                show ? "w-72" : "w-0"
            } absolute left-0 top-0 h-full z-30 bg-white/95 dark:bg-slate-900/95 border-r border-slate-200 dark:border-slate-700 shadow-2xl transition-all duration-300 ease-out overflow-hidden backdrop-blur-lg`}
        >
            <div className={`h-full flex flex-col transition-all duration-300 ease-out ${
                show ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"
            }`}>
                <div className="p-6 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-blue-900/10 dark:to-indigo-900/10">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-3 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 shadow-lg hover:shadow-xl transition-all duration-500 hover:scale-110 hover:rotate-6">
                            <CloudIcon className="h-6 w-6 text-blue-600 dark:text-blue-400 transition-all duration-500 hover:scale-110" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 transition-all duration-500 bg-gradient-to-r from-slate-900 to-slate-700 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
                                Add Storage
                            </h2>
                            <p className="text-sm text-slate-600 dark:text-slate-400 transition-all duration-500 hover:text-slate-700 dark:hover:text-slate-300">
                                Connect your storage providers
                            </p>
                        </div>
                    </div>
                </div>
                <div className="flex-1 p-6 space-y-4 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 scrollbar-track-transparent hover:scrollbar-thumb-slate-400 dark:hover:scrollbar-thumb-slate-500 transition-all duration-300">
                    <div className="space-y-4">
                        <StorageCard
                            icon={<HardDrive className="h-6 w-6" />}
                            label="Local Drive"
                            description="Access local files and folders"
                            onClick={() => handleLocalClicked()}
                            gradient="from-slate-50 to-gray-50 dark:from-slate-800/50 dark:to-slate-700/50"
                            iconColor="text-slate-600 dark:text-slate-400"
                            isLoading={loadingStates.local}
                            type="local"
                            error={errorStates.local}
                        />
                        <StorageCard
                            icon={<FaGoogleDrive className="h-6 w-6" />}
                            label="Google Drive"
                            description="Connect to your Google Drive"
                            onClick={() => handleGoogleClick()}
                            gradient="from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20"
                            iconColor="text-blue-600 dark:text-blue-400"
                            isLoading={loadingStates.google}
                            error={errorStates.google}
                        />
                        <StorageCard
                            icon={<FaDropbox className="h-6 w-6" />}
                            label="Dropbox"
                            description="Connect to your Dropbox account"
                            onClick={() => handleDropBoxClick()}
                            gradient="from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20"
                            iconColor="text-blue-600 dark:text-cyan-400"
                            isLoading={loadingStates.dropbox}
                            error={errorStates.dropbox}
                        />
                        <StorageCard
                            icon={<TbBrandOnedrive className="h-6 w-6" />}
                            label="OneDrive"
                            description="Connect to your OneDrive account"
                            onClick={() => handleOneDriveClick()}
                            gradient="from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20"
                            iconColor="text-blue-600 dark:text-purple-400"
                            isLoading={loadingStates.onedrive}
                            error={errorStates.onedrive}
                        />
                    </div>
                </div>
                <div className="p-6 border-t border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-50/50 to-gray-50/50 dark:from-slate-800/50 dark:to-slate-700/50">
                    <div className="flex items-center justify-center gap-2 mb-3">
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                        <div className="w-1 h-1 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 text-center transition-all duration-500 hover:text-slate-600 dark:hover:text-slate-300 font-medium">
                        Choose a storage provider to get started
                    </p>
                    <div className="mt-2 w-16 h-0.5 bg-gradient-to-r from-blue-400 to-purple-400 mx-auto rounded-full opacity-50" />
                </div>
            </div>

            <PopupAccounts 
                open={showAccountPopup} 
                setOpen={setShowAccountPopup} 
                setSelectedAccount={setToAddAccount} 
                availableAccounts={availableAccounts} 
                connectAddNewAccount={connectNewCloudAccount}
            />
        </div>
    );
};

export default StorageWideWindow;
