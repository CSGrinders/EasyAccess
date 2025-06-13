/**
 * FileExplorer Component
 * 
 * This is a file manager that shows files and folders like Windows Explorer or Mac Finder.
 * It can work with both files on your computer (local) and files in the cloud (Google Drive, Dropbox, etc.).
 */

import React, {useEffect, useState, useRef, useCallback, memo} from "react"
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
    MoreHorizontal
} from "lucide-react"
import type {FileContent, FileSystemItem} from "@Types/fileSystem"
import {Input} from "@/components/ui/input"
import {Button} from "@/components/ui/button"
import {cn} from "@/lib/utils"
import {CLOUD_HOME, CloudType} from "@Types/cloudType"
import {useBoxDrag} from "@/contexts/BoxDragContext";
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

/**
 * Props interface for the FileExplorer component
 */
interface FileExplorerProps {
    cloudType?: CloudType                                                                   // Cloud storage provider type 
                                                                                            // (e.g., 'dropbox', 'google', 'onedrive')
    accountId?: string                                                                      // Unique identifier for the cloud account 
    zoomLevel: number                                                                       // Zoom level for the file explorer
    tempPostFile?: (parentPath: string, cloudType?: CloudType, accountId?: string) => void  // Function to post a file to the cloud
    tempGetFile?: (filePaths: string[], cloudType?: CloudType, accountId?: string) => void  // Function to get a file from the cloud
    boxId: number                                                                           // Unique identifier for the box 
    isBoxToBoxTransfer?: boolean                                                            // Whether the transfer is between boxes
    refreshToggle?: boolean                                                                 // Toggle to refresh the file explorer  
    onCurrentPathChange?: (currentPath: string) => void                                     // Callback when the current path changes
}


/**
 * Picks the right icon for a file or folder based on its name
 * 
 * For folders: looks at folder name to pick special icons
 * For files: looks at file extension (.jpg, .pdf, .mp3, etc.) to pick the right icon
 */
const getFileIcon = (fileName: string, isDirectory: boolean = false) => {
    if (isDirectory) {
        const folderName = fileName.toLowerCase();

        // Check for special folder names and return icons
        if (folderName.includes('download')) return Download;
        if (folderName.includes('desktop')) return Monitor;
        if (folderName.includes('document')) return BookOpen;
        if (folderName.includes('picture') || folderName.includes('image')) return Image;
        if (folderName.includes('music') || folderName.includes('audio')) return Music;
        if (folderName.includes('video') || folderName.includes('movie')) return Video;
        if (folderName.includes('favorite') || folderName.includes('bookmark')) return Star;
        if (folderName.includes('config') || folderName.includes('setting')) return Settings;
        if (folderName === 'node_modules' || folderName === '.git') return Terminal;
        if (folderName.includes('src') || folderName.includes('source')) return Code;
        if (folderName.includes('bin') || folderName.includes('executable')) return Zap;
        if (folderName.includes('lib') || folderName.includes('library')) return Layers;

        // Default folder icon
        return FolderIcon;
    }

    // Handle files - get the file extension (part after the last dot)
    const ext = fileName.toLowerCase().split('.').pop() || '';

    // Programming and code files
    if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt'].includes(ext)) return Code;

    // Web files (HTML, CSS)
    if (['html', 'htm', 'css', 'scss', 'sass', 'less'].includes(ext)) return Globe;

    // Image files
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico', 'tiff', 'raw'].includes(ext)) return FileImage;

    // Video files
    if (['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v', '3gp'].includes(ext)) return FileVideo;

    // Audio files
    if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a', 'opus'].includes(ext)) return FileAudio;

    // Document files
    if (['pdf', 'doc', 'docx', 'rtf', 'odt', 'pages'].includes(ext)) return BookOpen;

    // Text files
    if (['txt', 'md', 'markdown', 'readme', 'log', 'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg'].includes(ext)) return FileText;

    // Spreadsheet files
    if (['xls', 'xlsx', 'csv', 'ods', 'numbers'].includes(ext)) return FileSpreadsheet;

    // Archive/compressed files
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'deb', 'rpm', 'dmg', 'iso'].includes(ext)) return Archive;

    // Executable files
    if (['exe', 'msi', 'app', 'deb', 'rpm', 'dmg', 'pkg', 'run', 'bin'].includes(ext)) return Zap;

    // Database files
    if (['db', 'sqlite', 'sql', 'mdb', 'accdb'].includes(ext)) return Database;

    // Design files
    if (['psd', 'ai', 'sketch', 'fig', 'xd', 'indd'].includes(ext)) return Palette;

    // System files
    if (['dll', 'sys', 'so', 'dylib'].includes(ext)) return Cpu;

    // Email files
    if (['eml', 'msg', 'pst'].includes(ext)) return Mail;

    // Calendar files
    if (['ics', 'ical'].includes(ext)) return Calendar;

    // Encrypted/security files
    if (['enc', 'gpg', 'p7s', 'p12', 'pfx', 'key', 'pem', 'crt'].includes(ext)) return Lock;

    return FileIcon; // Default file icon if no specific type is found
};

