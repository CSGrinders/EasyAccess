/**
 * FileStatsDialog Component
 * 
 * A dialog component that displays detailed information about selected files and folders.
 * Shows file size, modification time, location, and other metadata.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Calendar,
    Clock,
    Database,
    File,
    FolderIcon,
    HardDrive,
    RefreshCw,
    Loader2,
    ChevronLeft,
    ChevronRight,
    X
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
    /** The files/folders to show stats for - can be single item or array */
    selectedFiles: FileSystemItem[] | FileSystemItem | null;
    /** Cloud type if this is a cloud file */
    cloudType?: CloudType;
    /** Account ID if this is a cloud file */
    accountId?: string;
    /** Callback when files list changes (for tab closing) */
    onFilesChange?: (files: FileSystemItem[]) => void;
}

export const FileStatsDialog: React.FC<FileStatsDialogProps> = ({
    isOpen,
    onOpenChange,
    selectedFiles,
    cloudType,
    onFilesChange}) => {
    
    // Convert selectedFiles to array 
    const fileList = React.useMemo(() => {
        if (!selectedFiles) return [];
        return Array.isArray(selectedFiles) ? selectedFiles : [selectedFiles];
    }, [selectedFiles]);

    // Current active tab index
    const [activeTabIndex, setActiveTabIndex] = useState(0);
    const [folderSizes, setFolderSizes] = useState<Map<string, number>>(new Map());
    const [calculatingPaths, setCalculatingPaths] = useState<Set<string>>(new Set());
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    // Get current active file
    const currentFile = fileList[activeTabIndex] || null;

    // Check scroll state
    const updateScrollState = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        setCanScrollLeft(container.scrollLeft > 0);
        setCanScrollRight(
            container.scrollLeft < container.scrollWidth - container.clientWidth
        );
    }, []);

    /** Formats file size in standard format */
    const formatFileSize = useCallback((bytes?: number): string => {
        if (!bytes || bytes === 0) return "0 B";

        const sizes = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(1000));
        const size = bytes / Math.pow(1000, i);

        return `${size.toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
    }, []);

    /** Gets the size display  */
    const getItemSize = useCallback(() => {
        if (!currentFile) return "Unknown";

        // For directories, check if we have a calculated size first
        if (currentFile.isDirectory) {
            const calculatedSize = folderSizes.get(currentFile.path);
            if (calculatedSize !== undefined) {
                return formatFileSize(calculatedSize);
            }
            // If we're calculating, show a loading state
            if (calculatingPaths.has(currentFile.path)) {
                return "Calculating...";
            }
            return currentFile.size ? formatFileSize(currentFile.size) : "Unknown";
        }
        // For files, just use the item size
        return formatFileSize(currentFile.size);
    }, [currentFile, folderSizes, calculatingPaths, formatFileSize]);

    /** Trigger folder size calculation */
    const triggerFolderSizeCalculation = useCallback(async () => {
        if (!currentFile?.isDirectory || cloudType || calculatingPaths.has(currentFile.path)) {
            return;
        }

        setCalculatingPaths(prev => new Set(prev).add(currentFile.path));
        try {
            const size = await window.fsApi.calculateFolderSize(currentFile.path);
            setFolderSizes(prev => new Map(prev).set(currentFile.path, size));
        } catch (error) {
            console.error('Error calculating folder size:', error);
        } finally {
            setCalculatingPaths(prev => {
                const newSet = new Set(prev);
                newSet.delete(currentFile.path);
                return newSet;
            });
        }
    }, [currentFile, cloudType, calculatingPaths]);

    // Update scroll state when tabs change or container is resized
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        updateScrollState();

        const handleScroll = () => updateScrollState();
        container.addEventListener('scroll', handleScroll);
        
        const observer = new ResizeObserver(updateScrollState);
        observer.observe(container);

        return () => {
            container.removeEventListener('scroll', handleScroll);
            observer.disconnect();
        };
    }, [fileList, updateScrollState]);

    // Reset active tab when files change
    useEffect(() => {
        setActiveTabIndex(0);
        setFolderSizes(new Map());
        setCalculatingPaths(new Set());
    }, [selectedFiles]);

    // Calculate folder size for current file if it's a directory 
    useEffect(() => {
        if (!isOpen || !currentFile?.isDirectory || cloudType) {
            return;
        }

        if (folderSizes.has(currentFile.path) || calculatingPaths.has(currentFile.path)) {
            return;
        }

        const calculateSize = async () => {
            setCalculatingPaths(prev => new Set(prev).add(currentFile.path));
            try {
                const size = await window.fsApi.calculateFolderSize(currentFile.path);
                setFolderSizes(prev => new Map(prev).set(currentFile.path, size));
            } catch (error) {
                console.error('Error calculating folder size:', error);
                setCalculatingPaths(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(currentFile.path);
                    return newSet;
                });
            } finally {
                setCalculatingPaths(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(currentFile.path);
                    return newSet;
                });
            }
        };

        calculateSize();
    }, [isOpen, currentFile, cloudType, folderSizes, calculatingPaths]);

    // Keyboard navigation
    useEffect(() => {
        if (!isOpen || fileList.length <= 1) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Only handle arrow keys when the dialog is open and not typing in inputs
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            if (e.key === 'ArrowLeft' && activeTabIndex > 0) {
                e.preventDefault();
                setActiveTabIndex(prev => prev - 1);
            } else if (e.key === 'ArrowRight' && activeTabIndex < fileList.length - 1) {
                e.preventDefault();
                setActiveTabIndex(prev => prev + 1);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, activeTabIndex, fileList.length]);

    // Scroll active tab into view and center it
    const scrollToActiveTab = useCallback((index: number) => {
        const container = scrollContainerRef.current;
        if (!container) return;

        // Find the tab container 
        const tabContainer = container.querySelector('.flex.gap-1\\.5') as HTMLElement;
        if (!tabContainer) return;

        const tabElement = tabContainer.children[index] as HTMLElement;
        if (tabElement) {
            // Always center the active tab
            const containerCenter = container.clientWidth / 2;
            const tabCenter = tabElement.offsetLeft + tabElement.clientWidth / 2;
            const scrollPosition = tabCenter - containerCenter;
        
            const maxScroll = container.scrollWidth - container.clientWidth;
            const finalScrollPosition = Math.max(0, Math.min(scrollPosition, maxScroll));
            
            container.scrollTo({
                left: finalScrollPosition,
                behavior: 'smooth'
            });
        }
    }, []);

    useEffect(() => {
        scrollToActiveTab(activeTabIndex);
    }, [activeTabIndex, scrollToActiveTab]);

    // Early return if dialog is not open 
    if (!isOpen) {
        return (
            <Dialog open={isOpen} onOpenChange={onOpenChange}>
                <DialogContent className="hidden">
                </DialogContent>
            </Dialog>
        );
    }

    // Early return if no files are selected
    if (!fileList.length) {
        return (
            <Dialog open={isOpen} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl">
                    <div className="p-4 text-center">
                        <p className="text-slate-600 dark:text-slate-400">No files selected</p>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    const item = currentFile;
    
    
    if (!item) {
        return (
            <Dialog open={isOpen} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl">
                    <div className="p-4 text-center">
                        <p className="text-slate-600 dark:text-slate-400">File not found</p>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }
    
    const IconComponent = getFileIcon(item.name, item.isDirectory);
    const iconColor = getIconColor(item.name, item.isDirectory);

    /** Extracts file extension from filename */
    const getFileExtension = (fileName: string) => {
        const ext = fileName.split('.').pop();
        return ext && ext !== fileName ? ext.toUpperCase() : 'Unknown';
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
            <DialogContent className="w-full sm:max-w-lg md:max-w-2xl lg:max-w-3xl xl:max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col"
            >
                {/* Tab Navigation - only show if multiple files */}
                {fileList.length > 1 && (
                    <div className="select-none border-b border-slate-200 dark:border-slate-700 px-6 pt-6 pb-0 flex-shrink-0">
                        <div className="flex items-center gap-2">
                            {/* Left navigation button */}
                            <button
                                onClick={() => {
                                    if (activeTabIndex > 0) {
                                        setActiveTabIndex(prev => prev - 1);
                                    }
                                }}
                                className={cn(
                                    "flex-shrink-0 p-1.5 rounded-md transition-all duration-200",
                                    activeTabIndex > 0
                                        ? "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 opacity-100"
                                        : "text-slate-300 dark:text-slate-600 opacity-50 cursor-not-allowed"
                                )}
                                disabled={activeTabIndex === 0}
                                title="Previous file (←)"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>

                            {/* Scrollable tabs container */}
                            <div 
                                ref={scrollContainerRef}
                                className="flex-1 overflow-x-auto scrollbar-hide file-stats-scroll-container"
                                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                            >
                                <div className="flex gap-1.5 min-w-max py-3 px-3">
                                    {fileList.map((file, index) => {
                                        const FileIcon = getFileIcon(file.name, file.isDirectory);
                                        const fileIconColor = getIconColor(file.name, file.isDirectory);
                                        const isActive = index === activeTabIndex;
                                        
                                        return (
                                            <button
                                                key={file.path}
                                                onClick={() => setActiveTabIndex(index)}
                                                className={cn(
                                                    "file-stats-tab flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 max-w-[200px] group select-none focus:outline-none",
                                                    isActive
                                                        ? "active bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700"
                                                        : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                                                )}
                                            >
                                                <FileIcon className={cn("h-4 w-4 flex-shrink-0", 
                                                    isActive ? "text-blue-600 dark:text-blue-400" : fileIconColor
                                                )} />
                                                <span className="truncate min-w-0">{file.name}</span>
                                                {fileList.length > 1 && (
                                                    <X 
                                                        className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity ml-1 flex-shrink-0"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const newFileList = fileList.filter((_, i) => i !== index);
                                                            if (newFileList.length === 0) {
                                                                onOpenChange(false);
                                                            } else {
                                                                // Adjust active tab if needed
                                                                if (index === activeTabIndex && index >= newFileList.length) {
                                                                    setActiveTabIndex(newFileList.length - 1);
                                                                } else if (index < activeTabIndex) {
                                                                    setActiveTabIndex(activeTabIndex - 1);
                                                                }
                                                                // Notify parent component of file list change
                                                                onFilesChange?.(newFileList);
                                                            }
                                                        }}
                                                    />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Right navigation button */}
                            <button
                                onClick={() => {
                                    if (activeTabIndex < fileList.length - 1) {
                                        setActiveTabIndex(prev => prev + 1);
                                    }
                                }}
                                className={cn(
                                    "flex-shrink-0 p-1.5 rounded-md transition-all duration-200",
                                    activeTabIndex < fileList.length - 1
                                        ? "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 opacity-100"
                                        : "text-slate-300 dark:text-slate-600 opacity-50 cursor-not-allowed"
                                )}
                                disabled={activeTabIndex === fileList.length - 1}
                                title="Next file (→)"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                        
                        {/* Keyboard navigation hint */}
                        <div className="flex justify-center mt-1 mb-2">
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                Use ← → arrow keys to navigate
                            </p>
                        </div>
                    </div>
                )}

                {/* Scrollable content area - contained within dialog bounds */}
                <div className="flex-1 w-full overflow-y-auto overflow-x-hidden min-h-0">
                    <DialogHeader className="space-y-4 px-6 pt-6 pb-4">
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
                                    {fileList.length > 1 && (
                                        <span className="ml-2 text-xs bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded-full">
                                            {activeTabIndex + 1} of {fileList.length}
                                        </span>
                                    )}
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>
                
                    <div className="space-y-6 pt-2 px-6 pb-6">
                        {/* Quick Stats Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            <div 
                                className={cn(
                                    "relative bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 rounded-xl p-4 border border-blue-200 dark:border-blue-700/50 overflow-hidden",
                                    item.isDirectory && !cloudType && !folderSizes.has(item.path) && !calculatingPaths.has(item.path)
                                        ? "cursor-pointer hover:from-blue-100 hover:to-blue-200 dark:hover:from-blue-900/40 dark:hover:to-blue-800/40 transition-all duration-200"
                                        : ""
                                )}
                                onClick={() => {
                                    if (item.isDirectory && !cloudType && !folderSizes.has(item.path) && !calculatingPaths.has(item.path)) {
                                        triggerFolderSizeCalculation();
                                    }
                                }}
                            >
                                <div className="flex items-center gap-3 relative z-10">
                                    <div className="p-2 bg-blue-500/20 rounded-lg flex-shrink-0">
                                        <HardDrive className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                    </div>

                                    {/* File Size */}
                                    <div className="flex-1 min-w-0">
                                        <p className="select-none text-sm font-medium text-blue-900 dark:text-blue-100">Size</p>
                                        <div className="flex items-center gap-2">
                                            <p className="text-lg font-bold text-blue-800 dark:text-blue-200 truncate">
                                                {getItemSize()}
                                            </p>
                                            {item.isDirectory && calculatingPaths.has(item.path) && (
                                                <div className="flex-shrink-0">
                                                    <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* File Timestamp */}
                            <div className="bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-900/30 dark:to-emerald-800/30 rounded-xl p-4 border border-green-200 dark:border-green-700/50 overflow-hidden">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-green-500/20 rounded-lg flex-shrink-0">
                                        <Clock className="h-5 w-5 text-green-600 dark:text-green-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="select-none text-sm font-medium text-green-900 dark:text-green-100">Modified</p>
                                        <p className="text-sm font-semibold text-green-800 dark:text-green-200 truncate">
                                            {getRelativeTime(item.modifiedTime)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* File Information */}
                        <div className="space-y-4 overflow-hidden">
                            <h3 className="select-none text-lg font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700 pb-2">
                                Details
                            </h3>
                            
                            {/* Name */}
                            <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg overflow-hidden">
                                <File className="h-5 w-5 text-slate-500 dark:text-slate-400 mt-0.5 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="select-none text-sm font-medium text-slate-700 dark:text-slate-300">Name</p>
                                    <p className="text-sm text-slate-600 dark:text-slate-400 break-all mt-1">
                                        {item.name}
                                    </p>
                                </div>
                            </div>

                            {/* Location */}
                            <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg overflow-hidden">
                                <FolderIcon className="h-5 w-5 text-slate-500 dark:text-slate-400 mt-0.5 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="select-none text-sm font-medium text-slate-700 dark:text-slate-300">Location</p>
                                    <p className="text-sm text-slate-600 dark:text-slate-400 break-all mt-1 font-mono bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
                                        {item.path}
                                    </p>
                                </div>
                            </div>

                            {/* Full Date */}
                            {item.modifiedTime && (
                                <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg overflow-hidden">
                                    <Calendar className="h-5 w-5 text-slate-500 dark:text-slate-400 mt-0.5 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="select-none text-sm font-medium text-slate-700 dark:text-slate-300">Last Modified</p>
                                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                                            {formatDate(item.modifiedTime)}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Storage Source */}
                            <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg overflow-hidden">
                                <Database className="h-5 w-5 text-slate-500 dark:text-slate-400 mt-0.5 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="select-none text-sm font-medium text-slate-700 dark:text-slate-300">Storage</p>
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
                </div>
            </DialogContent>
        </Dialog>
    );
};