/**
 * FileExplorer Component
 * 
 * This is a file manager that shows files and folders like Windows Explorer or Mac Finder.
 * It can work with both files on your computer (local) and files in the cloud (Google Drive, Dropbox, etc.).
 */

import React, { useEffect, useState, useRef, useCallback, memo, use, useMemo, useImperativeHandle } from "react"
import {
    ChevronLeft,
    ChevronRight,
    Home,
    FolderIcon,
    FileIcon,
    ArrowUp,
    RefreshCw,
    Search,
    EyeOff,
    Eye,
    Copy,
    Trash,
    Move,
    FileText,
    FileImage,
    FileVideo,
    FileAudio,
    FileSpreadsheet,
    Archive,
    Settings,
    Database,
    BookOpen,
    Star,
    Download,
    Image,
    Music,
    Video,
    Lock,
    Zap,
    Cpu,
    Monitor,
    Palette,
    Code,
    Terminal,
    Globe,
    Mail,
    Calendar,
    Layers,
    Info,
    HardDrive,
    Clock,
    File,
    MoreHorizontal,
    FolderPlus,
    HelpCircle,
    Keyboard
} from "lucide-react"
import type { FileContent, FileSystemItem } from "@Types/fileSystem"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { CLOUD_HOME, CloudType } from "@Types/cloudType"
import { useBoxDrag } from "@/contexts/BoxDragContext";
import { useTransferState } from "@/contexts/TransferStateContext";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { FileItem, getFileIcon, getIconColor } from "@/components/ui/FileItem"
import { RendererIpcCommandDispatcher } from "@/services/AgentControlService"
import { FileStatsDialog } from "@/components/ui/FileStatsDialog"
import { MoveDestinationDialog } from "./MoveDestinationDialog"
import { randomInt } from "crypto"

/**
 * Props interface for the FileExplorer component
 */
interface FileExplorerProps {
    cloudType?: CloudType                                                                   // Cloud storage provider type 
    // (e.g., 'dropbox', 'google', 'onedrive')
    accountId?: string                                                                      // Unique identifier for the cloud account 
    zoomLevel: number                                                                       // Zoom level for the file explorer
    boxId: number                                                                           // Unique identifier for the box 
    isBoxToBoxTransfer?: boolean                                                            // Whether the transfer is between boxes
    refreshToggle?: boolean                                                                 // Toggle to refresh the file explorer
    silentRefresh?: boolean                                                                 // Whether to refresh silently without loading indicator
    onCurrentPathChange?: (currentPath: string) => void                                     // Callback when the current path changes
    /** Optional drag and drop transfer handler box */
    handleItemTransfer?: (filePaths: string[], sourceCloudType?: CloudType, sourceAccountId?: string, targetPath?: string, targetCloudType?: CloudType, targetAccountId?: string) => void
    deleteFileFromSource?: (fileInfo: any, keepOriginal?: boolean) => Promise<void>; 
}



export const FileExplorer = memo(
    React.forwardRef(FileExplorerInner),
);

