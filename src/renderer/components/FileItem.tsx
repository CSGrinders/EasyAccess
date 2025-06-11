/*
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
                                                "text-slate-800 dark:text-slate-200",
                                                // selectedItems.has(item.id)
                                                //     ? "text-blue-700 dark:text-blue-300 font-medium"
                                                //     : "text-slate-800 dark:text-slate-200",
                                                    BoxDrag.target?.boxId === Number(item.id) && "text-green-700 dark:text-green-300",
                                            )}
                                            title={item.name}
                                        >{item.name}</span>
                                    </div>
                                )
                                    */

import { cn } from "@/lib/utils";
import { memo } from "react";
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
import { useBoxDrag } from "@/contexts/BoxDragContext";
import React from "react";

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

interface FileItemProps {
    item: {
        id: string | number;
        name: string;
        isDirectory?: boolean;
    };
    isSelected: boolean;
    isDragging: boolean;
    draggedItems: (string | number)[];
    boxId: number;
    sourceBoxId: number;
    onItemClick: (e: React.MouseEvent<HTMLDivElement>, item: { id: string | number; name: string; isDirectory?: boolean }) => void; 
    onItemMouseDown: (e: React.MouseEvent<HTMLDivElement>, item: { id: string | number; name: string; isDirectory?: boolean }) => void;
    setItemRef: (el: HTMLDivElement | null) => void;
}

const FileItemComponent = React.forwardRef<HTMLDivElement, FileItemProps>(function FileItem(
    {
        item,
        isSelected,
        isDragging,
        boxId,
        sourceBoxId,
        onItemClick,
        onItemMouseDown,
        setItemRef
    }: FileItemProps,
    ref
) {
    const IconComponent = getFileIcon(item.name, item.isDirectory);
    const iconColor = getIconColor(item.name, item.isDirectory, isSelected);

    const BoxDrag = useBoxDrag();
    return (
        <div
            ref={setItemRef}
            onClick={(e) => onItemClick(e, item)}
            onMouseDown={(e) => onItemMouseDown(e, item)}
            className={cn(
                "file-item flex flex-col items-center justify-center p-3 rounded-md cursor-pointer transition-all",
                BoxDrag.isDragging && isDragging && sourceBoxId === boxId &&
                "hover:ring-2 hover:ring-green-500 hover:bg-green-100",
                isDragging && BoxDrag.isDragging && "opacity-50"
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
                    "text-slate-800 dark:text-slate-200",
                    // selectedItems.has(item.id)
                    //     ? "text-blue-700 dark:text-blue-300 font-medium"
                    //     : "text-slate-800 dark:text-slate-200",
                    BoxDrag.target?.boxId === Number(item.id) && "text-green-700 dark:text-green-300",
                )}
                title={item.name}
            >{item.name}</span>
        </div>
    );
});

export const FileItem = memo(FileItemComponent);