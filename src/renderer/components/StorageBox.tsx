"use client"

import type React from "react"
import {useState, useEffect, useRef} from "react"
import {X, Maximize2, Minimize2, ChevronDown, Folder, ChevronRight, File, FolderOpen} from "lucide-react"
import {cn} from "@/lib/utils"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import {ScrollArea} from "@/components/ui/scroll-area"
import {StorageBoxProps, WINDOW_SIZES} from "@Types/box";


export function StorageBox({box, onClose, onFocus}: StorageBoxProps) {

    const {id, title, content, icon} = box
    const [position, setPosition] = useState(box.position)
    const [size, setSize] = useState(box.size)
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState({x: 0, y: 0})
    const [isMaximized, setIsMaximized] = useState(false)
    const [previousState, setPreviousState] = useState({position: box.position, size: box.size,})
    const [resizeStartPosition, setResizeStartPosition] = useState(box.position)
    const [isResizing, setIsResizing] = useState(false)
    const [resizeDirection, setResizeDirection] = useState<string | null>(null)
    const [resizeStart, setResizeStart] = useState({x: 0, y: 0})
    const [resizeStartSize, setResizeStartSize] = useState(box.size)
    const [isDropdownOpen, setIsDropdownOpen] = useState(false)
    const boxRef = useRef<HTMLDivElement>(null)

    // Mouse down Event
    const handleHeaderMouseDown = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (isDropdownOpen) return
        onFocus(id)
        setIsDragging(true)
        setDragStart({x: e.clientX - position.x, y: e.clientY - position.y})
    }

    // Mouse box click event (Show focus)
    const handleWindowClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        onFocus(id)
    }

    // Mouse up event
    const handleMouseUp = () => {
        setIsDragging(false)
        setIsResizing(false)
        setResizeDirection(null)
    }

    // Mouse move around canvas event
    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDropdownOpen) return

        if (isDragging) {
            setPosition({x: e.clientX - dragStart.x, y: e.clientY - dragStart.y})
        } else if (isResizing && resizeDirection) {
            const dx = e.clientX - resizeStart.x
            const dy = e.clientY - resizeStart.y

            let newWidth = resizeStartSize.width
            let newHeight = resizeStartSize.height
            let newX = resizeStartPosition.x
            let newY = resizeStartPosition.y

            if (resizeDirection.includes("e")) {
                newWidth = Math.max(200, resizeStartSize.width + dx)
            }
            if (resizeDirection.includes("s")) {
                newHeight = Math.max(150, resizeStartSize.height + dy)
            }
            if (resizeDirection.includes("w")) {
                newWidth = Math.max(200, resizeStartSize.width - dx)
                newX = resizeStartPosition.x + dx
            }
            if (resizeDirection.includes("n")) {
                newHeight = Math.max(150, resizeStartSize.height - dy)
                newY = resizeStartPosition.y + dy
            }

            setSize({width: newWidth, height: newHeight})
            setPosition({x: newX, y: newY})

        }
    }


    // Start resizing
    const handleResizeStart = (e: React.MouseEvent, direction: string) => {

        if (isDropdownOpen) return

        e.stopPropagation()
        e.preventDefault()
        onFocus(id)
        setIsResizing(true)
        setResizeDirection(direction)
        setResizeStart({x: e.clientX, y: e.clientY})
        setResizeStartSize(size)
        setResizeStartPosition(position)
    }

    // Toggle maximize/restore
    const toggleMaximize = (e: React.MouseEvent) => {
        e.stopPropagation()

        if (isMaximized) {
            setPosition(previousState.position)
            setSize(previousState.size)
        } else {
            setPreviousState({
                position,
                size,
            })
            setPosition({x: -400, y: -300})
            setSize({width: 1200, height: 800})
        }

        setIsMaximized(!isMaximized)
    }

    // Handle close
    const handleClose = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (onClose) onClose(id)
    }

    // Apply preset size
    const applyPresetSize = (presetKey: keyof typeof WINDOW_SIZES) => {
        const newSize = WINDOW_SIZES[presetKey]
        setSize(newSize)
    }


    useEffect(() => {
        const handleGlobalMouseMove = (e: MouseEvent) => {
            if (isDropdownOpen) return
            if (isDragging || isResizing) {
                handleMouseMove(e as unknown as React.MouseEvent)
            }
        }

        const handleGlobalMouseUp = () => {
            handleMouseUp()
        }

        if (isDragging || isResizing) {
            document.addEventListener("mousemove", handleGlobalMouseMove)
            document.addEventListener("mouseup", handleGlobalMouseUp)
        }

        return () => {
            document.removeEventListener("mousemove", handleGlobalMouseMove)
            document.removeEventListener("mouseup", handleGlobalMouseUp)
        }
    }, [isDragging, isResizing, dragStart, position, resizeDirection, resizeStart, resizeStartSize, resizeStartPosition])

    // Make sure if we overlap reduce the opacity of the box.
    const opacity = isDragging || isResizing ? 0.7 : 1
    const defaultIcon = <Folder className="h-5 w-5 text-amber-500"/>

    return (
        <div
            ref={boxRef}
            className={cn(
                "absolute bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-blue-100 dark:border-slate-700 overflow-hidden transition-opacity",
                isDragging && "cursor-grabbing")}
            style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                width: `${size.width}px`,
                height: `${size.height}px`,
                zIndex: box.zIndex,
                opacity,
            }}
            onClick={handleWindowClick}
        >
            <div
                className="h-12 bg-white dark:bg-slate-800 flex items-center justify-between px-4 cursor-grab border-b border-slate-100 dark:border-slate-700"
                onMouseDown={handleHeaderMouseDown}
            >
                <div className="flex items-center gap-3">
                    <div
                        className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30">
                        {icon || defaultIcon}
                    </div>
                    <div className="font-medium text-slate-800 dark:text-slate-200">{title}</div>
                </div>
                <div className="flex items-center gap-1">
                    <DropdownMenu onOpenChange={setIsDropdownOpen}>
                        <DropdownMenuTrigger asChild>
                            <button
                                className={cn(
                                    "p-1.5 rounded-md transition-colors",
                                    isDropdownOpen
                                        ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                        : "text-slate-500 hover:bg-blue-100/50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400",
                                )}
                            >
                                <ChevronDown className="h-4 w-4"/>
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="end"
                            className="w-56 bg-white dark:bg-slate-800 border border-blue-100 dark:border-slate-700 shadow-lg rounded-lg overflow-hidden"
                        >
                            <div
                                className="px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-b border-blue-100 dark:border-slate-700">
                                <DropdownMenuLabel className="text-blue-600 dark:text-blue-400 font-medium">
                                    Box Size
                                </DropdownMenuLabel>
                            </div>

                            <div className="p-1">
                                <DropdownMenuItem
                                    onClick={() => applyPresetSize("small")}
                                    className="flex items-center px-3 py-2 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 dark:hover:from-blue-900/20 dark:hover:to-indigo-900/20 rounded-md cursor-pointer transition-colors"
                                >
                                    <div
                                        className="w-4 h-4 rounded-sm border border-blue-200 dark:border-blue-700 mr-2"></div>
                                    <span>Small (320×240)</span>
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                    onClick={() => applyPresetSize("medium")}
                                    className="flex items-center px-3 py-2 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 dark:hover:from-blue-900/20 dark:hover:to-indigo-900/20 rounded-md cursor-pointer transition-colors"
                                >
                                    <div
                                        className="w-5 h-5 rounded-sm border border-blue-200 dark:border-blue-700 mr-2"></div>
                                    <span>Medium (480×360)</span>
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                    onClick={() => applyPresetSize("large")}
                                    className="flex items-center px-3 py-2 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 dark:hover:from-blue-900/20 dark:hover:to-indigo-900/20 rounded-md cursor-pointer transition-colors"
                                >
                                    <div
                                        className="w-6 h-6 rounded-sm border border-blue-200 dark:border-blue-700 mr-2"></div>
                                    <span>Large (640×480)</span>
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                    onClick={() => applyPresetSize("xl")}
                                    className="flex items-center px-3 py-2 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 dark:hover:from-blue-900/20 dark:hover:to-indigo-900/20 rounded-md cursor-pointer transition-colors"
                                >
                                    <div
                                        className="w-7 h-7 rounded-sm border border-blue-200 dark:border-blue-700 mr-2"></div>
                                    <span>Extra Large (800×600)</span>
                                </DropdownMenuItem>
                            </div>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <button
                        className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
                        onClick={toggleMaximize}
                    >
                        {isMaximized ? <Minimize2 className="h-4 w-4"/> : <Maximize2 className="h-4 w-4"/>}
                    </button>
                    <button
                        className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-500 hover:text-red-500"
                        onClick={handleClose}
                    >
                        <X className="h-4 w-4"/>
                    </button>
                </div>
            </div>


            <div className="p-4 h-[calc(100%-48px)] overflow-auto bg-slate-50 dark:bg-slate-900/50">
                <ScrollArea className="flex-1 p-4">
                    <div className="space-y-1">
                        {/* Here we will add the logic for dirs and files */}
                    </div>
                </ScrollArea>
            </div>

            <div className="absolute bottom-1 right-2 text-xs text-slate-400 pointer-events-none">
                {Math.round(size.width)} × {Math.round(size.height)}
            </div>

            {!isDropdownOpen && (
                <>
                    <div
                        className="absolute right-0 bottom-0 w-6 h-6 cursor-se-resize bg-transparent hover:bg-blue-500/10 z-10"
                        onMouseDown={(e) => handleResizeStart(e, "se")}
                    />
                    <div
                        className="absolute left-0 bottom-0 w-6 h-6 cursor-sw-resize bg-transparent hover:bg-blue-500/10 z-10"
                        onMouseDown={(e) => handleResizeStart(e, "sw")}
                    />
                    <div
                        className="absolute left-0 top-0 w-6 h-6 cursor-nw-resize bg-transparent hover:bg-blue-500/10 z-10"
                        onMouseDown={(e) => handleResizeStart(e, "nw")}
                    />
                    <div
                        className="absolute right-0 top-0 w-6 h-6 cursor-ne-resize bg-transparent hover:bg-blue-500/10 z-10"
                        onMouseDown={(e) => handleResizeStart(e, "ne")}
                    />

                    {/* Edge resize handles */}
                    <div
                        className="absolute right-0 top-6 bottom-6 w-1 cursor-e-resize hover:bg-blue-500/10"
                        onMouseDown={(e) => handleResizeStart(e, "e")}
                    />
                    <div
                        className="absolute left-6 right-6 bottom-0 h-1 cursor-s-resize hover:bg-blue-500/10"
                        onMouseDown={(e) => handleResizeStart(e, "s")}
                    />
                    <div
                        className="absolute left-0 top-6 bottom-6 w-1 cursor-w-resize hover:bg-blue-500/10"
                        onMouseDown={(e) => handleResizeStart(e, "w")}
                    />
                    <div
                        className="absolute left-6 right-6 top-0 h-1 cursor-n-resize hover:bg-blue-500/10"
                        onMouseDown={(e) => handleResizeStart(e, "n")}
                    />
                </>)}
        </div>
    )
}