function FileExplorerInner({
    zoomLevel,                  // How zoomed in the view is
    cloudType,                  // Cloud storage type (e.g., 'dropbox', 'google', 'onedrive')
    accountId,                  // Unique identifier for the cloud account
    boxId,                      // Unique identifier for the box
    isBoxToBoxTransfer = false, // Whether the transfer is between boxes
    refreshToggle,              // Toggle to refresh the file explorer
    silentRefresh = false,      // Whether to refresh silently without loading indicator
    onCurrentPathChange,         // Callback when the current path changes
    handleItemTransfer,  
    deleteFileFromSource, 
}: FileExplorerProps, 
    ref: React.Ref<{}>) {
   
    /** List of all files and folders in the current directory */                                               
    const [items, setItems] = useState<FileSystemItem[]>([])

    /** Current working directory - the folder we're currently looking at */
    const [cwd, setCwd] = useState<string>("")

    /** The current folder path split into parts (for breadcrumb navigation) */
    const [currentPath, setCurrentPath] = useState<string[]>([])

    /** History of folders we've visited (for back/forward navigation) */
    const [history, setHistory] = useState<string[]>([])

    /** Where we are in the history (for back/forward buttons) */
    const [historyIndex, setHistoryIndex] = useState(-1)

    /** What the user is searching for */
    const [searchQuery, setSearchQuery] = useState("")

    /** True when we're loading files from disk/cloud */
    const [isLoading, setIsLoading] = useState(true)

    /** Whether to show hidden files (files that start with a dot) */
    const [showHidden, setShowHidden] = useState(false)

    /** Selection State (which files are selected) */

    const selectedItemsRef = useRef<Set<string>>(new Set()) // Set of selected file IDs
    const lastSelectedItemRef = useRef<string | null>(null) // ID of the last selected file

    /** Drag selection state (selecting with mouse drag) */
    const isSelectingRef = useRef(false) // Whether we're currently selecting files with a drag box
    const selectionStartRef = useRef({ x: 0, y: 0 }) // Starting position of the selection box
    const selectionStartViewRef = useRef({ scrollTop: 0 }); // Starting scroll position of the container when selection started
    const selectionBoxRef = useRef<HTMLDivElement | null>(null); // Reference to the selection box element
    const isAdditiveDragRef = useRef(false); // Whether the current drag is additive (Ctrl/Cmd key pressed)
    const selectionSnapshotRef = useRef<Set<string>>(new Set()); // Snapshot of selected items at the start of a drag operation

    /** Drag and drop state */
    const dragStartPosRef = useRef({ x: 0, y: 0 }) // Position where the drag started
    const mouseOffsetRef = useRef({ x: 0, y: 0 }) // Offset of the mouse from the top-left corner of the dragged item
    const draggedItemsRef = useRef<string[]>([]) // IDs of items currently being dragged
    const throttleTimeoutRef = useRef<NodeJS.Timeout | null>(null) // Timeout for throttling drag events
    const boxDragTimeoutRef = useRef<NodeJS.Timeout | null>(null) // Timeout for box drag operations
    const localDragStartedRef = useRef<boolean>(false) // Whether a local drag operation has started
    const localIsDraggingRef = useRef<boolean>(false) // Whether we're currently dragging items locally
    const localTargetRef = useRef<{ boxId: number; targetPath: string, targetId?: string } | null>(null) // Target box and path for local drag operations

    /** Connect to the system that handles dragging files between boxes from @Context/BoxDragContext */
    const BoxDrag = useBoxDrag();

    /** Connect to the system that tracks files being transferred */
    const { isFileTransferring, getFileTransferInfo } = useTransferState();

    /** UI State */
    const [isOpeningBrowser, setIsOpeningBrowser] = useState(false); // Whether we're currently opening a file in the browser
    // const [containerWidth, setContainerWidth] = useState(0); // Width of the file explorer container for responsive design
    const containerWidthRef = useRef(0); // Reference to the container width for performance optimization
    const [showFileOperationChoices, setShowFileOperationChoices] = useState(false); // Whether to show the file operation choices menu

    /* DOM references */
    const containerRef = useRef<HTMLDivElement>(null) // Reference to the main container element
    const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map()) // Map of file IDs to their DOM elements for quick access


    /** File Stats dialog state */
    const [showStatsDialog, setShowStatsDialog] = useState(false); // Whether to show the file stats dialog
    const [selectedFilesForStats, setSelectedFilesForStats] = useState<FileSystemItem[]>([]); // Files for which we want to show stats

    /** New folder dialog state */
    const [showNewFolderDialog, setShowNewFolderDialog] = useState(false); // Whether to show the new folder dialog
    const generateUniqueId = () => {
        const timestamp = Date.now().toString(36); // Base36 timestamp
        const randomPart = crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
        return timestamp + randomPart.slice(0, 4);
    };
    const [newFolderName, setNewFolderName] = useState(() => "untitled " + generateUniqueId()); // Name for the new folder
    const [isCreatingFolder, setIsCreatingFolder] = useState(false); // Whether we're currently creating a folder
    const [isCalculatingSize, setIsCalculatingSize] = useState(false); // Whether we're currently calculating the size of a folder
    const [selectedCount, setSelectedCount] = useState(0); // Number of currently selected files

    /** Move destination dialog state */
    const [showMoveDialog, setShowMoveDialog] = useState(false); // Whether to show the move destination dialog
    const [itemsToMove, setItemsToMove] = useState<FileSystemItem[]>([]); // Items selected for moving

    /** Current zom level */
    const zoomLevelRef = useRef(zoomLevel);

    const lastMoveTimeRef = useRef(0);


    const [showDropdown, setShowDropdown] = React.useState(false);
    const [dropdownPosition, setDropdownPosition] = React.useState<{ x: number; y: number } | null>(null);

    /** Address bar state for direct path navigation */
    const [showAddressBar, setShowAddressBar] = useState(false);
    const [addressBarValue, setAddressBarValue] = useState("");
    const [addressBarSuggestions, setAddressBarSuggestions] = useState<string[]>([]);
    const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);

    /** Keyboard shortcuts help dialog state */
    const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);

    // used by agent to update the current path in file explorer
    useImperativeHandle(ref, () => ({
        updatePath: (newPath: string) => {
            if (newPath !== cwd) {
                navigateTo(newPath);
            }
        }
    }));

    /**
     * Handles address bar navigation
     */
    const handleAddressBarNavigate = () => {
        if (addressBarValue.trim()) {
            navigateTo(addressBarValue.trim());
            setShowAddressBar(false);
            setAddressBarValue("");
            setAddressBarSuggestions([]);
            setSelectedSuggestionIndex(-1);
        }
    };

    /**
     * Gets path suggestions based on current input
     */
    const getPathSuggestions = async (inputPath: string): Promise<string[]> => {
        if (!inputPath.trim()) {
            // Return common paths when no input
            const commonPaths = cloudType && accountId ? 
                [CLOUD_HOME] : 
                [
                    await (window as any).fsApi.getHomePath(),
                    await (window as any).fsApi.getHomePath() + "/Documents",
                    await (window as any).fsApi.getHomePath() + "/Downloads", 
                    await (window as any).fsApi.getHomePath() + "/Desktop",
                    await (window as any).fsApi.getHomePath() + "/Pictures"
                ];
            return commonPaths;
        }

        try {
            // Get the directory part of the input path
            const lastSlashIndex = inputPath.lastIndexOf('/');
            const dirPath = lastSlashIndex > 0 ? inputPath.substring(0, lastSlashIndex) : '/';
            const prefix = lastSlashIndex >= 0 ? inputPath.substring(lastSlashIndex + 1) : inputPath;

            let directories: FileSystemItem[] = [];

            // Get directories from current input path
            if (cloudType && accountId) {
                directories = await (window as any).cloudFsApi.readDirectory(cloudType, accountId, dirPath);
            } else {
                directories = await window.fsApi.readDirectory(dirPath);
            }

            // Filter to only directories, match prefix, and respect hidden file setting
            const suggestions = directories
                .filter(item => 
                    item.isDirectory && 
                    item.name.toLowerCase().startsWith(prefix.toLowerCase()) &&
                    (showHidden || !item.name.startsWith(".")) // Respect the hidden files setting
                )
                .map(item => dirPath === '/' ? `/${item.name}` : `${dirPath}/${item.name}`)
                .slice(0, 8); // Limit to 8 suggestions

            return suggestions;
        } catch (error) {
            console.error('Error getting path suggestions:', error);
            return [];
        }
    };

    /**
     * Handles address bar input changes and updates suggestions
     */
    const handleAddressBarChange = async (value: string) => {
        setAddressBarValue(value);
        setSelectedSuggestionIndex(-1);
        
        // Get suggestions
        const suggestions = await getPathSuggestions(value);
        setAddressBarSuggestions(suggestions);
    };

    /**
     * Handles keyboard navigation in address bar
     */
    const handleAddressBarKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (selectedSuggestionIndex >= 0 && addressBarSuggestions[selectedSuggestionIndex]) {
                setAddressBarValue(addressBarSuggestions[selectedSuggestionIndex]);
                navigateTo(addressBarSuggestions[selectedSuggestionIndex]);
                setShowAddressBar(false);
                setAddressBarValue("");
                setAddressBarSuggestions([]);
                setSelectedSuggestionIndex(-1);
            } else {
                handleAddressBarNavigate();
            }
        } else if (e.key === 'Escape') {
            setShowAddressBar(false);
            setAddressBarValue("");
            setAddressBarSuggestions([]);
            setSelectedSuggestionIndex(-1);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedSuggestionIndex(prev => 
                prev < addressBarSuggestions.length - 1 ? prev + 1 : prev
            );
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedSuggestionIndex(prev => prev > -1 ? prev - 1 : -1);
        } else if (e.key === 'Tab' && addressBarSuggestions.length > 0) {
            e.preventDefault();
            const selectedSuggestion = selectedSuggestionIndex >= 0 ? 
                addressBarSuggestions[selectedSuggestionIndex] : 
                addressBarSuggestions[0];
            setAddressBarValue(selectedSuggestion);
            setAddressBarSuggestions([]);
            setSelectedSuggestionIndex(-1);
        }
    };

    /**
     * Toggles the address bar visibility and sets initial value
     */
    const toggleAddressBar = async () => {
        if (!showAddressBar) {
            setAddressBarValue(cwd);
            // Show initial suggestions
            const suggestions = await getPathSuggestions(cwd);
            setAddressBarSuggestions(suggestions);
        } else {
            setAddressBarSuggestions([]);
            setSelectedSuggestionIndex(-1);
        }
        setShowAddressBar(!showAddressBar);
    };

    /** 
     * Files filtered by search query and hidden file setting 
     * This creates a new list every time searchQuery, items, or showHidden changes
     */
    const filteredItems = useMemo(() => {
        if (searchQuery) {
            return items.filter(
                (item) =>
                    item.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
                    (showHidden || !item.name.startsWith(".")) // Show hidden files/directories if enabled, or if item is not hidden
            );
        }
        return items.filter((item) => showHidden || !item.name.startsWith(".")); // Filter out hidden files and directories if showHidden is false
    }, [items, searchQuery, showHidden]);

    /** 
     * Filtered files sorted alphabetically with folders first
     * Folders always appear before files, then both are sorted by name
     */
    const sortedItems = useMemo(() => {
        return [...filteredItems].sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;  // a is folder, b is file -> a comes first
            if (!a.isDirectory && b.isDirectory) return 1;  // a is file, b is folder -> b comes first
            return a.name.localeCompare(b.name);
        });
    }, [filteredItems]);

    /** Updates zoom level reference when zoom changes */
    useEffect(() => {
        zoomLevelRef.current = zoomLevel;
    }, [zoomLevel])

    /**
     * Loads the home directory when the component first loads
     * Different home directories for cloud vs local storage
     */
    useEffect(() => {
        const fetchHome = async () => {
            if (cloudType && accountId) {
                // Cloud storage - use cloud home directory
                setCwd(CLOUD_HOME)
                setHistory([CLOUD_HOME])
                setHistoryIndex(0)
            } else {
                // Local storage - get user's home directory
                const homePath = await window.fsApi.getHome()
                setCwd(homePath)
                setHistory([homePath])
                setHistoryIndex(0)
            }
        }

        fetchHome()
    }, [])

    /** Loads files when the current directory changes */
    useEffect(() => {
        if (!cwd || cwd === "")
            return

        setIsLoading(true)

        if (onCurrentPathChange) {
            onCurrentPathChange(cwd)
        }

        if (cloudType && accountId) {
            console.log(`Loading cloud directory: ${cwd} for account: ${accountId} on provider: ${cloudType}`);
            // Load files from cloud storage
            (window as any).cloudFsApi.readDirectory(cloudType, accountId, cwd)
                .then((files: FileSystemItem[]) => {
                    setItems(files) // Update file list
                    updatePathSegments(cwd) // Update breadcrumb path
                    setIsLoading(false) // Hide loading indicator
                    selectedItemsRef.current = new Set()  // Clear selection
                    lastSelectedItemRef.current = null // Clear last selected
                    setSelectedCount(0) // Update selection count
                    itemRefs.current.clear()
                })
                .catch((err: Error) => {
                    console.error(err)
                    setIsLoading(false)

                    toast.error("Cloud Directory Access Failed", {
                        description: `Failed to load cloud directory: ${err.message || 'Unknown error'}`,
                        duration: 2000,
                    });
                })
        } else {
            // Load files from local storage
            window.fsApi
                .readDirectory(cwd)
                .then((files) => {
                    setItems(files) // Update the file list
                    updatePathSegments(cwd) // Update breadcrumb path
                    setIsLoading(false) //  Hide loading indicator
                    selectedItemsRef.current = new Set() // Clear selection
                    lastSelectedItemRef.current = null // Clear last selected
                    setSelectedCount(0) // Update selection count
                    itemRefs.current.clear()
                })
                .catch((err) => {
                    console.error(err)
                    setIsLoading(false)

                    // Show error toast with error message
                    if (err && typeof err === 'object' && 'message' in err) {
                        const errorMessage = (err as Error).message;
                        if (errorMessage.includes('permission') || errorMessage.includes('EACCES') || errorMessage.includes('access')) {
                            toast.error("Permission Required", {
                                description: "Unable to access directory.",
                                duration: 2000,
                            });
                        } else {
                            toast.error("Directory Access Failed", {
                                description: `Failed to load directory: ${errorMessage}`,
                                duration: 2000,
                            });
                        }
                    } else {
                        toast.error("Directory Access Failed", {
                            description: "An unexpected error occurred while loading the directory.",
                            duration: 2000,
                        });
                    }
                })
        }
        updateSelectedItemsColor();
    }, [cwd])

    /**
     * Refreshes the file list when refresh toggle changes
     */
    useEffect(() => {
        if (cwd === "") {
            return
        }

        // Use silent refresh if silentRefresh flag is true, otherwise use normal refresh
        if (silentRefresh) {
            refreshDirectorySilent();
        } else {
            refreshDirectory();
        }
    }, [refreshToggle])

    /**
     * Opens a file using the system's default application
     * Handles both local and cloud files
     */
    const openFile = async (e: React.MouseEvent, item: FileSystemItem) => {
        e.preventDefault();
        setIsOpeningBrowser(true);

        try {
            let fileContent: FileContent | null = null;
            if (!cloudType || !accountId) {
                // Get file from local storage
                fileContent = await (window as any).fsApi.getFile(item.path);
            } else {
                // Get file from cloud storage
                fileContent = await (window as any).cloudFsApi.getFile(cloudType, accountId, item.path);
            }

            // Check if we got valid file content
            if (!fileContent) {
                toast.error("File Open Failed", {
                    description: "Unable to read file content.",
                    duration: 4000,
                });
                return;
            }

            if (fileContent.url) {
                // File has a URL (common for cloud files) - open in browser/default app
                const response = await (window as any).electronAPI.openExternalUrl(fileContent.url);
                if (!response?.success) {
                    toast.error("File Open Failed", {
                        description: `Failed to open file: ${response?.error || 'Unknown error'}`,
                        duration: 2000,
                    });
                }
            } else {
                // File has content data - check if empty
                if (!fileContent.content) {
                    toast.error("File Open Failed", {
                        description: "File content is empty or corrupted.",
                        duration: 4000,
                    });
                    return;
                }

                // Determine if it's a text file for proper handling
                const isTextFile = ['.txt', '.csv', '.py', '.json', '.log'].some(ext => item.path.endsWith(ext));
                const blob = new Blob(
                    [fileContent.content],
                    { type: isTextFile ? 'text/plain' : fileContent.type }
                );

                // Open the file
                await (window as any).electronAPI.openFile(fileContent);
            }
        } catch (error) {
            console.error("Error opening file:", error);

            if (error && typeof error === 'object' && 'message' in error) {
                const errorMessage = (error as Error).message;
                if (errorMessage.includes('permission') || errorMessage.includes('EACCES') || errorMessage.includes('access')) {
                    toast.error("Permission Error", {
                        description: "Unable to open file.",
                        duration: 2000,
                    });
                } else {
                    toast.error("File Open Failed", {
                        description: `Failed to open file: ${errorMessage}`,
                        duration: 2000,
                    });
                }
            } else {
                toast.error("File Open Failed", {
                    description: "An unexpected error occurred while opening the file.",
                    duration: 2000,
                });
            }
        } finally {
            setIsOpeningBrowser(false);
        }
    }

    /** Splits a file path into segments for breadcrumb navigation */
    const updatePathSegments = (path: string) => {
        // Split by forward slash or backslash, remove empty segments
        const segments = path.split(/[/\\]/).filter(Boolean)
        setCurrentPath(segments)
    }

    /**
     * Navigates to a specified directory path
     */
    const navigateTo = (path: string) => {
        const newHistory = history.slice(0, historyIndex + 1)
        newHistory.push(path)
        setHistory(newHistory)
        setHistoryIndex(newHistory.length - 1)
        setCwd(path)
    }

    /**
     * Navigates back in history
     */
    const navigateBack = () => {
        if (historyIndex > 0) {
            setHistoryIndex(historyIndex - 1)
            setCwd(history[historyIndex - 1])
        }
    }

    /**
     * Navigates forward in history
     */
    const navigateForward = () => {
        if (historyIndex < history.length - 1) {
            setHistoryIndex(historyIndex + 1)
            setCwd(history[historyIndex + 1])
        }
    }

    /**
     * Navigates to the home directory (local or cloud)
     */
    const goToHome = async () => {
        if (cloudType && accountId) {
            navigateTo(CLOUD_HOME) // Cloud home
        } else {
            const homePath = window.fsApi.getHome() // Local home
            navigateTo(homePath)
        }
    }

    /**
     * Navigates to the parent directory
     */
    const navigateUp = () => {
        // Split path and remove last segment, join back together
        const parentPath = cwd.split("/").slice(0, -1).join("/") || "/"
        navigateTo(parentPath)
    }

    /**
     * Refreshes the current directory contents
     */
    const refreshDirectory = async () => {
        setIsLoading(true)
        if (cloudType && accountId) {
            // Refresh cloud directory
            (window as any).cloudFsApi.readDirectory(cloudType, accountId, cwd)
                .then((files: FileSystemItem[]) => {
                    setItems(files)
                    updatePathSegments(cwd)
                    setIsLoading(false)
                    selectedItemsRef.current = new Set();
                    lastSelectedItemRef.current = null
                    setSelectedCount(0)
                })
                .catch((err: Error) => {
                    console.error(err)
                    setIsLoading(false)

                    toast.error("Cloud Refresh Failed", {
                        description: `Failed to refresh cloud directory: ${err.message || 'Unknown error'}`,
                        duration: 2000,
                    });
                })
        } else {
            if (!cwd || cwd === "") {
                // Refresh local directory
                setIsLoading(false)
                return
            }
            window.fsApi
                .readDirectory(cwd)
                .then((files) => {
                    setItems(files)
                    updatePathSegments(cwd)
                    setIsLoading(false)
                    selectedItemsRef.current = new Set()
                    lastSelectedItemRef.current = null
                    setSelectedCount(0)
                })
                .catch((err) => {
                    console.error(err)
                    setIsLoading(false)

                    if (err && typeof err === 'object' && 'message' in err) {
                        const errorMessage = (err as Error).message;
                        if (errorMessage.includes('permission') || errorMessage.includes('EACCES') || errorMessage.includes('access')) {
                            toast.error("Permission Error", {
                                description: "Unable to refresh directory.",
                                duration: 2000,
                            });
                        } else {
                            toast.error("Directory Refresh Failed", {
                                description: `Failed to refresh directory: ${errorMessage}`,
                                duration: 2000,
                            });
                        }
                    } else {
                        toast.error("Directory Refresh Failed", {
                            description: "An unexpected error occurred while refreshing the directory.",
                            duration: 2000,
                        });
                    }
                })
        }
        updateSelectedItemsColor();
    }

    /**
     * Silently refreshes the current directory contents without showing loading indicator
     */
    const refreshDirectorySilent = async () => {
        if (cloudType && accountId) {
            // Refresh cloud directory silently
            (window as any).cloudFsApi.readDirectory(cloudType, accountId, cwd)
                .then((files: FileSystemItem[]) => {
                    setItems(files)
                    updatePathSegments(cwd)
                    selectedItemsRef.current = new Set();
                    lastSelectedItemRef.current = null
                    setSelectedCount(0)
                })
                .catch((err: Error) => {
                    console.error(err)
                    // Silent refresh - no toast errors, just log to console
                })
        } else {
            if (!cwd || cwd === "") {
                return
            }
            window.fsApi
                .readDirectory(cwd)
                .then((files) => {
                    setItems(files)
                    updatePathSegments(cwd)
                    selectedItemsRef.current = new Set()
                    lastSelectedItemRef.current = null
                    setSelectedCount(0)
                })
                .catch((err) => {
                    console.error(err)
                })
        }
        updateSelectedItemsColor();
    }


    // useEffect(() => {
    //     const dispatcher = RendererIpcCommandDispatcher.getInstance();

    //     const updateCwd = (toCwd: string, cloudTypeCheck?: CloudType, accountIdCheck?: string) => {
    //         if (!cloudType && !accountId && !cloudTypeCheck && !accountIdCheck) {
    //             console.log(`Changing directory to: ${toCwd}`);
    //             setCwd(toCwd);
    //             return; // In case of local storage
    //         }
    //         if (cloudType !== cloudTypeCheck || accountId !== accountIdCheck) {
    //             return; // Ignore if this is not the current cloud type/account
    //         }
    //         console.log(`Changing directory to: ${toCwd}`);
    //         setCwd(toCwd);
    //     }

    //     dispatcher.register('changeDirectoryOnAccountWindow', updateCwd);

    //     return () => {
    //         dispatcher.unregister('changeDirectoryOnAccountWindow');
    //     };
    // }, [cloudType, accountId]);

    /**
     * Updates visual selection state for all items
     */
    const updateSelectedItemsColor = () => {
        // Go through each file element and add/remove the "selected" CSS class
        itemRefs.current.forEach((element, id) => {
            if (!element) return;

            // Add "selected" class if item is selected, remove it if not
            element.classList.toggle("selected", selectedItemsRef.current.has(id));
        });
    };

    /**
     * Handles single and double clicks on file/directory items
     * Supports multi-selection with Ctrl/Cmd and range selection with Shift
     */
    const handleItemClick = (e: React.MouseEvent, item: FileSystemItem) => {
        e.preventDefault();
        e.stopPropagation();

        // Check if this file is being transferred - if so, don't allow any interaction
        const isTransferring = isFileTransferring(item.path, cloudType, accountId);
        if (isTransferring) {
            return; // Exit early if file is being transferred
        }

        // Handle double-click for navigation/opening
        if (e.detail === 2) {
            if (!item.isDirectory) {
                // It's a file - open it
                openFile(e, item)
            } else {
                // It's a folder - go into it
                navigateTo(item.path)
            }
            return
        }


        // Handle single click for selection
        const ctrlOrMeta = e.ctrlKey || e.metaKey;

        // Add to selection with Shift key 
        if (e.shiftKey) {
            selectedItemsRef.current = new Set([...selectedItemsRef.current, item.id]);
            lastSelectedItemRef.current = item.id;
        }

        // Multi-selection with Ctrl/Cmd key
        else if (ctrlOrMeta) {
            const newSelectedItemsUpdate = new Set(selectedItemsRef.current);
            if (newSelectedItemsUpdate.has(item.id)) {
                // Item is selected - unselect it
                newSelectedItemsUpdate.delete(item.id);
            } else {
                // Item is not selected - select it
                newSelectedItemsUpdate.add(item.id);
            }
            selectedItemsRef.current = newSelectedItemsUpdate;
            lastSelectedItemRef.current = item.id;
        }
        // Single selection
        else {
            selectedItemsRef.current = new Set([item.id]);
            lastSelectedItemRef.current = item.id;
        }

        updateSelectedItemsColor();
        setSelectedCount(selectedItemsRef.current.size);
    }


    /**
     * Initiates drag selection when clicking on empty space
     * This lets users draw a rectangle to select multiple files
     */
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        // Don't start selection if clicking on a file or using right mouse button
        if ((e.target as HTMLElement).closest(".file-item") || e.button !== 0) {
            return;
        }

        if (Date.now() - lastMoveTimeRef.current < 16) return;
        lastMoveTimeRef.current = Date.now();

        // Start selection mode
        isSelectingRef.current = true;
        selectionBoxRef.current!.style.display = "block"; //Show the selection box

        // Determine if this is an additive drag (Ctrl/Cmd key pressed)
        const additive = e.ctrlKey || e.metaKey;
        isAdditiveDragRef.current = additive;

        if (!additive) {
            // Clear existing selection
            selectedItemsRef.current = new Set();
            selectionSnapshotRef.current = new Set();
            setSelectedCount(0);
        } else {
            // Keep existing selection as backup
            selectionSnapshotRef.current = new Set(selectedItemsRef.current);
        }

        // Calculate starting position relative to container
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width - 1, e.clientX - rect.left));
        const y = Math.max(0, Math.min(rect.height - 1, e.clientY - rect.top));

        selectionStartRef.current = { x, y };
        selectionStartViewRef.current = { scrollTop: container.scrollTop };
        updateSelectedItemsColor();

        // Set up global mouse event listeners for dragging
        const globalMouseMove = (e: MouseEvent) => {
            if (isSelectingRef.current && containerRef.current) {
                const event = e as unknown as React.MouseEvent;
                handleMouseMove(event);
            }
        };

        const globalMouseUp = () => {
            if (isSelectingRef.current) {
                handleMouseUp();
            }
        };

        if (isSelectingRef.current) {
            document.addEventListener('mousemove', globalMouseMove);
            document.addEventListener('mouseup', globalMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', globalMouseMove);
            document.removeEventListener('mouseup', globalMouseUp);
        };
    }, [containerRef.current, isSelectingRef.current, isAdditiveDragRef.current]);

    /**
     * Determines which items intersect with the current selection box
     */
    const updateSelectedItemsFromBox = useCallback(async (box: {
        left: number;
        top: number;
        width: number;
        height: number
    }) => {
        if (!isSelectingRef.current || !containerRef.current) return;

        const itemsCurrentlyInBox = new Set<string>();
        const containerRect = containerRef.current.getBoundingClientRect();

        // Define the selection rectangle
        const selectionBox = {
            left: box.left,
            top: box.top,
            right: box.left + box.width,
            bottom: box.top + box.height,
        };

        // Check each item to see if it intersects with the selection box
        itemRefs.current.forEach((element, id) => {
            if (!element) return;
            if (!containerRef.current) return;
            const isTransferring = itemRefs.current.get(id)?.dataset.isTransferring === 'true';
            if (isTransferring) {
                console.log(`Skipping item (${id}) - it is being transferred.`);
                return; // Skip if item is being transferred
            }

            const itemRect = element.getBoundingClientRect();

            // Convert item position to container-relative coordinates
            const relativeItemRect = {
                left: itemRect.left - containerRect.left,
                top: itemRect.top - containerRect.top + containerRef.current.scrollTop,
                right: itemRect.right - containerRect.left,
                bottom: itemRect.bottom - containerRect.top + containerRef.current.scrollTop,
            };



            // Check if selection box and item rectangle overlap
            const isIntersecting = !(
                relativeItemRect.right < selectionBox.left ||
                relativeItemRect.left > selectionBox.right ||
                relativeItemRect.bottom < selectionBox.top ||
                relativeItemRect.top > selectionBox.bottom
            );

            if (isIntersecting) {
                itemsCurrentlyInBox.add(id);
            }
        });

        // Update selection based on mode (additive or replace)
        selectedItemsRef.current = isAdditiveDragRef.current
            ? new Set([...selectionSnapshotRef.current, ...itemsCurrentlyInBox]) // Add to existing selection
            : itemsCurrentlyInBox; // Replace selection with new items

        updateSelectedItemsColor();
    }, [sortedItems]);

    /** Updates the visual selection box during drag selection */
    const updateSelectionBox = useCallback((currentX: number, currentY: number) => {
        if (!containerRef.current) return;

        // Calculate rectangle coordinates accounting for zoom level
        const zoomAdjustedBox = {
            left: (Math.min(selectionStartRef.current.x, currentX)) / zoomLevelRef.current,
            top: (Math.min(selectionStartRef.current.y + selectionStartViewRef.current.scrollTop * zoomLevelRef.current, currentY + containerRef.current.scrollTop * zoomLevelRef.current)) / zoomLevelRef.current,
            width: Math.abs(currentX - selectionStartRef.current.x) / zoomLevelRef.current,
            height: Math.abs(selectionStartRef.current.y + selectionStartViewRef.current.scrollTop * zoomLevelRef.current - (currentY + containerRef.current.scrollTop * zoomLevelRef.current)) / zoomLevelRef.current
        };

        // Update visual selection box
        selectionBoxRef.current!.style.left = `${zoomAdjustedBox.left}px`;
        selectionBoxRef.current!.style.top = `${zoomAdjustedBox.top}px`;
        selectionBoxRef.current!.style.width = `${zoomAdjustedBox.width}px`;
        selectionBoxRef.current!.style.height = `${zoomAdjustedBox.height}px`;

        // Calculate detection box (for finding intersecting files)
        const detectSelectionBox = {
            left: (Math.min(selectionStartRef.current.x, currentX)),
            top: (Math.min(selectionStartRef.current.y + selectionStartViewRef.current.scrollTop, currentY + containerRef.current.scrollTop)),
            width: Math.abs(currentX - selectionStartRef.current.x),
            height: Math.abs(selectionStartRef.current.y + selectionStartViewRef.current.scrollTop - (currentY + containerRef.current.scrollTop))
        };

        updateSelectedItemsFromBox(detectSelectionBox);
    }, [updateSelectedItemsFromBox, zoomLevelRef.current]);

    /** Handles mouse movement during drag selection */
    const handleMouseMove = useCallback((e: React.MouseEvent | MouseEvent) => {
        if (!isSelectingRef.current || !containerRef.current) return;

        // Throttle mouse move events (PENDING: Check performance with Hojin)
        if (Date.now() - lastMoveTimeRef.current < 16) {
            return;
        }
        lastMoveTimeRef.current = Date.now();

        // Calculate current mouse position relative to container
        const rect = containerRef.current.getBoundingClientRect();
        const currentX = Math.max(0, Math.min(rect.width - 1, e.clientX - rect.left));
        const currentY = Math.max(0, Math.min(rect.height - 1, e.clientY - rect.top));

        // Auto-scroll when near edges
        const scrollThreshold = 50;
        const scrollAmount = 5;
        if (e.clientY < rect.top + scrollThreshold) {
            containerRef.current.scrollTop -= scrollAmount; // Scroll up
        } else if (e.clientY > rect.bottom - scrollThreshold) {
            containerRef.current.scrollTop += scrollAmount; // Scroll down
        }

        updateSelectionBox(currentX, currentY);
    }, [isSelectingRef.current, updateSelectedItemsFromBox, selectionStartRef.current.x, selectionStartRef.current.y]);

    /** Hides and resets the selection box */
    const removeSelectionBox = useCallback(() => {
        if (selectionBoxRef.current) {
            selectionBoxRef.current.style.display = "none";
            selectionBoxRef.current.style.left = "0px";
            selectionBoxRef.current.style.top = "0px";
            selectionBoxRef.current.style.width = "0px";
            selectionBoxRef.current.style.height = "0px";
        }
    }, [selectionBoxRef.current]);

    /** Ends drag selection */
    const handleMouseUp = () => {
        if (isSelectingRef.current) {
            isSelectingRef.current = false;
            setSelectedCount(selectedItemsRef.current.size);
            removeSelectionBox();
        }
    }

    /** Starts dragging files when mouse is pressed on a file */
    const handleItemMouseDown = (e: React.MouseEvent, item: FileSystemItem) => {
        if (e.button !== 0) return; // Only handle left mouse button

        // Remember where the drag started
        dragStartPosRef.current = { x: e.clientX, y: e.clientY }

        // Calculate mouse offset from top-left of item
        const itemElement = itemRefs.current.get(item.id)
        if (itemElement) {
            const rect = itemElement.getBoundingClientRect()
            mouseOffsetRef.current = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            }
        }

        // Store the item info but don't start drag operations yet
        const potentialDragItem = item;

        // Set up mouse move handler that checks for drag threshold
        const handlePotentialDrag = (moveEvent: MouseEvent) => {
            const dx = moveEvent.clientX - dragStartPosRef.current.x;
            const dy = moveEvent.clientY - dragStartPosRef.current.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Only start the drag if the mouse moved more than 5 pixels
            if (distance > 5) {
                document.removeEventListener("mousemove", handlePotentialDrag);
                document.removeEventListener("mouseup", handlePotentialMouseUp);
                // Now start the drag operation
                startDragOperation(potentialDragItem);
            }
        };

        const handlePotentialMouseUp = () => {
            // Mouse released without dragging
            document.removeEventListener("mousemove", handlePotentialDrag);
            document.removeEventListener("mouseup", handlePotentialMouseUp);
        };

        // Set up threshold detection listeners
        document.addEventListener("mousemove", handlePotentialDrag);
        document.addEventListener("mouseup", handlePotentialMouseUp);
    }

    // Separate function to actually start the drag operation
    const startDragOperation = (item: FileSystemItem) => {
        // Determine which files to drag
        let itemsToDrag: string[]
        if (selectedItemsRef.current.has(item.id)) {
            // Item is selected - drag all selected items
            itemsToDrag = Array.from(selectedItemsRef.current)
        } else {
            // Item is not selected - just drag this item and select it
            itemsToDrag = [item.id]
            selectedItemsRef.current = new Set([...Array.from(selectedItemsRef.current), item.id]);
            lastSelectedItemRef.current = item.id
            updateSelectedItemsColor();
            setSelectedCount(selectedItemsRef.current.size);
        }

        draggedItemsRef.current = itemsToDrag

        // Set up global mouse event listeners for actual dragging
        document.addEventListener("mousemove", handleItemMouseMove)
        document.addEventListener("mouseup", handleItemMouseUp)
    }

    /** Resets drag target when mouse leaves valid drop areas */
    const resetTarget = () => {
        BoxDrag.setTarget({ boxId: -1, targetPath: "" });
        localTargetRef.current = null;
    }

    /** Handles mouse movement during item drag operations */
    const handleItemMouseMove = async (e: MouseEvent) => {
        // Check if we should start dragging
        if (!localDragStartedRef.current && !localIsDraggingRef.current) {
            const dx = e.clientX - dragStartPosRef.current.x
            const dy = e.clientY - dragStartPosRef.current.y
            const distance = Math.sqrt(dx * dx + dy * dy)

            // Start dragging if mouse moved more than 5 pixels
            if (distance > 5) {
                BoxDrag.setIsDragging(true);
                localIsDraggingRef.current = true;
                localDragStartedRef.current = true;

                // Prepare dragged items for box-to-box transfer
                const draggedFileItems = sortedItems.filter(item =>
                    draggedItemsRef.current.includes(item.id)
                );
                BoxDrag.setDragItems(
                    draggedFileItems,
                    boxId,
                    cloudType,
                    accountId
                );

            } else {
                return
            }
        }

        if (throttleTimeoutRef.current) {
            clearTimeout(throttleTimeoutRef.current)
        }

        throttleTimeoutRef.current = setTimeout(() => {
            if (!containerRef.current || !localIsDraggingRef.current) return

            // Calculate mouse position relative to container
            const containerRect = containerRef.current.getBoundingClientRect()
            const relativeX = e.clientX - containerRect.left
            const relativeY = e.clientY - containerRect.top + containerRef.current.scrollTop

            // Check if mouse is still inside the container
            const isWithinContainer = e.clientX >= containerRect.left &&
                e.clientX <= containerRect.right &&
                e.clientY >= containerRect.top &&
                e.clientY <= containerRect.bottom;

            if (isWithinContainer) {
                let foundDropTarget = false

                // Check each file/folder to see if mouse is over it
                for (const item of sortedItems) {
                    // Skip files that are being dragged
                    if (draggedItemsRef.current.includes(item.id)) continue

                    const itemElement = itemRefs.current.get(item.id)
                    if (!itemElement) continue

                    // Calculate item position relative to container
                    const itemRect = itemElement.getBoundingClientRect()
                    const itemLeft = itemRect.left - containerRect.left
                    const itemTop = itemRect.top - containerRect.top + containerRef.current.scrollTop
                    const itemRight = itemLeft + itemRect.width
                    const itemBottom = itemTop + itemRect.height

                    // Check if mouse is over this item
                    if (relativeX >= itemLeft && relativeX <= itemRight &&
                        relativeY >= itemTop && relativeY <= itemBottom) {

                        if (item.isDirectory) {
                            // Set this item as the drop target
                            BoxDrag.setTarget({
                                boxId: boxId,
                                targetPath: item.path,
                                targetId: item.id
                            });
                            localTargetRef.current = {
                                boxId: boxId,
                                targetPath: item.path,
                                targetId: item.id
                            };
                            foundDropTarget = true
                            break
                        } else {
                            resetTarget();
                        }
                    }
                }

                if (!foundDropTarget) {
                    resetTarget(); // No valid drop target found
                }
            } else {
                resetTarget(); // Mouse is outside container
            }

            // Auto-scroll when dragging near container edges
            const scrollThreshold = 60
            const scrollAmount = 10

            if (e.clientY < containerRect.top + scrollThreshold) {
                containerRef.current.scrollTop -= scrollAmount
            } else if (e.clientY > containerRect.bottom - scrollThreshold) {
                containerRef.current.scrollTop += scrollAmount
            }
        }, 16)
    }


    /**
     * Handles the end of a file drag operation
     * Processes file moves and cleans up drag state
     */
    const handleItemMouseUp = async () => {
        // Clean up event listeners
        document.removeEventListener("mousemove", handleItemMouseMove)
        document.removeEventListener("mouseup", handleItemMouseUp)

        if (throttleTimeoutRef.current) {
            clearTimeout(throttleTimeoutRef.current)
            throttleTimeoutRef.current = null
        }

        // Process file move if there's a valid drop target
        if (localIsDraggingRef.current && localTargetRef.current) {
            const targetItem = sortedItems.find((item) => item.id === String(localTargetRef.current?.targetId));
            if (targetItem && targetItem.isDirectory) {
                // Move files to target folder
                try {
                    // First, load the files that are being dragged
                    const draggedFileItems = sortedItems.filter(item =>
                        draggedItemsRef.current.includes(item.id)
                    );
                    const filePaths = draggedFileItems.map(item => item.path);

                    //(filePaths: string[], sourceCloudType?: CloudType, sourceAccountId?: string, targetPath?: string, targetCloudType?: CloudType, targetAccountId?: string)
                    if (handleItemTransfer){
                        console.log("handle Item Mouse Up - Moving files:", filePaths, "to target:", targetItem.path);
                        await handleItemTransfer(
                            filePaths,
                            cloudType,
                            accountId,
                            targetItem.path,
                            cloudType,
                            accountId
                        );
                    }

                    refreshDirectory(); // TODO: FIX SOMETIMES IT IS BUGGY AND DOES NOT REFRESH
                } catch (error) {
                    // The transfer service already handles error display through the transfer manager
                    // We only show toast for local operation errors that aren't handled by the transfer service
                    if (error && typeof error === 'object' && 'message' in error) {
                        const errorMessage = (error as Error).message;
                        if (errorMessage.includes('cancelled')) {
                            // User cancelled - no need to show error
                            return;
                        }

                        if (errorMessage.includes('permission') || errorMessage.includes('EACCES') || errorMessage.includes('access')) {
                            toast.error("Permission Error", {
                                description: "Unable to move files.",
                                duration: 2000,
                            });
                        } else {
                            toast.error("Move Failed", {
                                description: `Failed to move files: ${errorMessage}`,
                                duration: 2000,
                            });
                        }
                    } else {
                        toast.error("Move Failed", {
                            description: "An unexpected error occurred while moving the files.",
                            duration: 2000,
                        });
                    }
                }
            }
        }

        // Clean up drag state for box-to-box transfers
        if (localIsDraggingRef.current) {
            // Determine if this was a successful drop operation
            const hasValidDropTarget = BoxDrag.target !== null;

            if (hasValidDropTarget) {
                // Delay cleanup to allow drop handling
                boxDragTimeoutRef.current = setTimeout(() => {
                    boxDragTimeoutRef.current = null;
                }, 100);
            }
        }

        // Reset all drag-related states
        BoxDrag.setDragItems([], null);
        BoxDrag.setIsDragging(false);
        localDragStartedRef.current = false;
        localIsDraggingRef.current = false;
        localTargetRef.current = null;
    }

    /** Cleanup function for selection mode */
    const handleSelectionEnd = () => {
        isSelectingRef.current = false;
        removeSelectionBox();

        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleSelectionEnd);
    }

    /** Cleanup effect for event listeners and timeouts */
    useEffect(() => {
        return () => {
            document.removeEventListener("mousemove", handleItemMouseMove);
            document.removeEventListener("mouseup", handleItemMouseUp);
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleSelectionEnd)

            // Clear any pending timers
            if (throttleTimeoutRef.current) {
                clearTimeout(throttleTimeoutRef.current)
            }
            if (boxDragTimeoutRef.current) {
                clearTimeout(boxDragTimeoutRef.current)
            }
            if (BoxDrag.isDragging) {
                BoxDrag.setDragItems([], null);
                BoxDrag.setIsDragging(false);
            }
        }
    }, [])

    /** Track whether mouse is within the container */
    const [isMouseWithinContainer, setIsMouseWithinContainer] = useState(false);

    /** Reference to address bar container for click outside detection */
    const addressBarRef = useRef<HTMLDivElement>(null);

    /** Handle clicking outside address bar to close suggestions */
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (addressBarRef.current && !addressBarRef.current.contains(event.target as Node)) {
                if (showAddressBar && addressBarSuggestions.length > 0) {
                    setAddressBarSuggestions([]);
                    setSelectedSuggestionIndex(-1);
                }
            }
        };

        if (showAddressBar) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [showAddressBar, addressBarSuggestions.length]);

    /** Keyboard shortcuts handler */
    useEffect(() => {
        const handleKeyDown = async (e: KeyboardEvent) => {

            // Select all files (Ctrl+A or Cmd+A)
            if ((e.ctrlKey || e.metaKey) && e.key === "a") {
                // If user is typing in the address bar, let the browser handle text selection
                if (showAddressBar && document.activeElement?.tagName === 'INPUT') {
                    return; // Don't prevent default, let the browser select text in the input
                }
                
                e.preventDefault()
                // Only select items that are not currently being transferred
                const allSelectableItems = new Set(
                    sortedItems
                        .filter(item => !isFileTransferring(item.path, cloudType, accountId))
                        .map((item) => item.id)
                )
                selectedItemsRef.current = allSelectableItems;
                setSelectedCount(allSelectableItems.size);
                updateSelectedItemsColor();
            }

            // Toggle address bar (Ctrl+L or Cmd+L)
            if ((e.ctrlKey || e.metaKey) && e.key === "l") {
                e.preventDefault();
                toggleAddressBar();
            }

            // Go to home directory (Ctrl+H or Cmd+H)  
            if ((e.ctrlKey || e.metaKey) && e.key === "h") {
                e.preventDefault();
                goToHome();
            }

            // Go up one directory (Alt+Up)
            if (e.altKey && e.key === "ArrowUp") {
                e.preventDefault();
                navigateUp();
            }

            // Navigate back (Alt+Left)
            if (e.altKey && e.key === "ArrowLeft") {
                e.preventDefault();
                navigateBack();
            }

            // Navigate forward (Alt+Right)
            if (e.altKey && e.key === "ArrowRight") {
                e.preventDefault();
                navigateForward();
            }

            // Refresh directory (F5 or Ctrl+R or Cmd+R)
            if (e.key === "F5" || ((e.ctrlKey || e.metaKey) && e.key === "r")) {
                e.preventDefault();
                refreshDirectory();
            }

            // Show keyboard shortcuts help (F1 or Ctrl+? or Cmd+?)
            if (e.key === "F1" || ((e.ctrlKey || e.metaKey) && e.key === "/")) {
                e.preventDefault();
                setShowKeyboardHelp(true);
            }

            // Clear selection and cancel operations (Escape)
            if (e.key === "Escape") {
                selectedItemsRef.current = new Set();
                lastSelectedItemRef.current = null;
                setSelectedCount(0);
                updateSelectedItemsColor();

                // Close address bar if open
                if (showAddressBar) {
                    setShowAddressBar(false);
                    setAddressBarValue("");
                }

                // Cancel any active drag operations
                if (BoxDrag.isDragging) {
                    if (boxDragTimeoutRef.current) {
                        clearTimeout(boxDragTimeoutRef.current)
                        boxDragTimeoutRef.current = null
                    }

                    BoxDrag.setDragItems([], null);
                    BoxDrag.setIsDragging(false);
                }

                // Cancel selection mode
                if (isSelectingRef.current) {
                    isSelectingRef.current = false;
                    removeSelectionBox();
                }
            }

            // Delete selected items (Delete key)
            if (e.key === "Delete" && selectedItemsRef.current.size > 0) {
                await handleDelete();
            }
        }

        // Only add keyboard event listener when mouse is within the container
        if (isMouseWithinContainer) {
            window.addEventListener("keydown", handleKeyDown)
            return () => window.removeEventListener("keydown", handleKeyDown)
        }
    }, [BoxDrag.isDragging, sortedItems, isMouseWithinContainer, showAddressBar, showKeyboardHelp])


    /**
     * Deletes selected files and folders
     * Handles both local and cloud file systems
     */
    async function handleDelete() {
        if (selectedItemsRef.current.size === 0) return;

        try {
            // Process all delete operations in parallel (TODO: ADD CONFIRMATION DIALOG)
            await Promise.all(
                Array.from(selectedItemsRef.current).map(async (itemId) => {
                    const item = sortedItems.find((i) => i.id === itemId);
                    if (!item) return;


                    if (deleteFileFromSource) {
                        await deleteFileFromSource(
                            {
                                sourceCloudType: cloudType,
                                sourceAccountId: accountId,
                                sourcePath: item.path
                            },
                            false // keepOriginal = false for delete operation
                        );
                    }
                })
            );

            // Refresh directory and clear selection after successful deletion
            await refreshDirectory();
            selectedItemsRef.current = new Set();
            setSelectedCount(0);
        } catch (error) {
            console.error("Error deleting items:", error);

            if (error && typeof error === 'object' && 'message' in error) {
                const errorMessage = (error as Error).message;
                if (errorMessage.includes('permission') || errorMessage.includes('EACCES') || errorMessage.includes('access')) {
                    toast.error("Permission Error", {
                        description: "Unable to delete files.",
                        duration: 2000,
                    });
                } else {
                    toast.error("Delete Failed", {
                        description: `Failed to delete selected items: ${errorMessage}`,
                        duration: 2000,
                    });
                }
            } else {
                toast.error("Delete Failed", {
                    description: "An unexpected error occurred while deleting the selected items.",
                    duration: 2000,
                });
            }
        }
    }


    /**
     * Creates a new folder in the current directory
     * Handles both local and cloud file systems
     */
    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) {
            toast.error("Invalid Name", {
                description: "Please enter a valid folder name.",
                duration: 2000,
            });
            return;
        }

        setIsCreatingFolder(true);

        try {
            // Create the folder path in the current directory
            const folderPath = `${cwd}/${newFolderName.trim()}`;

            if (!cloudType || !accountId) {
                // Local directory creation
                await (window as any).fsApi.createDirectory(folderPath);
            } else {
                // Cloud directory creation
                await (window as any).cloudFsApi.createDirectory(cloudType, accountId, folderPath);
            }

            // Success feedback
            toast.success("Folder Created", {
                description: `Successfully created "${newFolderName.trim()}"`,
                duration: 2000,
            });

            // Reset dialog state
            setNewFolderName("");
            setShowNewFolderDialog(false);

            // Refresh directory to show the new folder
            await refreshDirectory();

        } catch (error) {
            console.error("Error creating folder:", error);

            if (error && typeof error === 'object' && 'message' in error) {
                const errorMessage = (error as Error).message;
                if (errorMessage.includes('permission') || errorMessage.includes('EACCES') || errorMessage.includes('access')) {
                    toast.error("Permission Error", {
                        description: "Unable to create folder due to insufficient permissions.",
                        duration: 3000,
                    });
                } else if (errorMessage.includes('exists') || errorMessage.includes('EEXIST')) {
                    toast.error("Folder Already Exists", {
                        description: `A folder named "${newFolderName.trim()}" already exists.`,
                        duration: 3000,
                    });
                } else if (errorMessage.includes('invalid') || errorMessage.includes('EINVAL')) {
                    toast.error("Invalid Name", {
                        description: "The folder name contains invalid characters.",
                        duration: 3000,
                    });
                } else {
                    toast.error("Folder Creation Failed", {
                        description: `Failed to create folder: ${errorMessage}`,
                        duration: 3000,
                    });
                }
            } else {
                toast.error("Folder Creation Failed", {
                    description: "An unexpected error occurred while creating the folder.",
                    duration: 3000,
                });
            }
        } finally {
            setIsCreatingFolder(false);
        }
    };

    /**
     * Opens the new folder dialog
     */
    const openNewFolderDialog = () => {
        setNewFolderName("untitled " + generateUniqueId());
        setShowNewFolderDialog(true);
    };

    /**
     * Show the file stats dialog for selected files
     */
    const showFileStats = async () => {
        if (selectedItemsRef.current.size === 0) return;

        const selectedFiles = Array.from(selectedItemsRef.current)
            .map(id => sortedItems.find(item => item.id === id))
            .filter((item): item is FileSystemItem => item !== undefined);

        if (selectedFiles.length === 0) return;

        setSelectedFilesForStats(selectedFiles);
        setShowStatsDialog(true);
    };

    /**
     * Show the file stats dialog for a specific item (right-click)
     */
    const showFileStatsForItem = async (e: React.MouseEvent, item: FileSystemItem) => {
        // If multiple files are selected and the right-clicked item is one of them,
        // show stats for all selected files
        if (selectedItemsRef.current.size > 1 && selectedItemsRef.current.has(item.id)) {
            const selectedFiles = Array.from(selectedItemsRef.current)
                .map(id => sortedItems.find(fileItem => fileItem.id === id))
                .filter((fileItem): fileItem is FileSystemItem => fileItem !== undefined);

            setSelectedFilesForStats(selectedFiles);
        } else {
            // Otherwise, show stats for just the right-clicked item
            setSelectedFilesForStats([item]);
        }
        setShowStatsDialog(true);
    };

    const showContextMenu = (e: React.MouseEvent, item: FileSystemItem, mousePosition: { x: number; y: number }) => {
        e.preventDefault(); // Prevent default context menu
        e.stopPropagation(); // Prevent bubbling up to container
        if (!selectedItemsRef.current.has(item.id)) {
            // If the item is not selected, clear the selection and select this item
            selectedItemsRef.current = new Set([item.id]);
            lastSelectedItemRef.current = item.id;
            setSelectedCount(1);
            updateSelectedItemsColor();
        }
        setShowDropdown(true);
        setDropdownPosition({x: mousePosition.x + 10, y: mousePosition.y - 30});
    };

    return (
        <div className="flex h-full w-full flex-col text-white rounded-lg overflow-hidden select-none">
            {/*  display context menu only if not transferring
                         the context menu should include options like getinfo, rename, delete, and copy/move options
                         should contain all the current selected items */}
            <DropdownMenu open={showDropdown} onOpenChange={setShowDropdown} >
                {/* Dropdown menu content */}
                <DropdownMenuContent
                    style={{ position: "absolute", top: dropdownPosition?.y, left: dropdownPosition?.x }}
                    className="w-36 bg-white dark:bg-slate-800 shadow-lg rounded-lg z-50 opacity-90 duration-200"
                >
                    <DropdownMenuItem
                        onClick={showFileStats}
                        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-sky-600 transition-colors"
                    >
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 dark:bg-primary/20">
                            <Info className="h-3 w-3 text-primary" />
                        </div>
                        <div className="flex-1">
                            <div className="text-[12px] font-medium">Get Info</div>
                            <div className="text-[8px] text-muted-foreground">View file details</div>
                        </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => {
                            const selectedItems = items.filter(item => selectedItemsRef.current.has(item.id));
                            if (selectedItems.length > 0) {
                                setItemsToMove(selectedItems);
                                setShowMoveDialog(true);
                            } else {
                                toast.error("No items selected for move");
                            }
                        }}
                        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-sky-600 transition-colors"
                    >
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/50">
                            <Move className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="flex-1">
                            <div className="text-[12px] font-medium">Move</div>
                            <div className="text-[8px] text-muted-foreground">Move to location</div>
                        </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={handleDelete}
                        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-destructive/10 text-destructive hover:bg-sky-600 transition-colors"
                    >
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/50">
                            <Trash className="h-3 w-3 text-red-600 dark:text-red-400" />
                        </div>
                        <div className="flex-1">
                            <div className="text-[12px] font-medium">Delete</div>
                            <div className="text-[8px] text-muted-foreground">Remove permanently</div>
                        </div>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            { /* Breadcrumbs */}
            <div className="grid grid-flow-col place-content-between pl-4 pt-2 bg-white dark:bg-slate-800 select-none">
                <div className="flex items-center space-x-1 text-sm text-gray-400">
                    {currentPath.map((segment, index) => (
                        <React.Fragment key={index}>
                            {index !== 0 && <ChevronRight className="h-3 w-3 mx-1 text-gray-500"/>}
                            <span
                                className="text-blue-400 cursor-pointer hover:underline"
                                onClick={() => {
                                    const path = "/" + currentPath.slice(0, index + 1).join("/")
                                    navigateTo(path)
                                }}
                            >
                                {segment}
                            </span>
                        </React.Fragment>
                    ))}
                </div>
                <div>
                    <span className="text-sm text-gray-500 mr-5 mb-2">
                        {selectedCount > 0 ? `${selectedCount} item${selectedCount > 1 ? 's' : ''} selected` : ''}
                    </span>
                </div>
            </div>

            {/* Toolbar that contains navigation buttons and search bar */}
            <div className="flex items-center gap-1 p-1 bg-white dark:bg-slate-800 select-none">

                {/* Home button - goes to user's home directory */}
                <Button
                    onClick={goToHome}
                    className="p-2 rounded-md hover:bg-slate-100 text-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                    <Home className="h-5 w-5" />
                </Button>

                {/* Up button - goes to parent folder */}
                <Button
                    onClick={navigateUp}
                    className="p-2 rounded-md hover:bg-slate-100 text-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                    <ArrowUp className="h-5 w-5" />
                </Button>

                {/* Navigation buttons for history */}
                <Button
                    onClick={navigateBack}
                    disabled={historyIndex <= 0}
                    className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <ChevronLeft className="h-5 w-5" />
                </Button>

                {/* Forward button - goes to next folder in history */}
                <Button
                    onClick={navigateForward}
                    disabled={historyIndex >= history.length - 1}
                    className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <ChevronRight className="h-5 w-5" />
                </Button>

                {/* Refresh button - reloads the current directory */}
                <Button
                    onClick={refreshDirectory}
                    className={`p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 ${isLoading ? "animate-spin" : ""}`}
                >
                    <RefreshCw className="h-5 w-5" />
                </Button>

                {/* folder button - creates a new folder in current directory */}
                <Button
                    onClick={openNewFolderDialog}
                    className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200"
                    title="Create new folder"
                >
                    <FolderPlus className="h-5 w-5" />
                </Button>

                {/* Show/Hide hidden files button */}
                <Button
                    onClick={() => setShowHidden(!showHidden)}
                    className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200"
                    title={showHidden ? "Hide hidden files" : "Show hidden files"}
                >
                    {showHidden ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </Button>

                {/* Address bar for direct path navigation */}
                <Button
                    onClick={toggleAddressBar}
                    className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200"
                    title="Enter path directly"
                >
                    <Terminal className="h-5 w-5" />
                </Button>

                {/* Keyboard shortcuts help button */}
                <Button
                    onClick={() => setShowKeyboardHelp(true)}
                    className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200"
                    title="Show keyboard shortcuts (F1)"
                >
                    <HelpCircle className="h-5 w-5" />
                </Button>

                {/* Search bar for filtering files */}
                <div className="relative ml-auto flex-1 max-w-md">
                    {showAddressBar ? (
                        <div className="flex items-center gap-1">
                            <div ref={addressBarRef} className="relative flex-1">
                                <Terminal className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                                <Input
                                    type="text"
                                    placeholder="Enter path (e.g., /home/user/documents)..."
                                    value={addressBarValue}
                                    onChange={(e) => handleAddressBarChange(e.target.value)}
                                    onKeyDown={handleAddressBarKeyDown}
                                    className="pl-9 text-slate-800 dark:text-slate-200 h-8 placeholder:text-gray-500 focus-visible:ring-blue-500 focus-visible:ring-offset-0 focus-visible:border-blue-500 select-none"
                                    autoFocus
                                />
                                
                                {/* Autocomplete suggestions dropdown */}
                                {addressBarSuggestions.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md shadow-lg max-h-48 overflow-y-auto">
                                        {addressBarSuggestions.map((suggestion, index) => (
                                            <div
                                                key={suggestion}
                                                className={cn(
                                                    "px-3 py-2 text-sm cursor-pointer transition-colors",
                                                    index === selectedSuggestionIndex
                                                        ? "bg-blue-100 dark:bg-blue-900/50 text-blue-900 dark:text-blue-100"
                                                        : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                                                )}
                                                onClick={() => {
                                                    setAddressBarValue(suggestion);
                                                    navigateTo(suggestion);
                                                    setShowAddressBar(false);
                                                    setAddressBarValue("");
                                                    setAddressBarSuggestions([]);
                                                    setSelectedSuggestionIndex(-1);
                                                }}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <FolderIcon className="h-4 w-4 text-amber-500" />
                                                    <span className="truncate">{suggestion}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <Button
                                onClick={handleAddressBarNavigate}
                                className="p-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white"
                                title="Navigate to path"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    ) : (
                        <div>
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                            <Input
                                type="text"
                                placeholder="Search files..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 text-slate-800 dark:text-slate-200 h-8 placeholder:text-gray-500 focus-visible:ring-blue-500 focus-visible:ring-offset-0 focus-visible:border-blue-500 select-none"
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* This is where files and folders are displayed in a grid */}
            <div
                ref={containerRef}
                className="relative flex-1 bg-white dark:bg-slate-900 pt-2 px-4 pb-4 overflow-y-auto select-none"
                onMouseDown={handleMouseDown}
                onMouseEnter={() => setIsMouseWithinContainer(true)}
                onMouseLeave={() => setIsMouseWithinContainer(false)}
            >
                {/* Selection box for multi-select */}
                <div
                    ref={selectionBoxRef}
                    className="absolute border-2 border-blue-500 bg-blue-500/20 z-10 pointer-events-none rounded-sm"
                />


                {/* Display loading indicator when opening browser or loading files */}
                {isOpeningBrowser ? (
                    <div className="flex justify-center items-center h-full">
                        <RefreshCw className="h-8 w-8 text-blue-400 animate-spin" />
                    </div>
                ) : (
                    isLoading ? (
                        /* Loading spinner when loading folder contents */
                        <div className="flex justify-center items-center h-full">
                            <RefreshCw className="h-8 w-8 text-blue-400 animate-spin" />
                        </div>
                    ) : sortedItems.length > 0 ? (

                        /* Grid of files and folders when there are items to show */
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(95px,1fr))] gap-2">

                            {/* Loop through each file/folder and create a display item */}
                            {sortedItems.map((item) => {
                                // Check if this file is currently being transferred
                                const isTransferring = isFileTransferring(item.path, cloudType, accountId);
                                const transferInfo = getFileTransferInfo(item.path, cloudType, accountId);

                                return (
                                    <FileItem
                                        key={item.id}
                                        item={item}
                                        isBoxToBoxTransfer={isBoxToBoxTransfer}
                                        BoxDrag={BoxDrag}
                                        boxId={boxId}
                                        draggedItemsRef={draggedItemsRef}
                                        handleItemClick={handleItemClick}
                                        handleItemMouseDown={handleItemMouseDown}
                                        handleItemRightClick={showContextMenu}
                                        itemRefs={itemRefs}
                                        isTransferring={isTransferring}
                                        transferInfo={transferInfo}
                                    />
                                )
                            })}
                        </div>
                    ) : (
                        /* Empty folder message when no files are found */
                        <div
                            className="flex flex-col items-center justify-center h-full text-slate-800 dark:text-slate-200">
                            <FolderIcon className="w-16 h-16 mb-4 opacity-30" />
                            <p>This folder is empty</p>
                        </div>
                    )
                )}
            </div>

            {/* File statistics dialog - shows detailed info about selected files */}
            <FileStatsDialog
                isOpen={showStatsDialog}
                onOpenChange={(open) => {
                    setShowStatsDialog(open);
                }}
                selectedFiles={selectedFilesForStats}
                cloudType={cloudType}
                accountId={accountId}
                onFilesChange={(newFiles) => {
                    setSelectedFilesForStats(newFiles);
                }}
            />

            {/* Move destination dialog - allows user to select destination for moving files */}
            <MoveDestinationDialog
                open={showMoveDialog}
                setOpen={setShowMoveDialog}
                selectedFiles={itemsToMove.map(item => item.path)}
                sourceCloudType={cloudType}
                sourceAccountId={accountId}
                onConfirm={(destinationCloudType, destinationAccountId, destinationPath, keepOriginal) => {
                    if (handleItemTransfer && itemsToMove.length > 0) {
                        const filePaths = itemsToMove.map(item => item.path);
                        handleItemTransfer(
                            filePaths,
                            cloudType,
                            accountId,
                            destinationPath,
                            destinationCloudType,
                            destinationAccountId
                        );
                        
                        
                        // Reset state
                        setShowMoveDialog(false);
                        setItemsToMove([]);
                        
                        // Clear selection
                        selectedItemsRef.current.clear();
                        setSelectedCount(0);
                        
                        // Refresh if it was a move operation (not copy)
                        if (!keepOriginal) {
                            refreshDirectory();
                        }
                    }
                }}
                onCancel={() => {
                    setShowMoveDialog(false);
                    setItemsToMove([]);
                }}
            />

            {/* New folder dialog - prompts user for folder name */}
            <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
                <DialogContent className="max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                            Create New Folder
                        </DialogTitle>
                        <DialogDescription className="text-slate-600 dark:text-slate-400">
                            Enter a name for the new folder.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 pt-4">
                        <Input
                            type="text"
                            placeholder="Folder name"
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !isCreatingFolder) {
                                    handleCreateFolder();
                                }
                                if (e.key === 'Escape') {
                                    setShowNewFolderDialog(false);
                                }
                            }}
                            className="text-slate-800 dark:text-slate-200 placeholder:text-gray-500 focus-visible:ring-blue-500 focus-visible:ring-offset-0 focus-visible:border-blue-500"
                            autoFocus
                            disabled={isCreatingFolder}
                        />

                        <div className="flex justify-end gap-2">
                            <Button
                                variant="outline"
                                onClick={() => setShowNewFolderDialog(false)}
                                disabled={isCreatingFolder}
                                className="text-slate-700 dark:text-slate-300"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleCreateFolder}
                                disabled={isCreatingFolder || !newFolderName.trim()}
                                className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                            >
                                {isCreatingFolder ? (
                                    <>
                                        <RefreshCw className="h-4 w-4 animate-spin" />
                                        Creating...
                                    </>
                                ) : (
                                    <>
                                        <FolderPlus className="h-4 w-4" />
                                        Create Folder
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Keyboard shortcuts help dialog */}
            <Dialog open={showKeyboardHelp} onOpenChange={setShowKeyboardHelp}>
                <DialogContent className="max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <Keyboard className="h-5 w-5" />
                            Keyboard Shortcuts
                        </DialogTitle>
                        <DialogDescription className="text-slate-600 dark:text-slate-400">
                            Speed up your file management with these handy shortcuts.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 pt-4">
                        <div className="grid gap-3">
                            {/* Navigation shortcuts */}
                            <div className="space-y-2">
                                <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">Navigation</h3>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-600 dark:text-slate-400">Go to home directory</span>
                                        <div className="flex gap-1">
                                            <kbd className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded">Ctrl</kbd>
                                            <span className="text-slate-500">+</span>
                                            <kbd className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded">H</kbd>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-600 dark:text-slate-400">Navigate up one directory</span>
                                        <div className="flex gap-1">
                                            <kbd className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded">Alt</kbd>
                                            <span className="text-slate-500">+</span>
                                            <kbd className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded">↑</kbd>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-600 dark:text-slate-400">Navigate back in history</span>
                                        <div className="flex gap-1">
                                            <kbd className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded">Alt</kbd>
                                            <span className="text-slate-500">+</span>
                                            <kbd className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded">←</kbd>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-600 dark:text-slate-400">Navigate forward in history</span>
                                        <div className="flex gap-1">
                                            <kbd className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded">Alt</kbd>
                                            <span className="text-slate-500">+</span>
                                            <kbd className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded">→</kbd>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-600 dark:text-slate-400">Toggle address bar</span>
                                        <div className="flex gap-1">
                                            <kbd className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded">Ctrl</kbd>
                                            <span className="text-slate-500">+</span>
                                            <kbd className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded">L</kbd>
                                        </div>
                                    </div>
                                    <div className="ml-4 text-xs text-slate-500 dark:text-slate-400">
                                        📝 Type a path for autocomplete suggestions. Use ↑/↓ to navigate, Tab to complete, or click suggestions.
                                    </div>
                                </div>
                            </div>

                            {/* File operations shortcuts */}
                            <div className="space-y-2">
                                <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">File Operations</h3>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-600 dark:text-slate-400">Select all files</span>
                                        <div className="flex gap-1">
                                            <kbd className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded">Ctrl</kbd>
                                            <span className="text-slate-500">+</span>
                                            <kbd className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded">A</kbd>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-600 dark:text-slate-400">Delete selected items</span>
                                        <kbd className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded">Delete</kbd>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-600 dark:text-slate-400">Clear selection / Cancel</span>
                                        <kbd className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded">Escape</kbd>
                                    </div>
                                </div>
                            </div>

                            {/* View shortcuts */}
                            <div className="space-y-2">
                                <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">View</h3>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-600 dark:text-slate-400">Refresh directory</span>
                                        <div className="flex gap-1">
                                            <kbd className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded">F5</kbd>
                                            <span className="text-slate-500">or</span>
                                            <kbd className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded">Ctrl</kbd>
                                            <span className="text-slate-500">+</span>
                                            <kbd className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded">R</kbd>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-600 dark:text-slate-400">Show keyboard shortcuts</span>
                                        <div className="flex gap-1">
                                            <kbd className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded">F1</kbd>
                                            <span className="text-slate-500">or</span>
                                            <kbd className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded">Ctrl</kbd>
                                            <span className="text-slate-500">+</span>
                                            <kbd className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded">/</kbd>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>


                        <div className="flex justify-end">
                            <Button
                                onClick={() => setShowKeyboardHelp(false)}
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                Got it!
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
};