/**
 * Accounts Dialog component 
 * 
 * Allows managing cloud storage accounts.
 * Allows users to view, select, delete, and add new accounts for a specific cloud provider.
 */

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CloudType } from "@Types/cloudType"
import { useState } from "react"
import { Trash2, User, Plus, Loader2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

/** Props for the PopupAccounts component */
type PopupAccountsProps = {
    open: boolean                                           // Whether the dialog is open or closed
    setOpen: (open: boolean) => void                        // Function to control dialog visibility
    setSelectedAccount: (account: string) => void           // Function to set the currently selected account 
    connectAddNewAccount: (cloudType: CloudType) => void    // Function to initiate adding a new account
    availableAccounts: string[]                             // List of currently connected accounts for the cloud type 
    cloudType: CloudType | null                             // The cloud type for which accounts are being managed   
    onAccountDeleted?:                                      // Callback when an account is deleted
    (cloudType: CloudType, accountId: string) => void 
}


export function PopupAccounts({
    open,                   // Whether the dialog is open
    setOpen,                // Function to control dialog visibility
    setSelectedAccount,     // Function to set the currently selected account
    availableAccounts,      // List of currently connected accounts
    connectAddNewAccount,   // Function to initiate adding a new account
    cloudType,              // The cloud type for which accounts are being managed
    onAccountDeleted        // Callback when an account is deleted
}: PopupAccountsProps) {

    /** Track which account is currently being deleted */
    const [deletingAccount, setDeletingAccount] = useState<string | null>(null)
    
    /** Track if new account connection is in progress */
    const [isConnecting, setIsConnecting] = useState(false)

    /** This function runs when someone clicks the delete button on an account */
    const handleDeleteAccount = async (accountId: string, e: React.MouseEvent) => {
        e.stopPropagation()
        
        // Make sure we know which cloud service we're working with
        if (!cloudType) {
            toast.error("Cloud type not specified.")
            return
        }

        setDeletingAccount(accountId)
        
        try {
            // Actually delete the account from the system
            const success = await (window as any).cloudFsApi.removeAccount(cloudType, accountId)
            
            if (success) {
                toast.success(`Account ${accountId} disconnected successfully.`)
                onAccountDeleted?.(cloudType, accountId)
            } else {
                toast.error("Failed to disconnect account.")
            }
        } catch (error) {
            console.error("Error removing account:", error)
            toast.error("Failed to disconnect account")
        } finally {
            setDeletingAccount(null)
        }
    }

    /** Initiates new account connection flow with error handling for user cancellation */
    const handleConnectNew = async () => {
        // Make sure we know which cloud service we're connecting to
        if (!cloudType) {
            toast.error("Cloud type not specified.")
            return
        }

        // Show that we're in the process of connecting
        setIsConnecting(true)
        try {
            // Start the connection process (this opens a browser tab)
            await connectAddNewAccount(cloudType)
        } catch (error: any) {
            console.error("Error connecting new account:", error)
            if (!error.message?.includes('cancelled') && !error.message?.includes('aborted')) {
                toast.error("Failed to connect new account")
            }
        } finally {
            setIsConnecting(false)
            setOpen(false)
        }
    }

    /**
     * Cancels ongoing authentication process
     */
    const handleCancel = async () => {
        // Make sure we know which service to cancel
        if (!cloudType) {
            return
        }

        console.log(`Cancelling ${getCloudTypeName(cloudType)} connection`)
        try {
            await (window as any).cloudFsApi.cancelAuthentication(cloudType)
        } catch (error) {
            console.error(`Error cancelling ${getCloudTypeName(cloudType)} authentication:`, error)
        }
        setIsConnecting(false)
    }

    /**  Maps CloudType enum to display names */
    const getCloudTypeName = (type: CloudType | null) => {
        switch (type) {
            case CloudType.GoogleDrive: return "Google Drive"
            case CloudType.OneDrive: return "OneDrive"
            case CloudType.Dropbox: return "Dropbox"
            default: return "Cloud"
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {/* The main content box of the popup */}
            <DialogContent className="sm:max-w-[500px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl max-h-[80vh] overflow-hidden">
                
                {/* Top section with title and description */}
                <DialogHeader className="space-y-3 pb-2">
                    <div className="flex items-center gap-3">
                        {/* User icon */}
                        <div className="p-2 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30">
                            <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>

                        {/* Title and description */}
                        <div>
                            <DialogTitle className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                                {getCloudTypeName(cloudType)} Accounts
                            </DialogTitle>
                            <DialogDescription className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                                Choose an account or connect a new one
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                {/* Scrollable accounts list container */}
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                    {/* Empty state when no accounts are connected */}
                    {availableAccounts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                            <div className="p-4 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
                                <User className="h-8 w-8 text-slate-400" />
                            </div>
                            <p className="text-slate-600 dark:text-slate-400 font-medium mb-1">
                                No accounts connected
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-500">
                                Connect your first {getCloudTypeName(cloudType)} account to get started
                            </p>
                        </div>
                    ) : (
                        /* Render list of connected accounts with interactive cards */
                        availableAccounts.map((account, index) => (
                            <div
                                key={account}
                                className={cn(
                                    "group relative overflow-hidden rounded-lg border bg-white dark:bg-slate-800 transition-all duration-300 ease-out",
                                    "hover:shadow-lg hover:shadow-blue-500/10 hover:border-blue-300 dark:hover:border-blue-600",
                                    "transform hover:scale-[1.02] active:scale-[0.98]",
                                    "border-slate-200 dark:border-slate-700",
                                    "animate-in fade-in-0 slide-in-from-bottom-2"
                                )}
                                style={{ animationDelay: `${index * 100}ms` }}
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-blue-900/10 dark:to-indigo-900/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                
                                {/* Account card content */}
                                <div className="relative flex items-center p-4">
                                    {/* Main account selection button */}
                                    <Button
                                        variant="ghost"
                                        className={cn(
                                            "flex-1 justify-start h-auto p-0 hover:bg-transparent",
                                            "text-slate-900 dark:text-slate-100 font-medium"
                                        )}
                                        onClick={() => {
                                            setSelectedAccount(account)
                                            setOpen(false)
                                        }}
                                    >
                                        <div className="flex items-center gap-3 w-full">
                                            {/* Account icon */}
                                            <div className="p-2 rounded-lg bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 group-hover:scale-110 transition-transform duration-300">
                                                <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                            </div>
                                            {/* Account details */}
                                            <div className="flex flex-col items-start">
                                                <span className="font-medium text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-300">
                                                    {account}
                                                </span>
                                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                                    Click to select this account
                                                </span>
                                            </div>
                                        </div>
                                    </Button>
                                    
                                    {/* Account deletion button */}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                            "h-8 w-8 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20",
                                            "opacity-0 group-hover:opacity-100 transition-all duration-300",
                                            "disabled:opacity-50 disabled:cursor-not-allowed"
                                        )}
                                        onClick={(e) => handleDeleteAccount(account, e)}
                                        disabled={deletingAccount === account}
                                    >
                                        {deletingAccount === account ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                                <div className="absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r from-blue-400 to-indigo-400 group-hover:w-full transition-all duration-700 ease-out" />
                            </div>
                        ))
                    )}

                    {/* Add new account section */}
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                        <div className="relative">
                            {/* Main connect new account button */}
                            <Button
                                variant="outline"
                                className={cn(
                                    "w-full h-12 border-2 border-dashed border-slate-300 dark:border-slate-600",
                                    "hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20",
                                    "text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400",
                                    "transition-all duration-300 group",
                                    "disabled:opacity-50 disabled:cursor-not-allowed"
                                )}
                                onClick={handleConnectNew}
                                disabled={isConnecting}
                            >
                                <div className="flex items-center gap-2">
                                    {isConnecting ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Plus className="h-4 w-4 group-hover:scale-110 transition-transform duration-300" />
                                    )}
                                    <span className="font-medium">
                                        {isConnecting ? "Connecting..." : `Connect New ${getCloudTypeName(cloudType)} Account`}
                                    </span>
                                </div>
                            </Button>
                            
                            {/* Cancel button overlay during connection */}
                            {isConnecting && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleCancel();
                                    }}
                                    className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-300/50 hover:border-red-400/70 transition-all duration-200 hover:scale-110 active:scale-95 group/cancel"
                                    title="Cancel connection"
                                >
                                    <X className="h-4 w-4 text-red-500 group-hover/cancel:text-red-600 transition-colors duration-200" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