/**
 * Returns appropriate color class for file/directory icons
 */
const getIconColor = (fileName: string, isDirectory: boolean = false, isSelected: boolean = false, isDropTarget: boolean = false) => {
    // Special colors that override everything else
    if (isDropTarget) return "text-green-500"; //FIX
    if (isSelected) return "text-blue-500";

    // Colors for folders
    if (isDirectory) {
        const folderName = fileName.toLowerCase();
        if (folderName.includes('download')) return "text-green-400";
        if (folderName.includes('desktop')) return "text-purple-400";
        if (folderName.includes('document')) return "text-blue-400";
        if (folderName.includes('picture') || folderName.includes('image')) return "text-pink-400";
        if (folderName.includes('music') || folderName.includes('audio')) return "text-orange-400";
        if (folderName.includes('video') || folderName.includes('movie')) return "text-red-400";
        if (folderName.includes('favorite') || folderName.includes('bookmark')) return "text-yellow-400";
        if (folderName === 'node_modules' || folderName === '.git') return "text-gray-500";
        if (folderName.includes('src') || folderName.includes('source')) return "text-emerald-400";
        return "text-blue-400"; // Default folder color
    }

    // Colors for files based on their extension
    const ext = fileName.toLowerCase().split('.').pop() || '';

    // Programming languages get specific colors
    if (['js', 'ts', 'jsx', 'tsx'].includes(ext)) return "text-yellow-400";
    if (['py'].includes(ext)) return "text-green-400";
    if (['java'].includes(ext)) return "text-orange-400";
    if (['cpp', 'c'].includes(ext)) return "text-blue-400";
    if (['cs'].includes(ext)) return "text-purple-400";
    if (['php'].includes(ext)) return "text-indigo-400";
    if (['rb'].includes(ext)) return "text-red-400";
    if (['go'].includes(ext)) return "text-cyan-400";
    if (['rs'].includes(ext)) return "text-orange-500";
    if (['swift'].includes(ext)) return "text-orange-400";
    if (['kt'].includes(ext)) return "text-purple-500";

    // Web technologies
    if (['html', 'htm'].includes(ext)) return "text-orange-400";
    if (['css', 'scss', 'sass', 'less'].includes(ext)) return "text-blue-400";

    // Media files
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico'].includes(ext)) return "text-pink-400";
    if (['mp4', 'avi', 'mkv', 'mov', 'wmv'].includes(ext)) return "text-red-400";
    if (['mp3', 'wav', 'flac', 'aac'].includes(ext)) return "text-orange-400";

    // Document files
    if (['pdf'].includes(ext)) return "text-red-500";
    if (['doc', 'docx'].includes(ext)) return "text-blue-500";
    if (['xls', 'xlsx'].includes(ext)) return "text-green-500";

    // Archive files
    if (['zip', 'rar', '7z', 'tar'].includes(ext)) return "text-yellow-500";

    // Executable files
    if (['exe', 'msi', 'app'].includes(ext)) return "text-red-500";

    // Default color for any other file types
    return "text-gray-400";
};


