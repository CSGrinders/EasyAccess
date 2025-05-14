import {ChevronRight, Cloud, FolderOpen, HardDrive, File, X, Maximize2} from "lucide-react";
import {Button} from "@Components/ui/button";
import {ScrollArea} from "@Components/ui/scroll-area";

interface StorageBoxProps {
    box: {
        id: number
        name: string
        type: string
        width: number
        height: number
        content: {
            folders: string[]
            files: string[]
        }
    }
    isActive: boolean
    isResizing: boolean
    onActivate: () => void
    onRemove: () => void
    onResizeStart: (e: React.MouseEvent) => void
}

export function StorageBox({box, isActive, isResizing, onActivate, onRemove, onResizeStart}: StorageBoxProps) {
    return (
        <></>
    )
}