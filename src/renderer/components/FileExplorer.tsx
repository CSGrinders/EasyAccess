/*
TODO
Fix id (BoxDrag.target?.boxId) number vs string with item.id 
*/

import React, {useEffect, useState, useRef, useCallback} from "react"
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
    Box
} from "lucide-react"
import type {FileContent, FileSystemItem} from "@Types/fileSystem"
import {Input} from "@/components/ui/input"
import {Button} from "@/components/ui/button"
import {cn} from "@/lib/utils"
import {CLOUD_HOME, CloudType} from "@Types/cloudType"
import { Progress } from "./ui/progress"
import {useBoxDrag} from "@/contexts/BoxDragContext";
import { postFile } from "src/main/cloud/cloudManager"

interface FileExplorerProps {
    cloudType?: CloudType
    accountId?: string
    tempPostFile?: (parentPath: string, cloudType?: CloudType, accountId?: string) => void
    tempGetFile?: (filePath: string, cloudType?: CloudType, accountId?: string) => void
    boxId: number
    isBoxToBoxTransfer?: boolean
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

export function FileExplorer({cloudType, accountId, tempPostFile, tempGetFile, boxId, isBoxToBoxTransfer = false, onCurrentPathChange}: FileExplorerProps) {
    const [items, setItems] = useState<FileSystemItem[]>([])
    const [cwd, setCwd] = useState<string>("")
    const [history, setHistory] = useState<string[]>([])
    const [historyIndex, setHistoryIndex] = useState(-1)
    const [searchQuery, setSearchQuery] = useState("")
    const [isLoading, setIsLoading] = useState(true)
    const [currentPath, setCurrentPath] = useState<string[]>([])
    const [showHidden, setShowHidden] = useState(false)
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
    const [lastSelectedItem, setLastSelectedItem] = useState<string | null>(null)
    const [isSelecting, setIsSelecting] = useState(false)
    const [selectionStart, setSelectionStart] = useState({x: 0, y: 0})
    const [selectionEnd, setSelectionEnd] = useState({x: 0, y: 0})
    const [selectionBox, setSelectionBox] = useState({left: 0, top: 0, width: 0, height: 0})
    const [isAdditiveDrag, setIsAdditiveDrag] = useState(false);
    const [isOpeningBrowser, setIsOpeningBrowser] = useState(false);

    const selectionSnapshotRef = useRef<Set<string>>(new Set());

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
        if (!cwd) return

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
                    setSelectedItems(new Set())
                    setLastSelectedItem(null)
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
                    setSelectedItems(new Set())
                    setLastSelectedItem(null)
                })
                .catch((err) => {
                    console.error(err)
                    setIsLoading(false)
                })
        }

    }, [cwd])

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
            console.error("File URL is undefined, create blob URL instead");
            // Create a blob URL for the file content
            if (!fileContent.content) {
                console.error("File content is undefined, cannot create blob URL");
                return;
            }
            const blob = new Blob([fileContent.content], { type: fileContent.type });
            const blobUrl = URL.createObjectURL(blob);
            // open the blob URL in a new tab
            window.open(blobUrl, '_blank');
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

    const refreshDirectory = () => {
        setIsLoading(true)
        if (cloudType && accountId) {
            // Fetch files from the cloud account
            (window as any).cloudFsApi.readDirectory(cloudType, accountId, cwd)
                .then((files: FileSystemItem[]) => {
                    setItems(files)
                    updatePathSegments(cwd)
                    setIsLoading(false)
                    setSelectedItems(new Set())
                    setLastSelectedItem(null)
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
                    setSelectedItems(new Set())
                    setLastSelectedItem(null)
                })
                .catch((err) => {
                    console.error(err)
                    setIsLoading(false)
                })
        }
    }


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

        console.log("Item clicked:", item)


        const ctrlOrMeta = e.ctrlKey || e.metaKey;

        if (e.shiftKey && lastSelectedItem) {
            const itemsPathList = sortedItems.map((i) => i.id); // TODO item path list to item id list?
            const currentIndex = itemsPathList.indexOf(item.id); // TODO
            const lastIndex = itemsPathList.indexOf(lastSelectedItem);

            if (currentIndex !== -1 && lastIndex !== -1) {
                const start = Math.min(currentIndex, lastIndex);
                const end = Math.max(currentIndex, lastIndex);
                const newSelectedItemsUpdate = ctrlOrMeta ? new Set(selectedItems) : new Set<string>();

                for (let i = start; i <= end; i++) {
                    newSelectedItemsUpdate.add(itemsPathList[i]);
                }

                if (ctrlOrMeta) {
                    const rangeSelection = new Set<string>();
                    for (let i = start; i <= end; i++) {
                        rangeSelection.add(itemsPathList[i]);
                    }
                    setSelectedItems(prev => new Set([...prev, ...rangeSelection]));
                } else {
                    const rangeSelection = new Set<string>();
                    for (let i = start; i <= end; i++) {
                        rangeSelection.add(itemsPathList[i]);
                    }
                    setSelectedItems(rangeSelection);
                }

            }
        } else if (ctrlOrMeta) {
            const newSelectedItemsUpdate = new Set(selectedItems);
            if (newSelectedItemsUpdate.has(item.id)) {
                newSelectedItemsUpdate.delete(item.id);
            } else {
                newSelectedItemsUpdate.add(item.id);
            }
            setSelectedItems(newSelectedItemsUpdate);
            setLastSelectedItem(item.id);
        } else {
            setSelectedItems(new Set([item.id]));
            setLastSelectedItem(item.id);
        }
    }


    const handleMouseDown = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest(".file-item") || e.button !== 0) {
            return;
        }

        const additive = e.ctrlKey || e.metaKey;
        setIsAdditiveDrag(additive);

        if (!additive) {
            setSelectedItems(new Set());
            selectionSnapshotRef.current = new Set();
        } else {
            selectionSnapshotRef.current = new Set(selectedItems);
        }

        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width - 1, e.clientX - rect.left));
        const y = Math.max(0, Math.min(rect.height - 1, e.clientY - rect.top));

        setIsSelecting(true);
        setSelectionStart({x, y});
        setSelectionEnd({x, y});
        setSelectionBox({left: x, top: y, width: 0, height: 0});
    }

    const updateSelectedItemsFromBox = useCallback((box: {
        left: number;
        top: number;
        width: number;
        height: number
    }) => {
        if (!isSelecting || !containerRef.current) return;

        const itemsCurrentlyInBox = new Set<string>();
        const containerRect = containerRef.current.getBoundingClientRect();

        itemRefs.current.forEach((element, id) => {
            if (!element) return;

            const itemRect = element.getBoundingClientRect();

            const itemLeft = itemRect.left - containerRect.left;
            const itemTop = itemRect.top - containerRect.top;
            const itemRight = itemLeft + itemRect.width;
            const itemBottom = itemTop + itemRect.height;

            // Check for intersection
            if (itemLeft < box.left + box.width &&
                itemRight > box.left &&
                itemTop < box.top + box.height &&
                itemBottom > box.top) {
                itemsCurrentlyInBox.add(id);
            }
        });

        if (isAdditiveDrag) {
            const combinedSelection = new Set([...selectionSnapshotRef.current, ...itemsCurrentlyInBox]);
            setSelectedItems(combinedSelection);
        } else {
            setSelectedItems(itemsCurrentlyInBox);
        }
    }, [isSelecting, isAdditiveDrag]);

    const handleMouseMove = useCallback((e: React.MouseEvent | MouseEvent) => {
        if (!isSelecting || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const currentX = Math.max(0, Math.min(rect.width - 1, e.clientX - rect.left));
        const currentY = Math.max(0, Math.min(rect.height - 1, e.clientY - rect.top));

        setSelectionEnd({x: currentX, y: currentY});

        const newSelectionBox = {
            left: Math.min(selectionStart.x, currentX),
            top: Math.min(selectionStart.y, currentY),
            width: Math.abs(currentX - selectionStart.x),
            height: Math.abs(currentY - selectionStart.y),
        };
        setSelectionBox(newSelectionBox);

        const scrollThreshold = 50;
        const scrollAmount = 5;
        if (e.clientY < rect.top + scrollThreshold) {
            containerRef.current.scrollTop -= scrollAmount;
        } else if (e.clientY > rect.bottom - scrollThreshold) {
            containerRef.current.scrollTop += scrollAmount;
        }


        updateSelectedItemsFromBox(newSelectionBox);
    }, [isSelecting, updateSelectedItemsFromBox, selectionStart.x, selectionStart.y]);


    const handleMouseUp = () => {
        if (isSelecting) {
            setIsSelecting(false);
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
        if (selectedItems.has(item.id)) {
            itemsToDrag = Array.from(selectedItems)
        } else {
            itemsToDrag = [item.id]
            setSelectedItems(new Set([item.id]))
            setLastSelectedItem(item.id)
        }

        draggedItemsRef.current = itemsToDrag

        document.addEventListener("mousemove", handleItemMouseMove)
        document.addEventListener("mouseup", handleItemMouseUp)
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
                tempGetFile?.(draggedFileItems.map(item => item.path).join(","), cloudType, accountId);
                console.log("Box drag started with items:", draggedFileItems, boxId, cloudType, accountId);
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

            let newDropTarget: string | null = null

            if (isWithinContainer) {
                console.log("Mouse is within container, checking for drop target")
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
                        // newDropTarget = item.id;
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
                        break
                    }
                }
            }

            // updateDropTarget(newDropTarget)

            const scrollThreshold = 60
            const scrollAmount = 10

            if (e.clientY < containerRect.top + scrollThreshold) {
                containerRef.current.scrollTop -= scrollAmount
            } else if (e.clientY > containerRect.bottom - scrollThreshold) {
                containerRef.current.scrollTop += scrollAmount
            }
        }, 16)
    }


    const handleItemMouseUp = () => {
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
                tempPostFile?.(targetItem.path, cloudType, accountId)

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
            return;
        }
        BoxDrag.setDragItems([], null);
        BoxDrag.setIsDragging(false);
        localDragStartedRef.current = false;
        localIsDraggingRef.current = false;
        localTargetRef.current = null;
    }


    useEffect(() => {
        const globalMouseMove = (e: MouseEvent) => {
            if (isSelecting && containerRef.current) {
                const event = e as unknown as React.MouseEvent;
                handleMouseMove(event);
            }
        };

        const globalMouseUp = () => {
            if (isSelecting) {
                handleMouseUp();
            }
        };

        if (isSelecting) {
            document.addEventListener('mousemove', globalMouseMove);
            document.addEventListener('mouseup', globalMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', globalMouseMove);
            document.removeEventListener('mouseup', globalMouseUp);
        };
    }, [isSelecting, handleMouseMove, handleMouseUp]);

    const handleSelectionEnd = () => {
        setIsSelecting(false)

        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleSelectionEnd)
    }

    useEffect(() => {
        return () => {
            document.removeEventListener("mousemove", handleItemMouseMove)
            document.removeEventListener("mouseup", handleItemMouseUp)
            document.removeEventListener("mousemove", handleMouseMove)
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
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ctrl+A or Cmd+A:
            if ((e.ctrlKey || e.metaKey) && e.key === "a") {
                e.preventDefault()
                const allItems = new Set(sortedItems.map((item) => item.id))
                setSelectedItems(allItems)
            }

            if (e.key === "Escape") {
                setSelectedItems(new Set())
                setLastSelectedItem(null)
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
                if (isSelecting) {
                    setIsSelecting(false)
                }
            }

            // Delete
            if (e.key === "Delete" && selectedItems.size > 0) {
                console.log("Delete selected items:", Array.from(selectedItems))

            }
        }

        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [selectedItems, BoxDrag.isDragging, isSelecting, sortedItems])


    const selectedCount = selectedItems.size

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
                <div
                    className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-y border-blue-100 dark:border-blue-800">
          <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">
            {selectedCount} {selectedCount === 1 ? "item" : "items"} selected
          </span>
                    <div className="ml-auto flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="flex items-center gap-1 text-xs"
                            onClick={() => console.log("Copy selected items:", Array.from(selectedItems))}
                        >
                            <Copy className="h-3.5 w-3.5"/>
                            Copy
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="flex items-center gap-1 text-xs"
                            onClick={() => console.log("Move selected items:", Array.from(selectedItems))}
                        >
                            <Move className="h-3.5 w-3.5"/>
                            Move
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            onClick={() => console.log("Delete selected items:", Array.from(selectedItems))}
                        >
                            <Trash className="h-3.5 w-3.5"/>
                            Delete
                        </Button>
                    </div>
                </div>
            )}

            <div
                ref={containerRef}
                className="relative flex-1 bg-white dark:bg-slate-900 pt-2 px-4 pb-4 overflow-y-auto"
                onMouseDown={handleMouseDown}
            >
                {isSelecting && (
                    <div
                        className="absolute border-2 border-blue-500 bg-blue-500/20 z-10 pointer-events-none rounded-sm"
                        style={{
                            left: `${selectionBox.left}px`,
                            top: `${selectionBox.top}px`,
                            width: `${selectionBox.width}px`,
                            height: `${selectionBox.height}px`,
                        }}
                    />
                )}

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
                                const iconColor = getIconColor(item.name, item.isDirectory, selectedItems.has(item.id), BoxDrag.target?.boxId === Number(item.id));
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
                                            "file-item flex flex-col items-center justify-center p-3 rounded-md cursor-pointer transition-all",
                                            selectedItems.has(item.id)
                                                ? "bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700"
                                                : !isBoxToBoxTransfer
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
                                                selectedItems.has(item.id)
                                                    ? "text-blue-700 dark:text-blue-300 font-medium"
                                                    : "text-slate-800 dark:text-slate-200",
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
        </div>
    )
}