/*
TODO
Fix id (BoxDrag.target?.boxId) number vs string with item.id 
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
    Box,
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
import { Progress } from "./ui/progress"
import {useBoxDrag} from "@/contexts/BoxDragContext";
import { postFile } from "src/main/cloud/cloudManager"
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
import { showAreYouSure } from "@/pages/HomePage"

interface FileExplorerProps {
    cloudType?: CloudType
    accountId?: string
    zoomLevel: number
    tempPostFile?: (parentPath: string, cloudType?: CloudType, accountId?: string) => void
    tempGetFile?: (filePaths: string[], cloudType?: CloudType, accountId?: string) => void
    boxId: number
    isBoxToBoxTransfer?: boolean
    refreshToggle?: boolean // to refresh the state of the file explorer
    onCurrentPathChange?: (currentPath: string) => void
}


const getFileIcon = (fileName: string, isDirectory: boolean = false) => {
    if (isDirectory) {
        const folderName = fileName.toLowerCase();
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
        return FolderIcon;
    }

    const ext = fileName.toLowerCase().split('.').pop() || '';

    if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt'].includes(ext)) return Code;
    if (['html', 'htm', 'css', 'scss', 'sass', 'less'].includes(ext)) return Globe;
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico', 'tiff', 'raw'].includes(ext)) return FileImage;
    if (['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v', '3gp'].includes(ext)) return FileVideo;
    if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a', 'opus'].includes(ext)) return FileAudio;
    if (['pdf', 'doc', 'docx', 'rtf', 'odt', 'pages'].includes(ext)) return BookOpen;
    if (['txt', 'md', 'markdown', 'readme', 'log', 'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg'].includes(ext)) return FileText;
    if (['xls', 'xlsx', 'csv', 'ods', 'numbers'].includes(ext)) return FileSpreadsheet;
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'deb', 'rpm', 'dmg', 'iso'].includes(ext)) return Archive;
    if (['exe', 'msi', 'app', 'deb', 'rpm', 'dmg', 'pkg', 'run', 'bin'].includes(ext)) return Zap;
    if (['db', 'sqlite', 'sql', 'mdb', 'accdb'].includes(ext)) return Database;
    if (['psd', 'ai', 'sketch', 'fig', 'xd', 'indd'].includes(ext)) return Palette;
    if (['dll', 'sys', 'so', 'dylib'].includes(ext)) return Cpu;
    if (['eml', 'msg', 'pst'].includes(ext)) return Mail;
    if (['ics', 'ical'].includes(ext)) return Calendar;
    if (['enc', 'gpg', 'p7s', 'p12', 'pfx', 'key', 'pem', 'crt'].includes(ext)) return Lock;

    return FileIcon;
};

const getIconColor = (fileName: string, isDirectory: boolean = false, isSelected: boolean = false, isDropTarget: boolean = false) => {
    if (isDropTarget) return "text-green-500";
    if (isSelected) return "text-blue-500";

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
        return "text-blue-400";
    }

    const ext = fileName.toLowerCase().split('.').pop() || '';

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
    if (['html', 'htm'].includes(ext)) return "text-orange-400";
    if (['css', 'scss', 'sass', 'less'].includes(ext)) return "text-blue-400";
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico'].includes(ext)) return "text-pink-400";
    if (['mp4', 'avi', 'mkv', 'mov', 'wmv'].includes(ext)) return "text-red-400";
    if (['mp3', 'wav', 'flac', 'aac'].includes(ext)) return "text-orange-400";
    if (['pdf'].includes(ext)) return "text-red-500";
    if (['doc', 'docx'].includes(ext)) return "text-blue-500";
    if (['xls', 'xlsx'].includes(ext)) return "text-green-500";
    if (['zip', 'rar', '7z', 'tar'].includes(ext)) return "text-yellow-500";
    if (['exe', 'msi', 'app'].includes(ext)) return "text-red-500";

    return "text-gray-400";
};


export const FileExplorer = memo(function FileExplorer ({zoomLevel, cloudType, accountId, tempPostFile, tempGetFile, boxId, isBoxToBoxTransfer = false, refreshToggle, onCurrentPathChange}: FileExplorerProps) {
    const [items, setItems] = useState<FileSystemItem[]>([])
    const [cwd, setCwd] = useState<string>("")
    const [history, setHistory] = useState<string[]>([])
    const [historyIndex, setHistoryIndex] = useState(-1)
    const [searchQuery, setSearchQuery] = useState("")
    const [isLoading, setIsLoading] = useState(true)
    const [currentPath, setCurrentPath] = useState<string[]>([])
    const [showHidden, setShowHidden] = useState(false)
    // const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
    const selectedItemsRef = useRef<Set<string>>(new Set())
    // const [lastSelectedItem, setLastSelectedItem] = useState<string | null>(null)
    const lastSelectedItemRef = useRef<string | null>(null)
    // const [isSelecting, setIsSelecting] = useState(false)
    const isSelectingRef = useRef(false)
    const selectionStartRef = useRef({x: 0, y: 0})
    const selectionStartViewRef = useRef({scrollTop: 0});
    const selectionBoxRef = useRef<HTMLDivElement | null>(null);
    // const [isAdditiveDrag, setIsAdditiveDrag] = useState(false);
    const isAdditiveDragRef = useRef(false);
    const [isOpeningBrowser, setIsOpeningBrowser] = useState(false);

    const selectionSnapshotRef = useRef<Set<string>>(new Set());
    const [containerWidth, setContainerWidth] = useState(0);

    const containerRef = useRef<HTMLDivElement>(null)
    const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())
    const dragStartPosRef = useRef({x: 0, y: 0})
    const mouseOffsetRef = useRef({x: 0, y: 0})
    const draggedItemsRef = useRef<string[]>([])

    const BoxDrag = useBoxDrag();

    const throttleTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const boxDragTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const localDragStartedRef = useRef<boolean>(false)
    const localIsDraggingRef = useRef<boolean>(false)
    const localTargetRef = useRef<{ boxId: number; targetPath: string, targetId?: string } | null>(null)

    const filteredItems = searchQuery
        ? items.filter(
            (item) =>
                item.name.toLowerCase().includes(searchQuery.toLowerCase()) && (showHidden || !item.name.startsWith(".")),
        )
        : items.filter((item) => showHidden || !item.name.startsWith("."))

    const sortedItems = [...filteredItems].sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
    })

    const [showStatsDialog, setShowStatsDialog] = useState(false);
    const [selectedFileForStats, setSelectedFileForStats] = useState<FileSystemItem | null>(null);
    const [isCalculatingSize, setIsCalculatingSize] = useState(false);
    const [folderSize, setFolderSize] = useState<number | null>(null);


    useEffect(() => {
        const fetchHome = async () => {
            // cloud home directory
            if (cloudType && accountId) {
                console.log("Fetching home directory from cloud account:", cloudType, accountId);
                console.log("Current directory:", cwd);
                setCwd(CLOUD_HOME)
                setHistory([CLOUD_HOME])
                setHistoryIndex(0)
            } else {
                // local home directory
                const homePath = await window.fsApi.getHome()
                setCwd(homePath)
                setHistory([homePath])
                setHistoryIndex(0)
            }
        }

        fetchHome().then(r => console.log("Directory fetched"))
    }, [])

    useEffect(() => {
        const updateWidth = () => {
            if (containerRef.current) {
                setContainerWidth(containerRef.current.offsetWidth);
            }
        };

        updateWidth();

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerWidth(entry.contentRect.width);
            }
        });

        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        // Also listen to window resize as fallback
        window.addEventListener('resize', updateWidth);
        
        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', updateWidth);
        };
    }, []);

    useEffect(() => {
        if (!cwd || cwd === "") 
             return

        console.log("Reading directory:", cwd)
        setIsLoading(true)
        // Notify parent about current path change for drag box-to-box
        if (onCurrentPathChange) {
            onCurrentPathChange(cwd)
        }

        if (cloudType && accountId) {
            // Fetch files from the cloud account
            (window as any).cloudFsApi.readDirectory(cloudType, accountId, cwd)
                .then((files: FileSystemItem[]) => {
                    setItems(files)
                    updatePathSegments(cwd)
                    setIsLoading(false)
                    // setSelectedItems(new Set())
                    selectedItemsRef.current = new Set()
                    lastSelectedItemRef.current = null
                })
                .catch((err: Error) => {
                    console.error(err)
                    setIsLoading(false)
                })
        } else {
            // Fetch files from the local directory
            window.fsApi
                .readDirectory(cwd)
                .then((files) => {
                    setItems(files)
                    updatePathSegments(cwd)
                    setIsLoading(false)
                    // setSelectedItems(new Set())
                    selectedItemsRef.current = new Set()
                    lastSelectedItemRef.current = null
                })
                .catch((err) => {
                    console.error(err)
                    setIsLoading(false)
                })
        }
        updateSelectedItemsColor();
    }, [cwd])

    useEffect(() => {
        if (cwd === "") {
            console.error("Current working directory is empty, cannot refresh")
            return
        }
        console.log("Refreshing directory due to refreshState prop change");
        
        refreshDirectory();
    }, [refreshToggle])

    // This can be in each file explorer component, 
    // since it gets the file content and open it, 
    // instead of saving it for uploading to other window later
    const openFile = async (e: React.MouseEvent, item: FileSystemItem) => {
        e.preventDefault();
        setIsOpeningBrowser(true);
        let fileContent: FileContent | null = null;
        if (!cloudType || !accountId) {
            // For local file system, just pass the current
            console.log("Opening local file:", item.path);
            fileContent =  await (window as any).fsApi.getFile(item.path);
        } else {
            console.log("Opening cloud file:", item.path);
            fileContent = await (window as any).cloudFsApi.getFile(cloudType, accountId, item.path);
        }

        if (!fileContent) {
            console.log("No file content to open");
            return;
        }
        console.log("Opening file:", fileContent);
        if (fileContent.url) {
            const response = await (window as any).electronAPI.openExternalUrl(fileContent.url);
            if (response && response.success) {
                console.log("File URL opened successfully:", fileContent.url);
            } else {
                console.error("Failed to open file URL:", fileContent.url, response?.error);
            }
        } else {
            console.log("File URL is undefined, create blob URL instead");
            // Create a blob URL for the file content
            if (!fileContent.content) {
                console.error("File content is undefined, cannot create blob URL");
                return;
            }
            const isTextFile = ['.txt', '.csv', '.py', '.json', '.log'].some(ext => item.path.endsWith(ext));
            const blob = new Blob(
                [fileContent.content],
                { type: isTextFile ? 'text/plain' : fileContent.type }
            );
            const response = await (window as any).electronAPI.openFile(fileContent);
            console.log( "File opened successfully:", fileContent.path, response);
        }
        setIsOpeningBrowser(false);
    }


    const updatePathSegments = (path: string) => {
        // Split path into segments
        const segments = path.split(/[/\\]/).filter(Boolean)
        setCurrentPath(segments)
        console.log("Current path segments:", segments)
    }

    const navigateTo = (path: string) => {
        console.log("Navigating to:", path)
        // Add to history
        const newHistory = history.slice(0, historyIndex + 1)
        newHistory.push(path)
        setHistory(newHistory)
        setHistoryIndex(newHistory.length - 1)
        setCwd(path)
    }

    const navigateBack = () => {
        if (historyIndex > 0) {
            setHistoryIndex(historyIndex - 1)
            setCwd(history[historyIndex - 1])
        }
    }

    const navigateForward = () => {
        if (historyIndex < history.length - 1) {
            setHistoryIndex(historyIndex + 1)
            setCwd(history[historyIndex + 1])
        }
    }

    const goToHome = async () => {
        if (cloudType && accountId) {
            console.log("Navigating to home directory of cloud account:", cloudType, accountId);
            navigateTo(CLOUD_HOME)
        } else {
            console.log("Navigating to local home directory");
            const homePath = window.fsApi.getHome()
            navigateTo(homePath)
        }
    }

    const navigateUp = () => {
        const parentPath = cwd.split("/").slice(0, -1).join("/") || "/"
        navigateTo(parentPath)
    }

    const refreshDirectory = async () => {
        setIsLoading(true)
        if (cloudType && accountId) {
            // Fetch files from the cloud account
            (window as any).cloudFsApi.readDirectory(cloudType, accountId, cwd)
                .then((files: FileSystemItem[]) => {
                    setItems(files)
                    updatePathSegments(cwd)
                    setIsLoading(false)
                    // setSelectedItems(new Set())
                    selectedItemsRef.current = new Set()
                    lastSelectedItemRef.current = null
                })
                .catch((err: Error) => {
                    console.error(err)
                    setIsLoading(false)
                })
        } else {
            // Fetch files from the local directory
            console.log("Refreshing directory:", cwd)
            if (!cwd || cwd === "") {
                console.error("Current working directory is empty, cannot refresh")
                setIsLoading(false)
                return
            }
            window.fsApi
                .readDirectory(cwd)
                .then((files) => {
                    setItems(files)
                    updatePathSegments(cwd)
                    setIsLoading(false)
                    // setSelectedItems(new Set())
                    selectedItemsRef.current = new Set()
                    lastSelectedItemRef.current = null
                })
                .catch((err) => {
                    console.error(err)

                    setIsLoading(false)
                })
        }
        updateSelectedItemsColor();
    }

    const updateSelectedItemsColor = () => {
        itemRefs.current.forEach((element, id) => {
            if (!element) return;
            element.classList.toggle("selected", selectedItemsRef.current.has(id));
        });
    };


    const handleItemClick = (e: React.MouseEvent, item: FileSystemItem) => {
        // Double click to navigate into directory
        if (e.detail === 2) {
            if (!item.isDirectory) {
                openFile(e, item)
            } else {
                navigateTo(item.path)
            }
            return
        }


        const ctrlOrMeta = e.ctrlKey || e.metaKey;

        if (e.shiftKey && lastSelectedItemRef.current) {
            const itemsPathList = sortedItems.map((i) => i.id); // TODO item path list to item id list?
            const currentIndex = itemsPathList.indexOf(item.id); // TODO
            const lastIndex = itemsPathList.indexOf(lastSelectedItemRef.current);

            if (currentIndex !== -1 && lastIndex !== -1) {
                const start = Math.min(currentIndex, lastIndex);
                const end = Math.max(currentIndex, lastIndex);
                const newSelectedItemsUpdate = ctrlOrMeta ? new Set(selectedItemsRef.current) : new Set<string>();

                for (let i = start; i <= end; i++) {
                    newSelectedItemsUpdate.add(itemsPathList[i]);
                }

                if (ctrlOrMeta) {
                    const rangeSelection = new Set<string>();
                    for (let i = start; i <= end; i++) {
                        rangeSelection.add(itemsPathList[i]);
                    }
                    // setSelectedItems(prev => new Set([...prev, ...rangeSelection]));
                    selectedItemsRef.current = new Set([...selectedItemsRef.current, ...rangeSelection]);
                } else {
                    const rangeSelection = new Set<string>();
                    for (let i = start; i <= end; i++) {
                        rangeSelection.add(itemsPathList[i]);
                    }
                    // setSelectedItems(rangeSelection);
                    selectedItemsRef.current = rangeSelection;
                }

            }
        } else if (ctrlOrMeta) {
            const newSelectedItemsUpdate = new Set(selectedItemsRef.current);
            if (newSelectedItemsUpdate.has(item.id)) {
                newSelectedItemsUpdate.delete(item.id);
            } else {
                newSelectedItemsUpdate.add(item.id);
            }
            // setSelectedItems(newSelectedItemsUpdate);
            selectedItemsRef.current = newSelectedItemsUpdate;
            lastSelectedItemRef.current = item.id;
        } else {
            // setSelectedItems(new Set([item.id]));
            selectedItemsRef.current = new Set([item.id]);
            lastSelectedItemRef.current = item.id;
        }

        updateSelectedItemsColor();

    }


    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest(".file-item") || e.button !== 0) {
            return;
        }
        console.log("Mouse down on container, starting selection box");
        isSelectingRef.current = true;
        selectionBoxRef.current!.style.display = "block";

        const additive = e.ctrlKey || e.metaKey;
        isAdditiveDragRef.current = additive;

        if (!additive) {
            // setSelectedItems(new Set());
            selectedItemsRef.current = new Set();
            selectionSnapshotRef.current = new Set();
        } else {
            selectionSnapshotRef.current = new Set(selectedItemsRef.current);

        }

        const container = containerRef.current;
        if (!container) return;

        //The x and y values calculated here are in pixels and are relative to the top-left corner of rect (i.e., the container).
        const rect = container.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width - 1, e.clientX - rect.left));
        const y = Math.max(0, Math.min(rect.height - 1, e.clientY - rect.top));

        selectionStartRef.current = {
            x: x,
            y: y
        };
        selectionStartViewRef.current = {
            scrollTop: container.scrollTop
        };
        updateSelectedItemsColor();

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

    const updateSelectedItemsFromBox = useCallback((box: {
        left: number;
        top: number;
        width: number;
        height: number
    }) => {
        if (!isSelectingRef.current || !containerRef.current) return;

        const itemsCurrentlyInBox = new Set<string>();
        const containerRect = containerRef.current.getBoundingClientRect();

        const selectionBox = {
            left: box.left,
            top: box.top,
            right: box.left + box.width,
            bottom: box.top + box.height,
        };

        itemRefs.current.forEach((element, id) => {
            if (!element) return;
            if (!containerRef.current) return;

            const itemRect = element.getBoundingClientRect();

            // Convert item rect to container-relative coordinates
            const relativeItemRect = {
                left: itemRect.left - containerRect.left,
                top: itemRect.top - containerRect.top + containerRef.current.scrollTop,
                right: itemRect.right - containerRect.left,
                bottom: itemRect.bottom - containerRect.top + containerRef.current.scrollTop,
            };

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

        // setSelectedItems(isAdditiveDrag
        //     ? new Set([...selectionSnapshotRef.current, ...itemsCurrentlyInBox])
        //     : itemsCurrentlyInBox
        // );
        selectedItemsRef.current = isAdditiveDragRef.current
            ? new Set([...selectionSnapshotRef.current, ...itemsCurrentlyInBox])
            : itemsCurrentlyInBox;
        
        updateSelectedItemsColor();
    }, [isSelectingRef.current, isAdditiveDragRef.current]);

    const updateSelectionBox = useCallback((currentX: number, currentY: number) => {
        if (!containerRef.current) return;

        // Account for zoom level in calculations
        const zoomAdjustedBox = {
            left: (Math.min(selectionStartRef.current.x, currentX)) / zoomLevel,
            top: (Math.min(selectionStartRef.current.y + selectionStartViewRef.current.scrollTop * zoomLevel, currentY + containerRef.current.scrollTop * zoomLevel)) / zoomLevel,
            width: Math.abs(currentX - selectionStartRef.current.x) / zoomLevel,
            height: Math.abs(selectionStartRef.current.y + selectionStartViewRef.current.scrollTop * zoomLevel - (currentY + containerRef.current.scrollTop * zoomLevel)) / zoomLevel
        };

        selectionBoxRef.current!.style.left = `${zoomAdjustedBox.left}px`;
        selectionBoxRef.current!.style.top = `${zoomAdjustedBox.top}px`;
        selectionBoxRef.current!.style.width = `${zoomAdjustedBox.width}px`;
        selectionBoxRef.current!.style.height = `${zoomAdjustedBox.height}px`;

        updateSelectedItemsFromBox(zoomAdjustedBox);
    }, [selectionStartRef.current, zoomLevel]);

    const handleMouseMove = useCallback((e: React.MouseEvent | MouseEvent) => {
        if (!isSelectingRef.current || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        // The x and y of mouse position values calculated here are in pixels and are relative to the top-left corner of rect (i.e., the container).
        const currentX = Math.max(0, Math.min(rect.width - 1, e.clientX - rect.left));
        const currentY = Math.max(0, Math.min(rect.height - 1, e.clientY - rect.top));

        const scrollThreshold = 50;
        const scrollAmount = 5;
        if (e.clientY < rect.top + scrollThreshold) {
            containerRef.current.scrollTop -= scrollAmount;
        } else if (e.clientY > rect.bottom - scrollThreshold) {
            containerRef.current.scrollTop += scrollAmount;
        }
        updateSelectionBox(currentX, currentY);

    }, [isSelectingRef.current, updateSelectedItemsFromBox, selectionStartRef.current.x, selectionStartRef.current.y]);


    const handleMouseUp = () => {
        if (isSelectingRef.current) {
            isSelectingRef.current = false;
            selectionBoxRef.current!.style.display = "none";
        }
    }

    const handleItemMouseDown = (e: React.MouseEvent, item: FileSystemItem) => {
        if (e.button !== 0) return;


        dragStartPosRef.current = {x: e.clientX, y: e.clientY}

        const itemElement = itemRefs.current.get(item.id)
        if (itemElement) {
            const rect = itemElement.getBoundingClientRect()
            mouseOffsetRef.current = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            }
        }

        let itemsToDrag: string[]
        if (selectedItemsRef.current.has(item.id)) {
            itemsToDrag = Array.from(selectedItemsRef.current)
        } else {
            itemsToDrag = [item.id]
            selectedItemsRef.current = new Set([item.id])
            lastSelectedItemRef.current = item.id
        }

        draggedItemsRef.current = itemsToDrag

        document.addEventListener("mousemove", handleItemMouseMove)
        document.addEventListener("mouseup", handleItemMouseUp)
    }

    const resetTarget = () => {
        console.log("Mouse is outside container, no drop target")
        BoxDrag.setTarget({ boxId: -1, targetPath: "" });
        localTargetRef.current = null;
    }

    const handleItemMouseMove = (e: MouseEvent) => {
        if (!localDragStartedRef.current && !localIsDraggingRef.current) {
            console.log("Not dragging, checking for drag start")
            const dx = e.clientX - dragStartPosRef.current.x
            const dy = e.clientY - dragStartPosRef.current.y
            const distance = Math.sqrt(dx * dx + dy * dy)
            if (distance > 5) {
                console.log("Drag started, setting isDragging to true")
                BoxDrag.setIsDragging(true);
                localIsDraggingRef.current = true;
                localDragStartedRef.current = true;
                // TODO maybe implement saving the dragged items to a ref and load the contents of them here?

                // Start box drag with the dragged items
                const draggedFileItems = sortedItems.filter(item =>
                    draggedItemsRef.current.includes(item.id)
                );
                BoxDrag.setDragItems(
                    draggedFileItems,
                    boxId,
                    cloudType,
                    accountId
                );
                console.log("Box drag started with items:", draggedFileItems.map(item => item.path));
                tempGetFile?.(draggedFileItems.map(item => item.path), cloudType, accountId);
                // tempGetFile?.(draggedFileItems.map(item => item.path).join(","), cloudType, accountId);
            } else {
                console.log("Distance TOoooooooooooooooooooo short:", distance)
                return
            }
        }

        if (throttleTimeoutRef.current) {
            clearTimeout(throttleTimeoutRef.current)
        }

        throttleTimeoutRef.current = setTimeout(() => {
            if (!containerRef.current || !localIsDraggingRef.current) return

            const containerRect = containerRef.current.getBoundingClientRect()
            const relativeX = e.clientX - containerRect.left
            const relativeY = e.clientY - containerRect.top + containerRef.current.scrollTop

            const isWithinContainer = e.clientX >= containerRect.left &&
                e.clientX <= containerRect.right &&
                e.clientY >= containerRect.top &&
                e.clientY <= containerRect.bottom;

            if (isWithinContainer) {
                console.log("Mouse is within container, checking for drop target")
                let foundDropTarget = false
                for (const item of sortedItems) {
                    if (draggedItemsRef.current.includes(item.id)) continue

                    const itemElement = itemRefs.current.get(item.id)
                    if (!itemElement) continue

                    const itemRect = itemElement.getBoundingClientRect()
                    const itemLeft = itemRect.left - containerRect.left
                    const itemTop = itemRect.top - containerRect.top + containerRef.current.scrollTop
                    const itemRight = itemLeft + itemRect.width
                    const itemBottom = itemTop + itemRect.height

                    if (relativeX >= itemLeft && relativeX <= itemRight &&
                        relativeY >= itemTop && relativeY <= itemBottom) {
                        console.log("Mouse is over item:", item.name)
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
                    if (!foundDropTarget) {
                        resetTarget();
                    }
                }
            } else {
                resetTarget();
            }

            const scrollThreshold = 60
            const scrollAmount = 10

            if (e.clientY < containerRect.top + scrollThreshold) {
                containerRef.current.scrollTop -= scrollAmount
            } else if (e.clientY > containerRect.bottom - scrollThreshold) {
                containerRef.current.scrollTop += scrollAmount
            }
        }, 16)
    }


    const handleItemMouseUp = async () => {
        // TODO maybe implement removing the ref for dragged items?
        document.removeEventListener("mousemove", handleItemMouseMove)
        document.removeEventListener("mouseup", handleItemMouseUp)

        if (throttleTimeoutRef.current) {
            clearTimeout(throttleTimeoutRef.current)
            throttleTimeoutRef.current = null
        }

        const currentBoxDragState = {
            isDragging: BoxDrag.isDragging,
            target: BoxDrag.target,
            dragItems: BoxDrag.dragItems
        };

        console.log("Box drag state on mouse up:", currentBoxDragState);

        // Temporal variable to store the drag state before resetting it
        // const wasDragStarted = BoxDrag.dragStarted;

        // Check if this was actually a drag that should trigger a move
        if (localIsDraggingRef.current &&
            localTargetRef.current) {

            const itemsToMove = draggedItemsRef.current

            console.log(`Moving ${itemsToMove.length} items to ${localTargetRef.current.targetPath || "unknown target"}`)
            console.log("Items to move:", itemsToMove)

            const targetItem = sortedItems.find((item) => item.id === String(localTargetRef.current?.targetId));
            if (targetItem && targetItem.isDirectory) {
                console.log(`Target directory detected: ${targetItem.path}`)
                // implement the actual move TODO
                await tempPostFile?.(targetItem.path, cloudType, accountId);
                
                refreshDirectory(); // Refresh the directory after moving files
                // TODO Clear the fileCache in the HomePage?
            } else if (targetItem && !targetItem.isDirectory) {
                console.log(`Target file detected: ${targetItem.name}`)
                tempPostFile?.(targetItem.path, cloudType, accountId)
                // implement the actual creating of folder and move both files?
            }
        } else {
            console.log("No inner drag operation")
        }

        // Reset all drag states for inner drag
        // setIsDragging(false)
        // setDraggedItem(null)
        // setDraggedItems([])
        // setDropTarget(null)
        // dragStateRef.current = {
        //     isDragging: false,
        //     dragStarted: false,
        //     dropTarget: null,
        //     lastDropTarget: null
        // }

        //Box to box cleanup
        if (localIsDraggingRef.current) {

            // Check if this was a drop (if we have a valid drop target)
            const hasValidDropTarget = BoxDrag.target !== null;

            if (hasValidDropTarget) {
                boxDragTimeoutRef.current = setTimeout(() => {
                    if (BoxDrag.isDragging) {
                        // BoxDrag.endBoxDrag();
                        // BoxDrag.setDragItems([], null);
                        // BoxDrag.setIsDragging(false);
                    }
                    boxDragTimeoutRef.current = null;
                }, 100);
            } else {
                // BoxDrag.endBoxDrag();
                // BoxDrag.setDragItems([], null);
                // BoxDrag.setIsDragging(false);
            }
        } else if (BoxDrag.isDragging) {
            // BoxDrag.endBoxDrag();
            // BoxDrag.setDragItems([], null);
            // BoxDrag.setIsDragging(false);
        } else {
            console.log("No box drag operation to end, resetting state");
            return;
        }
        BoxDrag.setDragItems([], null);
        BoxDrag.setIsDragging(false);
        localDragStartedRef.current = false;
        localIsDraggingRef.current = false;
        localTargetRef.current = null;
    }

    const handleSelectionEnd = () => {
        isSelectingRef.current = false;

        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleSelectionEnd);
    }

    useEffect(() => {
        return () => {
            document.removeEventListener("mousemove", handleItemMouseMove);
            document.removeEventListener("mouseup", handleItemMouseUp);
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleSelectionEnd)
            if (throttleTimeoutRef.current) {
                clearTimeout(throttleTimeoutRef.current)
            }
            if (boxDragTimeoutRef.current) {
                clearTimeout(boxDragTimeoutRef.current)
            }
            if (BoxDrag.isDragging) {
                // BoxDrag.endBoxDrag();
                BoxDrag.setDragItems([], null);
                BoxDrag.setIsDragging(false);
            }
        }
    }, [])

    useEffect(() => {
        const handleKeyDown = async (e: KeyboardEvent) => {
            // Ctrl+A or Cmd+A:
            if ((e.ctrlKey || e.metaKey) && e.key === "a") {
                e.preventDefault()
                const allItems = new Set(sortedItems.map((item) => item.id))
                // setSelectedItems(allItems)
                selectedItemsRef.current = allItems;
            }

            if (e.key === "Escape") {
                // setSelectedItems(new Set())
                selectedItemsRef.current = new Set();
                lastSelectedItemRef.current = null;
                if (BoxDrag.isDragging) {
                    // setIsDragging(false)
                    // setDraggedItem(null)
                    // setDraggedItems([])
                    // setDropTarget(null)


                    if (boxDragTimeoutRef.current) {
                        clearTimeout(boxDragTimeoutRef.current)
                        boxDragTimeoutRef.current = null
                    }


                    if (BoxDrag.isDragging) {
                        // BoxDrag.endBoxDrag();
                        BoxDrag.setDragItems([], null);
                        BoxDrag.setIsDragging(false);
                    }
                }
                if (isSelectingRef.current) {
                    isSelectingRef.current = false;
                }
            }

            // Delete
            if (e.key === "Delete" && selectedItemsRef.current.size > 0) {
                console.log("Delete selected items:", Array.from(selectedItemsRef.current));
            }
        }

        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [selectedItemsRef.current, BoxDrag.isDragging, isSelectingRef.current, sortedItems])


    async function handleDelete() {
        if (selectedItemsRef.current.size === 0) return;

        try {
            await showAreYouSure()
        } catch (error) {
            console.log("User cancelled the delete operation");
            return;
        }

        console.log("Delete selected items:", Array.from(selectedItemsRef.current));

        try {
            // Wait for all delete operations to complete
            await Promise.all(
                Array.from(selectedItemsRef.current).map(async (itemId) => {
                    const item = sortedItems.find((i) => i.id === itemId);
                    if (!item) return;
                    
                    console.log("Deleting item:", item.path);
                    if (!cloudType || !accountId) {
                        // For local file system
                        await (window as any).fsApi.deleteFile(item.path);
                    } else {
                        await (window as any).cloudFsApi.deleteFile(
                            cloudType, 
                            accountId, 
                            item.path
                        );
                    }
                })
            );
    
            // Only refresh after all deletions are complete
            await refreshDirectory();
            
            // Clear selection after successful deletion
            selectedItemsRef.current = new Set();
        } catch (error) {
            console.error("Error deleting items:", error);
            // Handle error (maybe show error message to user)
        }
    }


    const calculateFolderSize = async (folderPath: string): Promise<number> => {
        try {
            if (cloudType && accountId) {
                const files = await (window as any).cloudFsApi.readDirectory(cloudType, accountId, folderPath);
                let totalSize = 0;
                
                // Process files in batches
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
                    
                    batchSizes.forEach((result) => {
                        if (result.status === 'fulfilled') {
                            totalSize += result.value;
                        }
                    });
                }
                return totalSize;
            } else {
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

    const showFileStats = async () => {
        if (selectedItemsRef.current.size === 0) return;

        const firstSelectedId = Array.from(selectedItemsRef.current)[0];
        const selectedFile = sortedItems.find(item => item.id === firstSelectedId);
        
        if (!selectedFile) return;
        
        setSelectedFileForStats(selectedFile);
        setShowStatsDialog(true);
        
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

    // File stats dialog component
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

        const getFileExtension = (fileName: string) => {
            const ext = fileName.split('.').pop();
            return ext && ext !== fileName ? ext.toUpperCase() : 'Unknown';
        };

        const formatFileSize = (bytes?: number): string => {
            if (!bytes || bytes === 0) return "0 B";
    
            const sizes = ["B", "KB", "MB", "GB", "TB"];
            const i = Math.floor(Math.log(bytes) / Math.log(1024));
            const size = bytes / Math.pow(1024, i);
    
            return `${size.toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
        };
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

        const getItemSize = () => {
            if (item.isDirectory) {
                if (isCalculatingSize) {
                    return "Calculating...";
                }
                return folderSize !== null ? formatFileSize(folderSize) : "Unknown";
            }
            return formatFileSize(item.size);
        };

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
                <DialogContent className="max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl">
                    <DialogHeader className="space-y-4">
                        <div className="flex items-center gap-4">
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

                        {/* Detailed Information */}
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



    const selectedCount = selectedItemsRef.current.size

    return (
        <div className="flex h-full w-full flex-col text-white rounded-lg overflow-hidden select-none">
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

            {/* Toolbar */}
            <div className="flex items-center gap-1 p-4 bg-white dark:bg-slate-800">
                <Button
                    onClick={goToHome}
                    className="p-2 rounded-md hover:bg-slate-100 text-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                    <Home className="h-5 w-5"/>
                </Button>

                <Button
                    onClick={navigateUp}
                    className="p-2 rounded-md hover:bg-slate-100 text-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                    <ArrowUp className="h-5 w-5"/>
                </Button>

                <Button
                    onClick={navigateBack}
                    disabled={historyIndex <= 0}
                    className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <ChevronLeft className="h-5 w-5"/>
                </Button>

                <Button
                    onClick={navigateForward}
                    disabled={historyIndex >= history.length - 1}
                    className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <ChevronRight className="h-5 w-5"/>
                </Button>

                <Button
                    onClick={refreshDirectory}
                    className={`p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 ${isLoading ? "animate-spin" : ""}`}
                >
                    <RefreshCw className="h-5 w-5"/>
                </Button>

                <Button
                    onClick={() => setShowHidden(!showHidden)}
                    className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200"
                    title={showHidden ? "Hide hidden files" : "Show hidden files"}
                >
                    {showHidden ? <EyeOff className="h-5 w-5"/> : <Eye className="h-5 w-5"/>}
                </Button>

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
                        {selectedCount > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 backdrop-blur-sm selected-menu-enter">
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
                    
                    <div className="ml-auto flex gap-2">
                        {containerWidth >= 600 ? (
                            <>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex items-center gap-2 text-xs font-medium text-black dark:text-white transition-all duration-200 action-button"
                                    onClick={showFileStats}
                                >
                                    <Info className="h-3.5 w-3.5"/>
                                    Get Info
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex items-center gap-2 text-xs font-medium border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 transition-all duration-200 action-button"
                                    // onClick={() => console.log("Copy selected items:", Array.from(selectedItems))}
                                >
                                    <Copy className="h-3.5 w-3.5"/>
                                    Copy
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex items-center gap-2 text-xs font-medium border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 transition-all duration-200 action-button"
                                    // onClick={() => console.log("Move selected items:", Array.from(selectedItems))}
                                >
                                    <Move className="h-3.5 w-3.5"/>
                                    Move
                                </Button>
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
                            /* Enhanced responsive dropdown for smaller screens */
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
                                        onClick={() => console.log("Copy selected items:", Array.from(selectedItemsRef.current))}
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
                                        onClick={() => console.log("Move selected items:", Array.from(selectedItemsRef.current))}
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

            <div
                ref={containerRef}
                className="relative flex-1 bg-white dark:bg-slate-900 pt-2 px-4 pb-4 overflow-y-auto"
                onMouseDown={handleMouseDown}
            >
                <div
                    ref={selectionBoxRef}
                    className="absolute border-2 border-blue-500 bg-blue-500/20 z-10 pointer-events-none rounded-sm"
                />
                {/* {isSelectingRef.current && (
                    <div
                        ref={selectionBoxRef}
                        className="absolute border-2 border-blue-500 bg-blue-500/20 z-10 pointer-events-none rounded-sm"
                    />
                )} */}

                {isOpeningBrowser ? (
                    // TODO: change this to something else?
                        <div className="flex justify-center items-center h-full">
                            <RefreshCw className="h-8 w-8 text-blue-400 animate-spin"/>
                        </div>
                ) : (
                    isLoading ? (
                        <div className="flex justify-center items-center h-full">
                            <RefreshCw className="h-8 w-8 text-blue-400 animate-spin"/>
                        </div>
                    ) : sortedItems.length > 0 ? (
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4">
                            {sortedItems.map((item) => {
                                const IconComponent = getFileIcon(item.name, item.isDirectory);
                                const iconColor = getIconColor(item.name, item.isDirectory, false, BoxDrag.target?.boxId === Number(item.id));
                                return (
                                    <div
                                        key={item.id}
                                        ref={(el) => {
                                            if (el) itemRefs.current.set(item.id, el)
                                            else itemRefs.current.delete(item.id)
                                        }}
                                        onClick={(e) => handleItemClick(e, item)}
                                        onMouseDown={(e) => handleItemMouseDown(e, item)}
                                        className={cn(
                                            "file-item flex flex-col items-center justify-center p-3 rounded-md cursor-pointer transition-all hover:bg-slate-100 dark:hover:bg-slate-800",
                                            // selectedItems.has(item.id)
                                            //     ? "bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700"
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
                                        <div className="w-16 h-16 flex items-center justify-center mb-2">
                                            <IconComponent
                                                className={cn("h-14 w-14", iconColor)}
                                            />
                                        </div>
                                        <span
                                            className={cn(
                                                "block w-full px-1 text-sm leading-tight text-center",
                                                "break-all line-clamp-2 min-h-[2.5rem]",
                                                // selectedItems.has(item.id)
                                                //     ? "text-blue-700 dark:text-blue-300 font-medium"
                                                //     : "text-slate-800 dark:text-slate-200",
                                                    BoxDrag.target?.boxId === Number(item.id) && "text-green-700 dark:text-green-300",
                                            )}
                                            title={item.name}
                                        >{item.name}</span>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <div
                            className="flex flex-col items-center justify-center h-full text-slate-800 dark:text-slate-200">
                            <FolderIcon className="w-16 h-16 mb-4 opacity-30"/>
                            <p>This folder is empty</p>
                        </div>
                    )
                )}
            </div>
            <FileStatsDialog />
        </div>
    )
});