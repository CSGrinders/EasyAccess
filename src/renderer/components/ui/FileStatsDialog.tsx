/**
 * FileStatsDialog Component
 * 
 * A dialog component that displays detailed information about selected files and folders.
 * Shows file size, modification time, location, and other metadata.
 */

import React, { useState, useEffect } from 'react';
import {
    Calendar,
    Clock,
    Database,
    File,
    FolderIcon,
    HardDrive,
    RefreshCw,
    Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { getFileIcon, getIconColor } from '@/components/ui/FileItem';
import type { FileSystemItem } from '@Types/fileSystem';
import type { CloudType } from '@Types/cloudType';

interface FileStatsDialogProps {
    /** Whether the dialog is open */
    isOpen: boolean;
    /** Function to control dialog visibility */
    onOpenChange: (open: boolean) => void;
    /** The file/folder to show stats for */
    selectedFile: FileSystemItem | null;
    /** Cloud type if this is a cloud file */
    cloudType?: CloudType;
    /** Account ID if this is a cloud file */
    accountId?: string;
}

export const FileStatsDialog: React.FC<FileStatsDialogProps> = ({
    isOpen,
    onOpenChange,
    selectedFile,
    cloudType}) => {
    
    /** State for folder size calculation */
    const [folderSize, setFolderSize] = useState<number | null>(null);
    const [isCalculatingSize, setIsCalculatingSize] = useState(false);

    /** Calculate folder size when dialog opens for a directory */
    useEffect(() => {
        if (!isOpen || !selectedFile?.isDirectory || cloudType) {
            // Reset folder size when dialog closes or if it's not a local directory
            setFolderSize(null);
            setIsCalculatingSize(false);
            return;
        }

        // Only calculate size for local directories
        const calculateSize = async () => {
            setIsCalculatingSize(true);
            try {
                const size = await window.fsApi.calculateFolderSize(selectedFile.path);
                setFolderSize(size);
            } catch (error) {
                console.error('Error calculating folder size:', error);
                setFolderSize(null);
            } finally {
                setIsCalculatingSize(false);
            }
        };

        calculateSize();
    }, [isOpen, selectedFile, cloudType]);

    // Early return if no file is selected
    if (!selectedFile) {
        return (
            <Dialog open={isOpen} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl">
                    <div className="p-4 text-center">
                        <p className="text-slate-600 dark:text-slate-400">No file selected</p>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    const item = selectedFile;
    const IconComponent = getFileIcon(item.name, item.isDirectory);
    const iconColor = getIconColor(item.name, item.isDirectory);

    /** Extracts file extension from filename */
    const getFileExtension = (fileName: string) => {
        const ext = fileName.split('.').pop();
        return ext && ext !== fileName ? ext.toUpperCase() : 'Unknown';
    };

    /** Formats file size in human-readable format */
    const formatFileSize = (bytes?: number): string => {
        if (!bytes || bytes === 0) return "0 B";

        const sizes = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(1000));
        const size = bytes / Math.pow(1000, i);

        return `${size.toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
    };

    /** Formats timestamp into readable date string */
    const formatDate = (timestamp?: number): string => {
        if (!timestamp) return "Unknown";

        const date = new Date(timestamp);
        return date.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    /** Gets the size display for files vs folders */
    const getItemSize = () => {
        if (item.isDirectory) {
            if (cloudType) {
                // Cloud directories don't have size calculation
                return "—";
            } else if (isCalculatingSize) {
                return (
                    <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Calculating...
                    </span>
                );
            } else if (folderSize !== null) {
                return formatFileSize(folderSize);
            } else {
                return "Unknown";
            }
        }
        return formatFileSize(item.size);
    };

    /** Converts timestamp to relative time format */
    const getRelativeTime = (timestamp?: number) => {
        if (!timestamp) return "Unknown";
        
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
        if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        return "Just now";
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            {/** Dialog content for file statistics */}
            <DialogContent className="max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl">
                <DialogHeader className="space-y-4">
                    <div className="flex items-center gap-4">
                        {/* Icon and title section */}
                        <div className="p-3 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-800 dark:to-slate-700">
                            <IconComponent className={cn("h-8 w-8", iconColor)} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <DialogTitle className="text-xl font-semibold text-slate-900 dark:text-slate-100 truncate">
                                {item.name}
                            </DialogTitle>
                            <DialogDescription className="text-slate-600 dark:text-slate-400 mt-1">
                                {item.isDirectory ? "Folder" : `${getFileExtension(item.name)} File`}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>
                
                <div className="space-y-6 pt-2">
                    {/* Quick Stats Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 rounded-xl p-4 border border-blue-200 dark:border-blue-700/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-500/20 rounded-lg">
                                    <HardDrive className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                </div>

                                {/* File Size */}
                                <div>
                                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Size</p>
                                    <p className="text-lg font-bold text-blue-800 dark:text-blue-200 flex items-center gap-2">
                                        {getItemSize()}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* File Timestamp */}
                        <div className="bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-900/30 dark:to-emerald-800/30 rounded-xl p-4 border border-green-200 dark:border-green-700/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-green-500/20 rounded-lg">
                                    <Clock className="h-5 w-5 text-green-600 dark:text-green-400" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-green-900 dark:text-green-100">Modified</p>
                                    <p className="text-sm font-semibold text-green-800 dark:text-green-200">
                                        {getRelativeTime(item.modifiedTime)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* File Information */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700 pb-2">
                            Details
                        </h3>
                        
                        {/* Name */}
                        <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                            <File className="h-5 w-5 text-slate-500 dark:text-slate-400 mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Name</p>
                                <p className="text-sm text-slate-600 dark:text-slate-400 break-all mt-1">
                                    {item.name}
                                </p>
                            </div>
                        </div>

                        {/* Location */}
                        <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                            <FolderIcon className="h-5 w-5 text-slate-500 dark:text-slate-400 mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Location</p>
                                <p className="text-sm text-slate-600 dark:text-slate-400 break-all mt-1 font-mono bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
                                    {item.path}
                                </p>
                            </div>
                        </div>

                        {/* Full Date */}
                        {item.modifiedTime && (
                            <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                                <Calendar className="h-5 w-5 text-slate-500 dark:text-slate-400 mt-0.5 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Last Modified</p>
                                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                                        {formatDate(item.modifiedTime)}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Storage Source */}
                        <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                            <Database className="h-5 w-5 text-slate-500 dark:text-slate-400 mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Storage</p>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={cn(
                                        "px-2 py-1 rounded-full text-xs font-medium",
                                        cloudType 
                                            ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300" 
                                            : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                                    )}>
                                        {cloudType ? `${cloudType} Cloud` : "Local Storage"}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
