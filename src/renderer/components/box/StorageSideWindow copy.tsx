/**
 * StorageSideWindow Component
 * 
 * This is a slide-out panel that shows on the left side of the screen.
 * It lets users connect different types of storage like:
 * - Local computer files
 * - Google Drive
 * - Dropbox  
 * - OneDrive
 * 
 * Features:
 * - Nice animations when hovering over cards
 * - Shows loading spinners when connecting
 * - Handles errors if connection fails
 * - Can cancel connections in progress
 * - Manages multiple cloud accounts
 */

import { useEffect, useState } from "react";
import { CloudItem } from "../ui/cloudItem";
import { FaDropbox, FaGoogleDrive} from "react-icons/fa";
import { TbBrandOnedrive } from "react-icons/tb";
import { SiIcloud } from "react-icons/si";
import {StorageWideWindowProps} from "@Types/box";
import { CloudType } from "../../../types/cloudType";
import { PopupAccounts } from "./PopupAccounts";
import { HardDrive, Cloud as CloudIcon, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * What each storage card needs to work properly
 * Think of this like a recipe - these are all the ingredients needed
 */
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
 * Each card can:
 * - Show a nice animation when you hover over it
 * - Display a loading spinner when connecting
 * - Show error messages if something goes wrong
 * - Be disabled when another connection is happening
 * - Have a cancel button during connection
 */
function StorageCard({ icon, label, description, onClick, onCancel, gradient, iconColor, isLoading = false, disabled = false, type, error }: StorageCardProps) {
    return (
        <div 
            // Only allow clicking if not loading and not disabled
            onClick={!isLoading && !disabled ? onClick : undefined}
            className={cn(
                // Base styles that always apply
                "group relative overflow-hidden rounded-xl border bg-white dark:bg-slate-800 transition-all duration-500 ease-out transform-gpu",
                
                // Different styles based on the card's current state
                isLoading 
                    ? "cursor-wait opacity-75 scale-[0.98] border-slate-200 dark:border-slate-700"  // Loading: wait cursor, slightly faded
                    : disabled
                        ? "cursor-not-allowed opacity-50 scale-[0.98] border-slate-200 dark:border-slate-700"  // Disabled: can't click, very faded
                        : error 
                            ? "cursor-pointer border-red-300 dark:border-red-600 hover:border-red-400 dark:hover:border-red-500 hover:shadow-2xl hover:shadow-red-500/20 hover:-translate-y-2 hover:scale-[1.02] active:scale-[0.98] active:transition-transform active:duration-150"  // Error: red theme with hover effects
                            : "cursor-pointer border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-2xl hover:shadow-blue-500/20 hover:-translate-y-2 hover:scale-[1.02] active:scale-[0.98] active:transition-transform active:duration-150"  // Normal: blue theme with hover effects
            )}
        >
            {/* 
                Background color overlay that appears when you hover
                Only shows if the card is not disabled 
            */}
            <div className={cn("absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-40 transition-all duration-700 ease-out", 
                disabled ? "group-hover:opacity-0" : error ? "from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20" : gradient)} />
            
            {/* 
                Shimmery light effect that sweeps across the card on hover
                Only shows for cards that are clickable (not loading, no error, not disabled)
            */}
            {!isLoading && !error && !disabled && (
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-1000">
                    {/* This creates a moving light effect from left to right */}
                    <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1200 ease-out delay-100" />
                </div>
            )}
            
            {/* 
                Small floating dots that appear on hover for decoration
                Creates a magical, interactive feeling
            */}
            {!isLoading && !error && !disabled && (
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700">
                    {/* Three small dots in different positions with different animations */}
                    <div className="absolute top-4 right-4 w-2 h-2 bg-blue-400/30 rounded-full animate-pulse" />
                    <div className="absolute top-8 right-8 w-1 h-1 bg-indigo-400/40 rounded-full animate-ping" style={{ animationDelay: '0.5s' }} />
                    <div className="absolute bottom-8 left-8 w-1.5 h-1.5 bg-blue-300/20 rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
                </div>
            )}
            
            {/* 
                Cancel button that appears in the top-right when loading
                Lets users stop a connection that's taking too long
            */}
            {isLoading && onCancel && (
                <button
                    // Stop the click from bubbling up to the card
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
            
            {/* Main content area of the card */}
            <div className="relative p-5">
                <div className="flex items-start gap-4">
                    {/* 
                        Icon container with background and hover animations
                        The icon gets bigger and rotates slightly on hover
                    */}
                    <div className={cn("p-3 rounded-xl bg-gradient-to-br shadow-lg transition-all duration-500 ease-out group-hover:shadow-2xl group-hover:scale-125 group-hover:rotate-3", error ? "from-red-100 to-red-200 dark:from-red-900/30 dark:to-red-800/30" : gradient)}>
                        <div className={cn("transition-all duration-500 ease-out group-hover:scale-110", error ? "text-red-600 dark:text-red-400" : iconColor)}>
                            {isLoading ? (
                                // Show spinning loader when connecting
                                <Loader2 className="h-6 w-6 animate-spin" />
                            ) : (
                                // Show the normal icon with a slight rotation on hover
                                <div className="transition-transform duration-300 group-hover:rotate-12">
                                    {icon}
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* Text content area with title and description */}
                    <div className="flex-1 min-w-0">
                        {/* Main title of the storage service */}
                        <h3 className={cn("font-semibold transition-all duration-500 ease-out group-hover:translate-x-1", 
                            error 
                                ? "text-red-700 dark:text-red-300 group-hover:text-red-600 dark:group-hover:text-red-400"  // Red colors for errors
                                : "text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400"  // Normal colors
                        )}>
                            {label}
                        </h3>
                        
                        {/* Description text that changes based on the card's state */}
                        <p className={cn("text-sm mt-2 transition-all duration-500 ease-out group-hover:translate-x-1",
                            error 
                                ? "text-red-600 dark:text-red-400 group-hover:text-red-700 dark:group-hover:text-red-300"  // Red colors for errors
                                : disabled
                                    ? "text-slate-400 dark:text-slate-500"  // Grayed out when disabled
                                    : "text-slate-600 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300"  // Normal colors
                        )}>
                            {isLoading ? (
                                // Show connecting message with animated dots
                                <span className="flex items-center gap-2">
                                    {type === "local" ? (<span className="animate-pulse">Opening</span> ): (<span className="animate-pulse">Connecting</span>)}
                                    {/* Three dots that bounce one after another */}
                                    <span className="flex gap-1">
                                        <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" />
                                        <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                                        <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                                    </span>
                                </span>
                            ) : disabled ? (
                                // Show disabled message
                                <span className="flex items-center gap-2">
                                    <span>Please wait for current connection</span>
                                </span>
                            ) : error ? (
                                // Show error message with retry instruction
                                <span className="flex flex-col gap-4">
                                    <span>⚠️ {error}</span>
                                    <span className="text-xs opacity-75">Click to retry</span>
                                </span>
                            ) : description}  {/* Show normal description */}
                        </p>
                    </div>
                </div>
            </div>
            
            {/* 
                Animated bottom border that grows from left to right on hover
                Creates a nice visual feedback effect
            */}
            <div className={cn("absolute bottom-0 left-0 w-0 h-1 bg-gradient-to-r transition-all duration-700 ease-out", 
                error 
                    ? "from-red-500 via-red-600 to-red-700 group-hover:w-full"  // Red gradient for errors
                    : "from-blue-500 via-indigo-500 to-purple-500 group-hover:w-full"  // Normal blue gradient
            )} />
            {/* Second border layer for extra visual depth */}
            <div className={cn("absolute bottom-0 left-0 w-0 h-0.5 opacity-0 bg-gradient-to-r transition-all duration-1000 ease-out delay-200", 
                error 
                    ? "from-red-400 via-red-500 to-red-600 group-hover:opacity-100 group-hover:w-full" 
                    : "from-blue-400 via-indigo-400 to-purple-400 group-hover:opacity-100 group-hover:w-full"
            )} />
        </div>
    );
}

/**
 * Main StorageWideWindow Component
 * 
 * This is the main container that holds everything.
 * It manages:
 * - Whether the panel is open or closed
 * - Which services are currently connecting
 * - Error messages for each service
 * - Account selection when multiple accounts exist
 * - Canceling connections when needed
 */
const StorageWideWindow = ({show, addStorage, onAccountDeleted}: StorageWideWindowProps) => {
    // State for showing the account selection popup
    const [showAccountPopup, setShowAccountPopup] = useState<boolean>(false);
    
    // Which cloud service the user clicked on (Google, Dropbox, etc.)
    const [toAddCloudType, setToAddCloudType] = useState<CloudType | null>(null); 
    
    // Which specific account was selected (when user has multiple accounts)
    const [toAddAccount, setToAddAccount] = useState<string | null>(null);
    
    // List of accounts available for the selected cloud service
    const [availableAccounts, setAvailableAccounts] = useState<string[]>([]);
    
    /* 
        Tracks which services are currently trying to connect
        Each service can be true (connecting) or false (not connecting)
    */
    const [loadingStates, setLoadingStates] = useState<{[key: string]: boolean}>({
        google: false,    // Is Google Drive connecting?
        dropbox: false,   // Is Dropbox connecting?
        onedrive: false,  // Is OneDrive connecting?
        local: false      // Is local file system connecting?
    });
    
    /* 
        Stores error messages for each service
        Each service can have null (no error) or a string (error message)
    */
    const [errorStates, setErrorStates] = useState<{[key: string]: string | null}>({
        google: null,     // Google Drive error message
        dropbox: null,    // Dropbox error message
        onedrive: null,   // OneDrive error message
        local: null       // Local file system error message
    });
    
    // Are we currently in the process of canceling connections?
    const [isCancellingConnections, setIsCancellingConnections] = useState<boolean>(false);

    /**
     * Helper function to check if any service is currently connecting
     * 
     * We use this to:
     * - Prevent starting multiple connections at once
     * - Show appropriate messages to the user
     * - Disable other cards when one is connecting
     * 
     * Returns true if ANY service is connecting, false if none are
     */
    const isAnyServiceConnecting = () => {
        return Object.values(loadingStates).some(isLoading => isLoading);
    };

    /**
     * This runs when the user has selected an account or connected a new one
     * 
     * It's like the final step where we actually add the storage to the app
     * Based on what type of service it is, we call addStorage with the right information
     */
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
                            "cloud",                                    // Type of storage
                            `Google Driven`,                           // Display name
                            <FaGoogleDrive className="h-6 w-6" />,     // Icon to show
                            CloudType.GoogleDrive,                     // Which cloud service
                            toAddAccount                               // Account identifier
                        );
                        break;
                    case CloudType.Dropbox:
                        console.log("Dropbox account connected:", toAddAccount);
                        addStorage(
                            "cloud",
                            `Dropbox`,
                            <FaDropbox className="h-6 w-6" />,
                            CloudType.Dropbox,
                            toAddAccount
                        );
                        break;
                    case CloudType.OneDrive:
                        console.log("OneDrive account connected:", toAddAccount);
                        addStorage(
                            "cloud",
                            `OneDrive`,
                            <TbBrandOnedrive className="h-6 w-6" />,
                            CloudType.OneDrive,
                            toAddAccount
                        ); 
                        break;
                    case null:
                        // null means local file system (not a cloud service)
                        console.log("Local account connected:", toAddAccount);
                        addStorage(
                            "local",                                   // Type is local, not cloud
                            `Local File Directory`,                   // Display name
                            <HardDrive className="h-6 w-6" />,        // Hard drive icon
                        ); 
                        break;
                    default:
                        console.log("No account connected");
                }

                // Clear the selected account so this doesn't run again
                setToAddAccount(null);
            } else {
                console.log("No account selected");
            }
        };

        fetchData();
    }, [toAddAccount]);  // This runs whenever toAddAccount changes

    /**
     * Cancels all active cloud authentication processes
     * 
     * This is called when:
     * - The user closes the panel while connections are happening
     * - The component is being destroyed/unmounted
     * - We need to clean up for any reason
     * 
     * It goes through each service and tells it to stop trying to connect
     */
    const cancelAllConnections = async () => {
        console.log('Cancelling all active connections...');
        setIsCancellingConnections(true);
        
        // Array to store all the cancel operations
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
        
        /* 
            Reset all states back to normal after cancellation
            This makes sure no cards show as loading or have errors
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

    /**
     * This watches for changes in window visibility and popup state
     * 
     * When the user closes the panel or popup:
     * - If connections are active, cancel them
     * - If no connections active, just reset the loading states
     * - Clear errors only when fully closing the panel
     */
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
     * Cleanup when the component is being destroyed
     * 
     * This is like a safety net - if the component gets removed from the screen
     * while connections are still happening, we make sure to cancel them properly
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
     * Helper functions for managing errors
     * These make it easier to clear and set error messages
     */
    
    // Remove any error message for a specific service
    const clearError = (service: string) => {
        setErrorStates(prev => ({ ...prev, [service]: null }));
    };

    // Set an error message for a specific service
    const setError = (service: string, message: string) => {
        setErrorStates(prev => ({ ...prev, [service]: message }));
    };

    /**
     * Converts technical error messages into friendly messages users can understand
     * 
     * Instead of showing "Error: XMLHttpRequest failed with status 404"
     * We show "Connection failed" which is much clearer
     */
    const getUserFriendlyError = (error: any): string => {
        // Handle string errors
        if (typeof error === 'string') {
            if (error.includes('cancelled')) return 'Authentication cancelled';
            if (error.includes('network') || error.includes('timeout')) return 'Connection failed';
            if (error.includes('Authentication failed')) return 'Authentication failed';
            return 'Connection failed';
        }
        
        // Handle error objects with message property
        if (error?.message) {
            if (error.message.includes('cancelled')) return 'Authentication cancelled';
            if (error.message.includes('network') || error.message.includes('timeout')) return 'Connection failed';
            if (error.message.includes('Authentication failed')) return 'Authentication failed';
            return 'Connection failed';
        }
        
        // Default fallback
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
        // Reset Google Drive to not loading and clear any errors
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

    // Cancel local file system connection (much simpler since no authentication needed)
    const handleCancelLocal = () => {
        console.log('Cancelling Local connection');
        setLoadingStates(prev => ({ ...prev, local: false }));
        clearError('local');
    };

    /**
     * Google Drive connection handler
     * 
     * This runs when someone clicks the Google Drive card.
     * Here's what it does step by step:
     * 1. Check if another service is already connecting (if so, stop)
     * 2. Clear any old error messages
     * 3. Show loading state
     * 4. Check if user already has Google Drive accounts connected
     * 5. If yes, show account selection popup
     * 6. If no, start new account connection process
     */
    const handleGoogleClick = async () => {
        // Don't allow multiple connections at once
        if (isAnyServiceConnecting()) {
            console.log('Another service is already connecting, please wait...');
            return;
        }

        console.log('google drive clicked')

        // Clear any previous errors and start loading
        clearError('google');
        setLoadingStates(prev => ({ ...prev, google: true }));
        setToAddCloudType(CloudType.GoogleDrive);
        
        try {
            // Ask the system for existing Google Drive accounts
            const accountIds: Array<string> = await (window as any).cloudFsApi.getConnectedCloudAccounts(CloudType.GoogleDrive);
            console.log('accountIds: ', accountIds);

            if (accountIds && accountIds.length > 0) {
                // User has accounts already - let them choose which one
                console.log('Google Drive account already connected');
                setAvailableAccounts(accountIds);
                setShowAccountPopup(true);
            } else {
                // No existing accounts - connect a new one
                console.log('Google Drive account not connected, connecting...');
                try {
                    await connectNewCloudAccount(CloudType.GoogleDrive);
                } catch (error) {
                    console.log('Google Drive connection cancelled or failed');
                }
            }
        } catch (error: any) {
            // Something went wrong - show user-friendly error
            console.error('Google Drive error:', error);
            setError('google', getUserFriendlyError(error));
        } finally {
            // Always stop the loading state after a short delay
            setTimeout(() => {
                setLoadingStates(prev => ({ ...prev, google: false }));
            }, 200);
        }
    }

    /**
     * Dropbox connection handler
     * 
     * Works exactly like Google Drive but for Dropbox accounts
     * The flow is identical: check existing accounts, show popup or connect new
     */
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
            // Small delay to make the loading feel more natural
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

    /**
     * OneDrive connection handler
     * 
     * Same pattern as Google Drive and Dropbox
     */
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

    /**
     * Local directory handler
     * 
     * This is much simpler than cloud services because there's no authentication needed.
     * When someone clicks "Local Drive", we just directly add it as a storage option.
     */
    const handleLocalClicked = async () => {
        if (isAnyServiceConnecting()) {
            console.log('Another service is already connecting, please wait...');
            return;
        }

        console.log('local clicked')

        clearError('local');
        setLoadingStates(prev => ({ ...prev, local: true }));
        setToAddCloudType(null);  // null means local (not a cloud service)
        
        try {
            // Small delay to show the loading animation
            await new Promise(resolve => setTimeout(resolve, 300));
            // Set the account to "local" which will trigger the useEffect above
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
     * Starts the process to connect a new cloud account
     * 
     * This function:
     * 1. Calls the system to start OAuth authentication (opens browser)
     * 2. Waits for user to complete authentication
     * 3. Gets back an account ID if successful
     * 4. Sets that account ID which triggers adding it to storage
     * 
     * If anything goes wrong, it throws an error that the calling function handles
     */
    const connectNewCloudAccount = async (cloudType: CloudType) => {
        try {
            // This opens a browser window for the user to log in
            const accountId = await (window as any).cloudFsApi.connectNewCloudAccount(cloudType);
            // If we get here, authentication was successful
            setToAddAccount(accountId);
        } catch (error: any) {
            console.error(`${cloudType} authentication error:`, error);
            // Only show error if it wasn't a user cancellation
            if (!error.message?.includes('cancelled') && !error.message?.includes('aborted')) {
                const serviceName = cloudType.toLowerCase();
                setError(serviceName, getUserFriendlyError(error));
            }
            throw error;  // Re-throw so calling function knows it failed
        }
    }

    /**
     * Handles when a user deletes an account from the popup
     * 
     * When a user has multiple accounts and decides to remove one:
     * 1. Update our local list to remove that account
     * 2. Tell the parent component about the deletion
     */
    const handleAccountDeleted = async (cloudType: CloudType, accountId: string) => {
        console.log(`Account ${accountId} deleted for ${cloudType}, refreshing available accounts...`)
        // Remove the deleted account from our local list
        setAvailableAccounts(prev => prev.filter(account => account !== accountId))
        
        // Tell the parent component so it can update its storage list
        if (onAccountDeleted) {
            onAccountDeleted(cloudType, accountId)
        }
    }

    // Main component render - this is what the user actually sees
    return (
        <div
            className={`${
                show ? "w-72" : "w-0"  // Panel is either 288px wide or 0px wide
            } select-none absolute left-0 top-0 h-full z-30 bg-white/95 dark:bg-slate-900/95 border-r border-slate-200 dark:border-slate-700 shadow-2xl transition-all duration-300 ease-out overflow-hidden backdrop-blur-lg`}
        >
            {/* Content container that slides in/out with the panel */}
            <div className={`h-full flex flex-col transition-all duration-300 ease-out ${
                show ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"  // Fade and slide animation
            }`}>
                {/* Header section with title and description */}
                <div className="p-6 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-blue-900/10 dark:to-indigo-900/10">
                    <div className="flex items-center gap-3 mb-2">
                        {/* Animated cloud icon */}
                        <div className="p-3 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 shadow-lg hover:shadow-xl transition-all duration-500 hover:scale-110 hover:rotate-6">
                            <CloudIcon className="h-6 w-6 text-blue-600 dark:text-blue-400 transition-all duration-500 hover:scale-110" />
                        </div>
                        <div>
                            {/* Main title with gradient text effect */}
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
                
                {/* Main content area with all the storage cards */}
                <div className="flex-1 p-6 space-y-4 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 scrollbar-track-transparent hover:scrollbar-thumb-slate-400 dark:hover:scrollbar-thumb-slate-500 transition-all duration-300">
                    <div className="space-y-4">
                        {/* Local file system storage card */}
                        <StorageCard
                            icon={<HardDrive className="h-6 w-6" />}
                            label="Local Drive"
                            description="Access local files and folders"
                            onClick={() => handleLocalClicked()}
                            gradient="from-slate-50 to-gray-50 dark:from-slate-800/50 dark:to-slate-700/50"
                            iconColor="text-slate-600 dark:text-slate-400"
                            isLoading={loadingStates.local}
                            disabled={isAnyServiceConnecting() && !loadingStates.local}  // Disabled if another service is connecting
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
                
                {/* Footer section with status information */}
                <div className="select-none p-6 border-t border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-50/50 to-gray-50/50 dark:from-slate-800/50 dark:to-slate-700/50">
                    {/* Animated dots for visual appeal */}
                    <div className="flex items-center justify-center gap-2 mb-3">
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                        <div className="w-1 h-1 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                    </div>
                    {/* Status message that changes based on what's happening */}
                    <p className="text-xs text-slate-500 dark:text-slate-400 text-center transition-all duration-500 hover:text-slate-600 dark:hover:text-slate-300 font-medium">
                        {isCancellingConnections 
                            ? "Cancelling active connections..." 
                            : isAnyServiceConnecting() 
                                ? "Connection in progress..." 
                                : "Choose a storage provider to get started"
                        }
                    </p>
                    {/* Decorative gradient line */}
                    <div className="mt-2 w-16 h-0.5 bg-gradient-to-r from-blue-400 to-purple-400 mx-auto rounded-full opacity-50" />
                </div>
            </div>

            {/* 
                Account selection popup modal
                This appears when a user has multiple accounts for a service
                It lets them pick which account to use or connect a new one
            */}
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