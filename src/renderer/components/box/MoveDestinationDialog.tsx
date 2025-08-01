/**
 * MoveDestinationDialog Component
 * 
 * A dialog that allows users to select a destination storage and path for moving files.
 * Similar to PopupAccounts but focuses on selecting destination for file operations.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CloudType } from "@Types/cloudType";
import { SendHorizontal, Folder, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/** Props for the MoveDestinationDialog component */
interface MoveDestinationDialogProps {
    /** Whether the dialog is open */
    open: boolean;
    /** Function to control dialog visibility */
    setOpen: (open: boolean) => void;
    /** Selected file paths to move */
    selectedFiles: string[];
    /** Source cloud type */
    sourceCloudType?: CloudType;
    /** Source account ID */
    sourceAccountId?: string;
    /** Function called when move operation is confirmed */
    onConfirm: (targetCloudType: CloudType | undefined, targetAccountId: string | undefined, targetPath: string, keepOriginal: boolean) => void;
    /** Function called when operation is cancelled */
    onCancel: () => void;
}

/** Available storage destination */
interface StorageDestination {
    type: 'local' | 'cloud';
    cloudType?: CloudType;
    accountId?: string;
    displayName: string;
    icon: React.ReactNode;
}

export function MoveDestinationDialog({
    open,
    setOpen,
    selectedFiles,
    sourceCloudType,
    sourceAccountId,
    onConfirm,
    onCancel
}: MoveDestinationDialogProps) {
    const [selectedDestination, setSelectedDestination] = useState<StorageDestination | null>(null);
    const [targetPath, setTargetPath] = useState<string>('/');
    const [keepOriginal, setKeepOriginal] = useState(false);
    const [availableDestinations, setAvailableDestinations] = useState<StorageDestination[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [pathSuggestions, setPathSuggestions] = useState<string[]>([]);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [dropdownPosition, setDropdownPosition] = useState<'below' | 'above'>('below');
    const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);

    /** Load available storage destinations */
    const loadAvailableDestinations = async () => {
        const destinations: StorageDestination[] = [];

        // Add local storage option
        destinations.push({
            type: 'local',
            displayName: 'Local Storage',
            icon: <Folder className="h-4 w-4 text-slate-600 dark:text-slate-400" />
        });

        // Load cloud storage accounts
        try {
            // Google Drive accounts
            const googleAccounts = await (window as any).cloudFsApi.getConnectedCloudAccounts(CloudType.GoogleDrive);
            if (googleAccounts && googleAccounts.length > 0) {
                googleAccounts.forEach((accountId: string) => {
                    destinations.push({
                        type: 'cloud',
                        cloudType: CloudType.GoogleDrive,
                        accountId,
                        displayName: `Google Drive (${accountId})`,
                        icon: <div className="w-4 h-4 bg-blue-500 rounded-sm"></div>
                    });
                });
            }

            // OneDrive accounts
            const onedriveAccounts = await (window as any).cloudFsApi.getConnectedCloudAccounts(CloudType.OneDrive);
            if (onedriveAccounts && onedriveAccounts.length > 0) {
                onedriveAccounts.forEach((accountId: string) => {
                    destinations.push({
                        type: 'cloud',
                        cloudType: CloudType.OneDrive,
                        accountId,
                        displayName: `OneDrive (${accountId})`,
                        icon: <div className="w-4 h-4 bg-blue-600 rounded-sm"></div>
                    });
                });
            }

            // Dropbox accounts
            const dropboxAccounts = await (window as any).cloudFsApi.getConnectedCloudAccounts(CloudType.Dropbox);
            if (dropboxAccounts && dropboxAccounts.length > 0) {
                dropboxAccounts.forEach((accountId: string) => {
                    destinations.push({
                        type: 'cloud',
                        cloudType: CloudType.Dropbox,
                        accountId,
                        displayName: `Dropbox (${accountId})`,
                        icon: <div className="w-4 h-4 bg-blue-700 rounded-sm"></div>
                    });
                });
            }
        } catch (error) {
            console.error('Error loading cloud accounts:', error);
        }

        setAvailableDestinations(destinations);
    };

    /** Load path suggestions for the selected destination */
    const loadPathSuggestions = async (destination: StorageDestination, currentPath: string) => {
        // For very short paths or root, provide common default suggestions
        if (!currentPath || currentPath.length <= 1) {
            if (destination.type === 'local') {
                setPathSuggestions([
                    '/',
                    '/Users',
                    '/Applications',
                    '/Documents',
                    '/Downloads',
                    '/Desktop'
                ]);
            } else {
                setPathSuggestions([
                    '/',
                    '/Documents',
                    '/Photos',
                    '/Shared'
                ]);
            }
            return;
        }

        setIsLoadingSuggestions(true);
        try {
            // Get the directory part of the input path
            const lastSlashIndex = currentPath.lastIndexOf('/');
            const dirPath = lastSlashIndex > 0 ? currentPath.substring(0, lastSlashIndex) : '/';
            const prefix = lastSlashIndex >= 0 ? currentPath.substring(lastSlashIndex + 1) : currentPath;

            // Skip if path contains invalid characters or hidden files
            if (dirPath.includes('.') && dirPath !== '/' && !dirPath.startsWith('/Users/')) {
                setPathSuggestions([]);
                return;
            }

            let directories: any[] = [];

            // Only try to read directory if it's a valid path
            if (destination.type === 'local') {
                try {
                    // Additional validation for local paths
                    if (dirPath === '/' || dirPath.startsWith('/Users/') || dirPath.startsWith('/Applications') || 
                        dirPath.startsWith('/Documents') || dirPath.startsWith('/Downloads')) {
                        directories = await window.fsApi.readDirectory(dirPath);
                    } else {
                        throw new Error('Invalid or restricted path');
                    }
                } catch (error) {
                    console.warn('Error reading local directory:', error);
                    // Fallback to user home directory suggestions
                    setPathSuggestions([
                        '/',
                        '/Users',
                        '/Applications',
                        '/Documents',
                        '/Downloads',
                        '/Desktop'
                    ]);
                    return;
                }
            } else if (destination.cloudType && destination.accountId) {
                try {
                    directories = await (window as any).cloudFsApi.readDirectory(destination.cloudType, destination.accountId, dirPath);
                } catch (error) {
                    console.warn('Error reading cloud directory:', error);
                    // Fallback to common cloud paths
                    setPathSuggestions([
                        '/',
                        '/Documents',
                        '/Photos',
                        '/Shared'
                    ]);
                    return;
                }
            }

            // Filter to only directories and match prefix
            const suggestions = directories
                .filter(item => 
                    item.isDirectory && 
                    item.name && 
                    !item.name.startsWith('.') && // Skip hidden files
                    item.name.toLowerCase().startsWith(prefix.toLowerCase())
                )
                .map(item => dirPath === '/' ? `/${item.name}` : `${dirPath}/${item.name}`)
                .slice(0, 8); // Limit to 8 suggestions for UI performance

            // Add the parent directory if we're not at root
            if (dirPath !== '/' && dirPath.length > 1) {
                suggestions.unshift(dirPath);
            }

            // Add current input as first option if it's not empty and valid
            if (currentPath !== '/' && currentPath.length > 1 && !suggestions.includes(currentPath)) {
                suggestions.unshift(currentPath);
            }

            setPathSuggestions(suggestions);
        } catch (error) {
            console.error('Error loading path suggestions:', error);
            // Provide fallback suggestions on any error
            if (destination.type === 'local') {
                setPathSuggestions([
                    '/',
                    '/Users',
                    '/Documents',
                    '/Downloads'
                ]);
            } else {
                setPathSuggestions([
                    '/',
                    '/Documents',
                    '/Photos'
                ]);
            }
        } finally {
            setIsLoadingSuggestions(false);
        }
    };

    useEffect(() => {
        if (open) {
            loadAvailableDestinations();
            setTargetPath('/');
            setKeepOriginal(false);
            setSelectedDestination(null);
            setPathSuggestions([]);
            setShowSuggestions(false);
        }
    }, [open]);

    // Debounced effect for path suggestions
    useEffect(() => {
        if (!selectedDestination) return;

        const debounceTimer = setTimeout(() => {
            loadPathSuggestions(selectedDestination, targetPath);
        }, 300); // 300ms delay

        return () => clearTimeout(debounceTimer);
    }, [selectedDestination, targetPath]);

    /** Handle destination selection */
    const handleDestinationSelect = (destination: StorageDestination) => {
        setSelectedDestination(destination);
        setTargetPath('/'); // Reset path when destination changes
        setShowSuggestions(true); // Show suggestions for new destination
    };

    /** Handle path input change */
    const handlePathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newPath = e.target.value;
        setTargetPath(newPath);
        setShowSuggestions(true);
        setSelectedSuggestionIndex(-1); // Reset selection when typing
    };

    /** Handle keyboard navigation in suggestions */
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!showSuggestions || pathSuggestions.length === 0) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedSuggestionIndex(prev => 
                    prev < pathSuggestions.length - 1 ? prev + 1 : 0
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedSuggestionIndex(prev => 
                    prev > 0 ? prev - 1 : pathSuggestions.length - 1
                );
                break;
            case 'Enter':
                e.preventDefault();
                if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < pathSuggestions.length) {
                    handleSuggestionSelect(pathSuggestions[selectedSuggestionIndex]);
                }
                break;
            case 'Escape':
                e.preventDefault();
                setShowSuggestions(false);
                setSelectedSuggestionIndex(-1);
                break;
        }
    };

    /** Handle path input focus */
    const handlePathFocus = () => {
        setShowSuggestions(true);
        // Check dropdown positioning
        if (inputRef.current) {
            const inputRect = inputRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - inputRect.bottom;
            const spaceAbove = inputRect.top;
            
            // If there's more space above and below is tight, position above
            setDropdownPosition(spaceBelow < 200 && spaceAbove > spaceBelow ? 'above' : 'below');
        }
    };

    /** Handle path input blur */
    const handlePathBlur = () => {
        // Delay hiding suggestions to allow clicks on suggestions
        setTimeout(() => setShowSuggestions(false), 200);
    };

    /** Handle suggestion selection */
    const handleSuggestionSelect = (suggestion: string) => {
        setTargetPath(suggestion);
        setShowSuggestions(false);
    };

    /** Handle confirming the move operation */
    const handleConfirm = async () => {
        if (!selectedDestination) {
            toast.error("Please select a destination");
            return;
        }

        if (!targetPath.trim()) {
            toast.error("Please enter a target path");
            return;
        }

        setIsLoading(true);
        try {
            await onConfirm(
                selectedDestination.cloudType,
                selectedDestination.accountId,
                targetPath.trim(),
                keepOriginal
            );
            setOpen(false);
        } catch (error) {
            console.error('Transfer operation failed:', error);
            toast.error("Transfer operation failed");
        } finally {
            setIsLoading(false);
        }
    };

    /** Handle cancelling the operation */
    const handleCancel = () => {
        onCancel();
        setOpen(false);
    };


    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-[700px] max-w-[95vw] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl h-[80vh] flex flex-col select-none">
                <DialogHeader className="space-y-3 pb-4 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30">
                            <Package className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                                Transfer Items
                            </DialogTitle>
                            <DialogDescription className="text-slate-600 dark:text-slate-400">
                                Select destination and path for {selectedFiles.length} item{selectedFiles.length > 1 ? 's' : ''}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="space-y-6 pb-6">
                    {/* Source Information */}
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
                        <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">
                            Source: {sourceCloudType || 'Local Storage'}
                            {sourceAccountId && ` (${sourceAccountId})`}
                        </h3>
                        <div className="text-xs text-slate-600 dark:text-slate-400">
                            {selectedFiles.length} item{selectedFiles.length > 1 ? 's' : ''} selected
                        </div>
                    </div>

                    {/* Destination Selection */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            Select Destination
                        </h3>
                        <div className="max-h-48 overflow-y-auto space-y-2">
                            {availableDestinations.map((destination, index) => (
                                <button
                                    key={index}
                                    onClick={() => handleDestinationSelect(destination)}
                                    className={cn(
                                        "w-full p-3 rounded-lg border transition-all duration-200 text-left",
                                        selectedDestination === destination
                                            ? "border-blue-500 dark:border-blue-400 bg-blue-100 dark:bg-blue-900/30"
                                            : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        {destination.icon}
                                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                            {destination.displayName}
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Path Input */}
                    {selectedDestination && (
                        <div className="space-y-3 relative">
                            <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                Target Path
                            </h3>
                            <div className="relative">
                                <Input
                                    ref={inputRef}
                                    type="text"
                                    placeholder="Enter destination path (e.g., /Documents/Projects)"
                                    value={targetPath}
                                    onChange={handlePathChange}
                                    onKeyDown={handleKeyDown}
                                    onFocus={handlePathFocus}
                                    onBlur={handlePathBlur}
                                    className="text-slate-800 dark:text-slate-200 placeholder:text-gray-500"
                                />
                                
                                {/* Loading indicator for suggestions */}
                                {isLoadingSuggestions && (
                                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                                        <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                )}
                            </div>
                            
                            {/* Autocomplete tooltip */}
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                                <span>Start typing to see directory suggestions. Use ↑↓ arrows to navigate, Enter to select.</span>
                            </div>
                            
                            {/* Suggestions dropdown */}
                            {showSuggestions && pathSuggestions.length > 0 && !isLoadingSuggestions && (
                                <div className={cn(
                                    "absolute z-[100] w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl max-h-48 overflow-y-auto",
                                    dropdownPosition === 'above' ? "bottom-full mb-1" : "top-full mt-1"
                                )}>
                                    {pathSuggestions.map((suggestion, index) => (
                                        <button
                                            key={index}
                                            onClick={() => handleSuggestionSelect(suggestion)}
                                            className={cn(
                                                "w-full px-3 py-2 text-left text-sm transition-colors first:rounded-t-lg last:rounded-b-lg border-none outline-none",
                                                selectedSuggestionIndex === index
                                                    ? "bg-blue-100 dark:bg-blue-900/30"
                                                    : "hover:bg-slate-100 dark:hover:bg-slate-700"
                                            )}
                                        >
                                            <div className="flex items-center gap-2">
                                                <Folder className="h-3 w-3 text-slate-400" />
                                                <span className="text-slate-700 dark:text-slate-300 truncate">
                                                    {suggestion}
                                                </span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                            
                            {/* Quick suggestion buttons (fallback when no dropdown suggestions) */}
                            {!showSuggestions && pathSuggestions.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {pathSuggestions.slice(0, 4).map((suggestion, index) => (
                                        <button
                                            key={index}
                                            onClick={() => handleSuggestionSelect(suggestion)}
                                            className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                                        >
                                            {suggestion}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <Button
                        variant="outline"
                        onClick={handleCancel}
                        disabled={isLoading}
                        className="text-slate-600 dark:text-slate-400"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={!selectedDestination || !targetPath.trim() || isLoading}
                        className="bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Processing...
                            </>
                        ) : (
                            <>
                                <SendHorizontal className="h-4 w-4" />
                                Transfer {selectedFiles.length} item{selectedFiles.length > 1 ? 's' : ''}
                            </>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