export const FileExplorer = memo(function FileExplorer ({
                                                            zoomLevel,                  // How zoomed in the view is
                                                            cloudType,                  // Cloud storage type (e.g., 'dropbox', 'google', 'onedrive')
                                                            accountId,                  // Unique identifier for the cloud account
                                                            tempPostFile,               // Function to post a file to the cloud
                                                            tempGetFile,                // Function to get a file from the cloud
                                                            boxId,                      // Unique identifier for the box
                                                            isBoxToBoxTransfer = false, // Whether the transfer is between boxes
                                                            refreshToggle,              // Toggle to refresh the file explorer
                                                            onCurrentPathChange         // Callback when the current path changes
                                                        }: FileExplorerProps) {
   
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
    const selectionStartRef = useRef({x: 0, y: 0}) // Starting position of the selection box
    const selectionStartViewRef = useRef({scrollTop: 0}); // Starting scroll position of the container when selection started
    const selectionBoxRef = useRef<HTMLDivElement | null>(null); // Reference to the selection box element
    const isAdditiveDragRef = useRef(false); // Whether the current drag is additive (Ctrl/Cmd key pressed)
    const selectionSnapshotRef = useRef<Set<string>>(new Set()); // Snapshot of selected items at the start of a drag operation

    /** Drag and drop state */
    const dragStartPosRef = useRef({x: 0, y: 0}) // Position where the drag started
    const mouseOffsetRef = useRef({x: 0, y: 0}) // Offset of the mouse from the top-left corner of the dragged item
    const draggedItemsRef = useRef<string[]>([]) // IDs of items currently being dragged
    const throttleTimeoutRef = useRef<NodeJS.Timeout | null>(null) // Timeout for throttling drag events
    const boxDragTimeoutRef = useRef<NodeJS.Timeout | null>(null) // Timeout for box drag operations
    const localDragStartedRef = useRef<boolean>(false) // Whether a local drag operation has started
    const localIsDraggingRef = useRef<boolean>(false) // Whether we're currently dragging items locally
    const localTargetRef = useRef<{ boxId: number; targetPath: string, targetId?: string } | null>(null) // Target box and path for local drag operations

    /** Connect to the system that handles dragging files between boxes from @Context/BoxDragContext */
    const BoxDrag = useBoxDrag();
    
    /** UI State */
    const [isOpeningBrowser, setIsOpeningBrowser] = useState(false); // Whether we're currently opening a file in the browser
    const [containerWidth, setContainerWidth] = useState(0); // Width of the file explorer container for responsive design

    /* DOM references */
    const containerRef = useRef<HTMLDivElement>(null) // Reference to the main container element
    const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map()) // Map of file IDs to their DOM elements for quick access
    

    /** File Stats dialog state */
    const [showStatsDialog, setShowStatsDialog] = useState(false); // Whether to show the file stats dialog
    const [selectedFileForStats, setSelectedFileForStats] = useState<FileSystemItem | null>(null); // File for which we want to show stats
    const [isCalculatingSize, setIsCalculatingSize] = useState(false); // Whether we're currently calculating the size of a folder
    const [folderSize, setFolderSize] = useState<number | null>(null); // Size of the folder for which we're showing stats
    const [selectedCount, setSelectedCount] = useState(0); // Number of currently selected files

    /** Current zom level */
    const zoomLevelRef = useRef(zoomLevel);

    /** 
     * Files filtered by search query and hidden file setting 
     * This creates a new list every time searchQuery, items, or showHidden changes
     */
    const filteredItems = searchQuery
        ? items.filter(
            (item) =>
                item.name.toLowerCase().includes(searchQuery.toLowerCase()) 
                && (showHidden || !item.name.startsWith(".")), // Show hidden files if enabled, or if file is not hidden
        )
        : items.filter((item) => showHidden || !item.name.startsWith(".")) // Just filter hidden files if no search

    /** 
     * Filtered files sorted alphabetically with folders first
     * Folders always appear before files, then both are sorted by name
     */
    const sortedItems = [...filteredItems].sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1 // a is folder, b is file -> a comes first
        if (!a.isDirectory && b.isDirectory) return 1 // a is file, b is folder -> b comes first
        return a.name.localeCompare(b.name)
    })


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

    /** Watches for container size changes and updates width */
    useEffect(() => {
        // Function to update the container width
        const updateWidth = () => {
            if (containerRef.current) {
                setContainerWidth(containerRef.current.offsetWidth);
            }
        };

        updateWidth();

        // Watch for size changes using ResizeObserver
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerWidth(entry.contentRect.width);
            }
        });

        // Start watching the container
        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        // Also watch for window resize events
        window.addEventListener('resize', updateWidth);
        
        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', updateWidth);
        };
    }, []);

    /** Loads files when the current directory changes */
    useEffect(() => {
        if (!cwd || cwd === "") 
             return

        setIsLoading(true)
        
        if (onCurrentPathChange) {
            onCurrentPathChange(cwd)
        }

        if (cloudType && accountId) {
            // Load files from cloud storage
            (window as any).cloudFsApi.readDirectory(cloudType, accountId, cwd)
                .then((files: FileSystemItem[]) => {
                    setItems(files) // Update file list
                    updatePathSegments(cwd) // Update breadcrumb path
                    setIsLoading(false) // Hide loading indicator
                    selectedItemsRef.current = new Set()  // Clear selection
                    lastSelectedItemRef.current = null // Clear last selected
                    setSelectedCount(0) // Update selection count
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
        
        refreshDirectory();
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
                fileContent =  await (window as any).fsApi.getFile(item.path);
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
                    selectedItemsRef.current = new Set()
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

        // Range selection with Shift key (TODO: FIX ISSUE WHERE IS NOT WORKING AS EXPECTED)
        if (e.shiftKey && lastSelectedItemRef.current) {
            const itemsPathList = sortedItems.map((i) => i.id);
            const currentIndex = itemsPathList.indexOf(item.id);
            const lastIndex = itemsPathList.indexOf(lastSelectedItemRef.current);

            if (currentIndex !== -1 && lastIndex !== -1) {
                // Find the range between current and last selected items
                const start = Math.min(currentIndex, lastIndex);
                const end = Math.max(currentIndex, lastIndex);

                if (ctrlOrMeta) {
                    // Add range to existing selection
                    const rangeSelection = new Set<string>();
                    for (let i = start; i <= end; i++) {
                        rangeSelection.add(itemsPathList[i]);
                    }
                    selectedItemsRef.current = new Set([...selectedItemsRef.current, ...rangeSelection]);
                } else {
                    // Replace selection with range
                    const rangeSelection = new Set<string>();
                    for (let i = start; i <= end; i++) {
                        rangeSelection.add(itemsPathList[i]);
                    }
                    selectedItemsRef.current = rangeSelection;
                }
            }
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
    const updateSelectedItemsFromBox = useCallback((box: {
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
    }, [isSelectingRef.current, isAdditiveDragRef.current]);

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
            top: (Math.min(selectionStartRef.current.y + selectionStartViewRef.current.scrollTop , currentY + containerRef.current.scrollTop )),
            width: Math.abs(currentX - selectionStartRef.current.x) ,
            height: Math.abs(selectionStartRef.current.y + selectionStartViewRef.current.scrollTop - (currentY + containerRef.current.scrollTop ))
        };

        updateSelectedItemsFromBox(detectSelectionBox);
    }, [updateSelectedItemsFromBox, zoomLevelRef.current]);

    /** Handles mouse movement during drag selection */
    const handleMouseMove = useCallback((e: React.MouseEvent | MouseEvent) => {
        if (!isSelectingRef.current || !containerRef.current) return;

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
        dragStartPosRef.current = {x: e.clientX, y: e.clientY}

        // Calculate mouse offset from top-left of item
        const itemElement = itemRefs.current.get(item.id)
        if (itemElement) {
            const rect = itemElement.getBoundingClientRect()
            mouseOffsetRef.current = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            }
        }

        // Determine which files to drag
        let itemsToDrag: string[]
        if (selectedItemsRef.current.has(item.id)) {
            // Item is selected - drag all selected items
            itemsToDrag = Array.from(selectedItemsRef.current)
        } else {
            // Item is not selected - just drag this item and select it
            itemsToDrag = [item.id]
            selectedItemsRef.current = new Set([item.id])
            lastSelectedItemRef.current = item.id
        }

        draggedItemsRef.current = itemsToDrag

        // Set up global mouse event listeners for dragging
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
                
                // Load file contents for transfer (TODO FIX, MULTIPLE CALLS TO TEMPGETFILE)
                try {
                    await tempGetFile?.(draggedFileItems.map(item => item.path), cloudType, accountId);
                } catch (error) {
                    console.error("Error loading files for drag operation:", error);
                    // Reset drag state on error
                    BoxDrag.setDragItems([], null);
                    BoxDrag.setIsDragging(false);
                    localIsDraggingRef.current = false;
                    localDragStartedRef.current = false;
                    
                    toast.error("File Load Failed", {
                        description: "Failed to load files for transfer",
                        duration: 3000,
                    });
                    return;
                }
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

        // Process file move if there's a valid drop target (TODO: FIX, MULTIPLE CALLS TO TEMPPOSTFILE?)
        if (localIsDraggingRef.current && localTargetRef.current) {
            const targetItem = sortedItems.find((item) => item.id === String(localTargetRef.current?.targetId));
            if (targetItem && targetItem.isDirectory) {
                // Move files to target folder
                try {
                    await tempPostFile?.(targetItem.path, cloudType, accountId);
                    refreshDirectory(); // TODO: FIX SOMETIMES IT IS BUGGY AND DOES NOT REFRESH
                } catch (error) {
                    console.error("Error moving files:", error);
                    
                    if (error && typeof error === 'object' && 'message' in error) {
                        const errorMessage = (error as Error).message;
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
            } else if (targetItem && !targetItem.isDirectory) {
                // Handle file-to-file operation
                try {
                    tempPostFile?.(targetItem.path, cloudType, accountId);
                } catch (error) {
                    console.error("Error posting file:", error);
                    toast.error("File Operation Failed", {
                        description: "Failed to complete file operation.",
                        duration: 4000,
                    });
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

    /** Keyboard shortcuts handler */
    useEffect(() => {
        const handleKeyDown = async (e: KeyboardEvent) => {

            // Select all files (Ctrl+A or Cmd+A)
            if ((e.ctrlKey || e.metaKey) && e.key === "a") {
                e.preventDefault()
                const allItems = new Set(sortedItems.map((item) => item.id))
                selectedItemsRef.current = allItems;
                setSelectedCount(allItems.size);
                updateSelectedItemsColor();
            }

            // Clear selection and cancel operations (Escape)
            if (e.key === "Escape") {
                selectedItemsRef.current = new Set();
                lastSelectedItemRef.current = null;
                setSelectedCount(0);
                updateSelectedItemsColor();
                
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

        // Add keyboard event listener
        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [BoxDrag.isDragging, sortedItems])


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
                    
                    if (!cloudType || !accountId) {
                        // Local file system deletion
                        await (window as any).fsApi.deleteFile(item.path);
                    } else {
                        // Cloud file system deletion
                        await (window as any).cloudFsApi.deleteFile(
                            cloudType, 
                            accountId, 
                            item.path
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
     * Recursively calculates the total size of a folder and its contents
     * Handles both local and cloud file systems with batch processing for performance
     * 
     * TODO: FIX FOR MULTIPLE FILES, AND I SUSPECT IT IS NOT WORKING PROPERLY FOR SINGLE
     */
    const calculateFolderSize = async (folderPath: string): Promise<number> => {
        try {
            if (cloudType && accountId) {
                // Cloud file system processing
                const files = await (window as any).cloudFsApi.readDirectory(cloudType, accountId, folderPath);
                let totalSize = 0;
                
                // Process files in batces
                const batchSize = 10;
                for (let i = 0; i < files.length; i += batchSize) {
                    const batch = files.slice(i, i + batchSize);
                    const batchSizes = await Promise.allSettled(
                        batch.map(async (file: FileSystemItem) => {
                            if (file.isDirectory) {
                                return await calculateFolderSize(file.path);
                            } else {
                                return file.size || 0;
                            }
                        })
                    );
                    
                    // Sum up size calculations
                    batchSizes.forEach((result) => {
                        if (result.status === 'fulfilled') {
                            totalSize += result.value;
                        }
                    });
                }
                return totalSize;
            } else {
                // Local file system processing
                const files = await window.fsApi.readDirectory(folderPath);
                let totalSize = 0;
                
                const sizeTasks = files.map(async (file: FileSystemItem) => {
                    try {
                        if (file.isDirectory) {
                            return await calculateFolderSize(file.path);
                        } else {
                            return file.size || 0;
                        }
                    } catch (error) {
                        console.warn(`Error processing ${file.path}:`, error);
                        return 0;
                    }
                });
                
                // Handle all size calculations and sum results
                const sizes = await Promise.allSettled(sizeTasks);
                sizes.forEach((result) => {
                    if (result.status === 'fulfilled') {
                        totalSize += result.value;
                    }
                });
                
                return totalSize;
            }
        } catch (error) {
            console.error("Error calculating folder size for", folderPath, ":", error);
            return 0;
        }
    };

    /**
     * TODO: IMPLEMENT NAVIGATION TO FILES IN THE CASE WHERE MORE THAN ONE FILE IS SELECTED
     */
    const showFileStats = async () => {
        if (selectedItemsRef.current.size === 0) return;

        const firstSelectedId = Array.from(selectedItemsRef.current)[0];
        const selectedFile = sortedItems.find(item => item.id === firstSelectedId);
        
        if (!selectedFile) return;
        
        setSelectedFileForStats(selectedFile);
        setShowStatsDialog(true);
        
        // Calculate folder size asynchronously for directories
        if (selectedFile.isDirectory) {
            setIsCalculatingSize(true);
            try {
                const size = await calculateFolderSize(selectedFile.path);
                setFolderSize(size);
            } catch (error) {
                console.error("Failed to calculate folder size:", error);
                setFolderSize(0);
            } finally {
                setIsCalculatingSize(false);
            }
        }
    };

    /**
     * File statistics dialog component
     * Displays detailed information about selected files and folders
     */
    const FileStatsDialog = () => {
        if (!selectedFileForStats) {
            return (
                <Dialog open={showStatsDialog} onOpenChange={(open) => {
                    setShowStatsDialog(open);
                    if (!open) {
                        setFolderSize(null);
                        setIsCalculatingSize(false);
                    }
                }}>
                    <DialogContent className="max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl">
                        <div className="p-4 text-center">
                            <p className="text-slate-600 dark:text-slate-400">No file selected</p>
                        </div>
                    </DialogContent>
                </Dialog>
            );
        }

        const item = selectedFileForStats;
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
            const i = Math.floor(Math.log(bytes) / Math.log(1024));
            const size = bytes / Math.pow(1024, i);
    
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

        /**  Gets the size display for files vs folders */
        const getItemSize = () => {
            if (item.isDirectory) { //File is a folder
                if (isCalculatingSize) {
                    return "Calculating...";
                } 
                return folderSize !== null ? formatFileSize(folderSize) : "Unknown";
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
            <Dialog open={showStatsDialog} onOpenChange={(open) => {
                setShowStatsDialog(open);
                if (!open) {
                    setFolderSize(null);
                    setIsCalculatingSize(false);
                }
            }}>
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
                                            {isCalculatingSize && (
                                                <RefreshCw className="h-4 w-4 animate-spin" />
                                            )}
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

    return (
        <div className="flex h-full w-full flex-col text-white rounded-lg overflow-hidden select-none">
            
            { /* Breadcrumbs */}
            <div className="pl-4 pt-4 bg-white dark:bg-slate-800">
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
            </div>

            {/* Toolbar that contains navigation buttons and search bar */}
            <div className="flex items-center gap-1 p-4 bg-white dark:bg-slate-800">
                
                {/* Home button - goes to user's home directory */}
                <Button
                    onClick={goToHome}
                    className="p-2 rounded-md hover:bg-slate-100 text-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                    <Home className="h-5 w-5"/>
                </Button>

                {/* Up button - goes to parent folder */}
                <Button
                    onClick={navigateUp}
                    className="p-2 rounded-md hover:bg-slate-100 text-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                    <ArrowUp className="h-5 w-5"/>
                </Button>

                {/* Navigation buttons for history */}
                <Button
                    onClick={navigateBack}
                    disabled={historyIndex <= 0}
                    className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <ChevronLeft className="h-5 w-5"/>
                </Button>

                {/* Forward button - goes to next folder in history */}
                <Button
                    onClick={navigateForward}
                    disabled={historyIndex >= history.length - 1}
                    className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <ChevronRight className="h-5 w-5"/>
                </Button>

                {/* Refresh button - reloads the current directory */}
                <Button
                    onClick={refreshDirectory}
                    className={`p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 ${isLoading ? "animate-spin" : ""}`}
                >
                    <RefreshCw className="h-5 w-5"/>
                </Button>

                {/* Show/Hide hidden files button */}
                <Button
                    onClick={() => setShowHidden(!showHidden)}
                    className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200"
                    title={showHidden ? "Hide hidden files" : "Show hidden files"}
                >
                    {showHidden ? <EyeOff className="h-5 w-5"/> : <Eye className="h-5 w-5"/>}
                </Button>

                {/* Search bar for filtering files */}
                <div className="relative ml-auto flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500"/>
                    <Input
                        type="text"
                        placeholder="Search files..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 text-slate-800 dark:text-slate-200 h-10 placeholder:text-gray-500 focus-visible:ring-blue-500 focus-visible:ring-offset-0 focus-visible:border-blue-500"
                    />
                </div>
            </div>

            {/* File Actions Bar (Only shows when files are selected) */}
            {selectedCount > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 backdrop-blur-sm selected-menu-enter">

                    {/* Selection counter - shows how many files are selected */}
                    <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 dark:bg-primary/30">
                            <span className="text-xs font-bold font-semibold dark:text-blue-400 text-blue-600">
                                {selectedCount}
                            </span>
                        </div>
                        <span className="text-sm font-semibold dark:text-blue-400 text-blue-600">
                            {selectedCount === 1 ? "item selected" : "items selected"}
                        </span>
                    </div>
                    
                    {/* Action buttons - positioned on the right side */}
                    <div className="ml-auto flex gap-2">
                        {containerWidth >= 600 ? (
                            <>
                                {/* Get Info button - shows file details in a dialog */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex items-center gap-2 text-xs font-medium text-black dark:text-white transition-all duration-200 action-button"
                                    onClick={showFileStats}
                                >
                                    <Info className="h-3.5 w-3.5"/>
                                    Get Info
                                </Button>
                                
                                {/* Copy button - copies selected files (TODO: Not implemented yet) */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex items-center gap-2 text-xs font-medium border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 transition-all duration-200 action-button"
                                    onClick={() => {}}
                                >
                                    <Copy className="h-3.5 w-3.5"/>
                                    Copy
                                </Button>

                                {/* Move button - moves selected files (TODO: Not implemented yet) */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex items-center gap-2 text-xs font-medium border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 transition-all duration-200 action-button"
                                    onClick={() => {}}
                                >
                                    <Move className="h-3.5 w-3.5"/>
                                    Move
                                </Button>

                                {/* Delete button - permanently removes selected files */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex items-center gap-2 text-xs font-medium border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/50 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 transition-all duration-200 action-button"
                                    onClick={handleDelete}
                                >
                                    <Trash className="h-3.5 w-3.5"/>
                                    Delete
                                </Button>
                            </>
                        ) : (
                            /* Collapse actions into dropdown menu for small screens */
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="flex items-center gap-2 text-xs font-medium text-black dark:text-white transition-all duration-200 action-button"
                                    >
                                        <MoreHorizontal className="h-3.5 w-3.5"/>
                                        Actions
                                    </Button>
                                </DropdownMenuTrigger>
                                
                                {/* Dropdown menu content */}
                                <DropdownMenuContent 
                                    align="end" 
                                    className="w-56 bg-popover/95 backdrop-blur-sm border border-border/50 shadow-xl dropdown-content"
                                    sideOffset={8}
                                >
                                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b border-border/50">
                                        {selectedCount} {selectedCount === 1 ? "item" : "items"} selected
                                    </div>
                                    <DropdownMenuItem 
                                        onClick={showFileStats}
                                        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent/50 transition-colors"
                                    >
                                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 dark:bg-primary/20">
                                            <Info className="h-4 w-4 text-primary"/>
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-sm font-medium">Get Info</div>
                                            <div className="text-xs text-muted-foreground">View file details</div>
                                        </div>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                        onClick={() => {/* Copy functionality to be implemented */}}
                                        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent/50 transition-colors"
                                    >
                                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/50">
                                            <Copy className="h-4 w-4 text-blue-600 dark:text-blue-400"/>
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-sm font-medium">Copy</div>
                                            <div className="text-xs text-muted-foreground">Copy to clipboard</div>
                                        </div>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                        onClick={() => {/* Move functionality to be implemented */}}
                                        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent/50 transition-colors"
                                    >
                                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/50">
                                            <Move className="h-4 w-4 text-amber-600 dark:text-amber-400"/>
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-sm font-medium">Move</div>
                                            <div className="text-xs text-muted-foreground">Move to location</div>
                                        </div>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                        onClick={handleDelete}
                                        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-destructive/10 text-destructive transition-colors"
                                    >
                                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/50">
                                            <Trash className="h-4 w-4 text-red-600 dark:text-red-400"/>
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-sm font-medium">Delete</div>
                                            <div className="text-xs text-muted-foreground">Remove permanently</div>
                                        </div>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>
                </div>
            )}

            {/* This is where files and folders are displayed in a grid */}
            <div
                ref={containerRef}
                className="relative flex-1 bg-white dark:bg-slate-900 pt-2 px-4 pb-4 overflow-y-auto"
                onMouseDown={handleMouseDown}
            >
                {/* Selection box for multi-select */}
                <div
                    ref={selectionBoxRef}
                    className="absolute border-2 border-blue-500 bg-blue-500/20 z-10 pointer-events-none rounded-sm"
                />


                {/* Display loading indicator when opening browser or loading files */}
                {isOpeningBrowser ? (
                        <div className="flex justify-center items-center h-full">
                            <RefreshCw className="h-8 w-8 text-blue-400 animate-spin"/>
                        </div>
                ) : (
                    isLoading ? (
                        /* Loading spinner when loading folder contents */
                        <div className="flex justify-center items-center h-full">
                            <RefreshCw className="h-8 w-8 text-blue-400 animate-spin"/>
                        </div>
                    ) : sortedItems.length > 0 ? (

                        /* Grid of files and folders when there are items to show */
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(95px,1fr))] gap-2">
                            
                            {/* Loop through each file/folder and create a display item */}
                            {sortedItems.map((item) => {
                                const IconComponent = getFileIcon(item.name, item.isDirectory);
                                const iconColor = getIconColor(item.name, item.isDirectory, false, BoxDrag.target?.boxId === Number(item.id));
                                
                                return (
                                    /* Individual file/folder item */
                                    <div
                                        key={item.id}

                                        /* Store reference to this element for selection and drag operations */
                                        ref={(el) => {
                                            if (el) itemRefs.current.set(item.id, el)
                                            else itemRefs.current.delete(item.id)
                                        }}

                                        /* Handle clicks (single for selection, double for opening) */
                                        onClick={(e) => handleItemClick(e, item)}

                                        /* Handle drag start when mouse is pressed */
                                        onMouseDown={(e) => handleItemMouseDown(e, item)}

                                        className={cn(
                                            // Base styles for all file items
                                            "file-item flex flex-col items-center justify-center w-25 h-25 rounded-md cursor-pointer transition-all hover:bg-slate-100 dark:hover:bg-slate-800 ",
                                            
                                            // Basic hover styles when not in box-to-box transfer mode
                                            !isBoxToBoxTransfer
                                                    ? "hover:bg-slate-100 dark:hover:bg-slate-700 border border-transparent"
                                                    : "border border-transparent",
                                            // Add hover effect when dragging
                                            BoxDrag.isDragging && !draggedItemsRef.current.includes(item.id) && BoxDrag.sourceBoxId == boxId &&
                                                "hover:ring-2 hover:ring-green-500 hover:bg-green-100 dark:hover:bg-green-900/30",
                                            
                                            // Dragged items opacity
                                            draggedItemsRef.current.includes(item.id) && BoxDrag.isDragging && "opacity-50",
                                        )}
                                    >
                                        {/* Icon container */}
                                        <div className="w-12 h-12 flex items-center justify-center mb-2">
                                            <IconComponent
                                                className={cn("h-10 w-10", iconColor)}
                                            />
                                        </div>

                                        {/* File/folder name */}
                                        <span
                                            className={cn(
                                                "block w-full px-1 text-xs leading-tight text-center",
                                                "break-all line-clamp-2 min-h-[2.5rem]",
                                                "text-slate-800 dark:text-slate-200",

                                                // Highlight text when this item is a drop target
                                                BoxDrag.target?.boxId === Number(item.id) && "text-green-700 dark:text-green-300",
                                            )}
                                            title={item.name}
                                        >{item.name}</span>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        /* Empty folder message when no files are found */
                        <div
                            className="flex flex-col items-center justify-center h-full text-slate-800 dark:text-slate-200">
                            <FolderIcon className="w-16 h-16 mb-4 opacity-30"/>
                            <p>This folder is empty</p>
                        </div>
                    )
                )}
            </div>

                    {/* File statistics dialog - shows detailed info about selected files */}
            <FileStatsDialog />
        </div>
    )
});