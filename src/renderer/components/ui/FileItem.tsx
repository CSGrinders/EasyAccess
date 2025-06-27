import React, { memo } from "react"
import {
    FolderIcon,
    FileIcon,
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
    Trash,
    Move,
    Copy,
    Info,
    MoreHorizontal,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { FileSystemItem } from "@Types/fileSystem"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@radix-ui/react-dropdown-menu";
import { Button } from "./button";

/**
 * Picks the right icon for a file or folder based on its name
 * 
 * For folders: looks at folder name to pick special icons
 * For files: looks at file extension (.jpg, .pdf, .mp3, etc.) to pick the right icon
 */
export const getFileIcon = (fileName: string, isDirectory: boolean = false) => {
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
export const getIconColor = (fileName: string, isDirectory: boolean = false, isSelected: boolean = false, isDropTarget: boolean = false) => {
    // Special colors that override everything else
    if (isDropTarget) return "text-green-500";
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

interface FileItemProps {
    item: FileSystemItem;
    isBoxToBoxTransfer?: boolean;
    BoxDrag: any;
    boxId: number;
    draggedItemsRef: React.RefObject<string[]>;
    handleItemClick: (e: React.MouseEvent, item: FileSystemItem) => void;
    handleItemMouseDown: (e: React.MouseEvent, item: FileSystemItem) => void;
    handleItemRightClick?: (e: React.MouseEvent, item: FileSystemItem, mousePosition: { x: number; y: number }) => void;
    itemRefs: React.RefObject<Map<string, HTMLDivElement>>;
    isTransferring?: boolean;
    transferInfo?: { isMove: boolean } | null;
}

export const FileItem = memo<FileItemProps>(function FileItem({
    item,
    isBoxToBoxTransfer = false,
    BoxDrag,
    boxId,
    draggedItemsRef,
    handleItemClick,
    handleItemMouseDown,
    handleItemRightClick,
    itemRefs,
    isTransferring = false,
    transferInfo = null
}) {
    const IconComponent = getFileIcon(item.name, item.isDirectory);
    const isDropTarget = BoxDrag.target?.targetId === item.id &&
        BoxDrag.target?.boxId === boxId &&
        item.isDirectory;
    const iconColor = getIconColor(item.name, item.isDirectory, false, isDropTarget);

    const isDraggingOverFile = BoxDrag.isDragging && !item.isDirectory && BoxDrag.sourceBoxId === boxId;

    const [showDropdown, setShowDropdown] = React.useState(false);
    const [dropdownPosition, setDropdownPosition] = React.useState<{ top: number; left: number } | null>(null);

    const handleOnContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setShowDropdown(true);
        setDropdownPosition({ top: e.clientY, left: e.clientX });
    }
    return (
        <div
            key={item.id}
            ref={(el) => {
                if (el) {
                    itemRefs.current.set(item.id, el)
                    el.dataset.itemId = item.id;
                    el.dataset.isTransferring = isTransferring.toString();
                }
                else itemRefs.current.delete(item.id)
            }}
            onClick={(e) => handleItemClick(e, item)}
            onMouseDown={(e) => {
                if (!isTransferring) {
                    e.stopPropagation()
                    handleItemMouseDown(e, item)
                }
            }}
            onContextMenu={(e) => {
                if (!isTransferring && handleItemRightClick) {
                    e.preventDefault()
                    e.stopPropagation()
                    handleItemRightClick(e, item, {
                        x: e.clientX,
                        y: e.clientY
                    });
                }
            }}
            className={cn(
                // Base styles for all file items
                "file-item flex flex-col items-center justify-center w-25 h-25 rounded-md transition-all",

                // Transferring state styling - completely disable interaction
                isTransferring ? (
                    transferInfo?.isMove
                        ? "opacity-50 cursor-not-allowed bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 pointer-events-none" // Moving files
                        : "opacity-75 cursor-not-allowed bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 pointer-events-none" // Copying files
                ) : isDraggingOverFile ? (
                    // When dragging over a file, disable hover effects and show "not allowed" cursor
                    "cursor-not-allowed border border-transparent"
                ) : BoxDrag.target?.boxId === boxId ? (
                    // When this box is a drop target, disable hover effects to let green overlay show through
                    "cursor-pointer border border-transparent"
                ) : (
                    // Normal interactive state
                    "cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                ),

                // Basic hover styles when not in box-to-box transfer mode and not transferring and not dragging over file
                !isBoxToBoxTransfer && !isTransferring && !isDraggingOverFile && BoxDrag.target?.boxId !== boxId
                    ? "hover:bg-slate-100 dark:hover:bg-slate-700 border border-transparent"
                    : "border border-transparent",
                // Add hover effect when dragging (only if not transferring and not in a drop zone)
                !isTransferring && BoxDrag.isDragging && !draggedItemsRef.current.includes(item.id) && BoxDrag.sourceBoxId == boxId && item.isDirectory && BoxDrag.target?.boxId !== boxId &&
                "hover:ring-2 hover:ring-green-500 hover:bg-green-100 dark:hover:bg-green-900/30",

                // Dragged items opacity (only if not transferring)
                !isTransferring && draggedItemsRef.current.includes(item.id) && BoxDrag.isDragging && "opacity-50",
            )}
        >
            
            {/* Icon container with transfer status overlay */}
            <div className="w-12 h-12 flex items-center justify-center mb-2 relative">
                <IconComponent
                    className={cn(
                        "h-10 w-10",
                        iconColor,
                        isTransferring && "opacity-60"
                    )}
                />
                {/* Transfer status indicator */}
                {isTransferring && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold text-white animate-pulse"
                        style={{
                            backgroundColor: transferInfo?.isMove ? '#f59e0b' : '#3b82f6'
                        }}
                        title={transferInfo?.isMove ? 'Moving file...' : 'Copying file...'}>
                        {transferInfo?.isMove ? 'M' : 'C'}
                    </div>
                )}
            </div>
            {/* File/folder name */}
            <span
                className={cn(
                    "block w-full px-1 text-xs leading-tight text-center",
                    "break-all line-clamp-2 min-h-[2.5rem]",
                    "text-slate-800 dark:text-slate-200",
                    // Prevent text selection when transferring
                    isTransferring && "select-none",

                    // Special styling for transferring files
                    isTransferring && transferInfo?.isMove && "text-amber-700 dark:text-amber-300",
                    isTransferring && !transferInfo?.isMove && "text-blue-700 dark:text-blue-300",
                )}
                title={item.name}
            >
                {item.name}
            </span>
        </div>
    );
});
