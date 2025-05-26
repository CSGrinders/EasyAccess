import React, {memo} from "react"
import {useState, useEffect, useRef} from "react"
import {X, Maximize2, Minimize2, ChevronDown, Folder} from "lucide-react"
import {cn} from "@/lib/utils"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import {StorageBoxProps, WINDOW_SIZES} from "@Types/box";
import {FileExplorer} from "@Components/FileExplorer";


export const StorageBox = memo(StorageBoxInner, areEqual);
function areEqual(prev: StorageBoxProps, next: StorageBoxProps) {
    return (
        prev.box.id === next.box.id &&
        prev.box.position === next.box.position &&
        prev.box.size === next.box.size &&
        prev.box.zIndex === next.box.zIndex &&
        prev.isMaximized === next.isMaximized &&
        prev.viewportSize.width === next.viewportSize.width &&
        prev.viewportSize.height === next.viewportSize.height &&
        prev.canvasZoom === next.canvasZoom &&
        prev.canvasPan.x === next.canvasPan.x &&
        prev.canvasPan.y === next.canvasPan.y
    );
}

function StorageBoxInner({
                               box,
                               onClose,
                               onFocus,
                               viewportSize,
                               viewportRef,
                               canvasZoom,
                               canvasPan,
                               isMaximized,
                               setIsMaximized,
                           }: StorageBoxProps) {
    const {id, title, content, type, icon} = box;
    const [position, setPosition] = useState(box.position);
    const [size, setSize] = useState(box.size);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({x: 0, y: 0});
    const [previousState, setPreviousState] = useState({position: box.position, size: box.size});
    const [isResizing, setIsResizing] = useState(false);
    const [resizeDirection, setResizeDirection] = useState<string | null>(null);
    const [resizeStart, setResizeStart] = useState({x: 0, y: 0});
    const [resizeStartSize, setResizeStartSize] = useState(box.size);
    const [resizeStartPosition, setResizeStartPosition] = useState(box.position);

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);


    const getMaximizedState = () => {
        if (viewportSize.width > 0 && viewportSize.height > 0 && canvasZoom > 0) {
            const maximizedWidth = viewportSize.width / canvasZoom;
            const maximizedHeight = viewportSize.height / canvasZoom;

            const newX = -canvasPan.x - (maximizedWidth / 2);
            const newY = -canvasPan.y - (maximizedHeight / 2);

            return {
                size: { width: maximizedWidth, height: maximizedHeight },
                position: { x: newX, y: newY }
            };
        }
        return null;
    };

    // Update maximized box when canvas changes
    useEffect(() => {
        console.log(title);
        if (!isMaximized) return;
        console.log(title + "why?2");
        const maximizedState = getMaximizedState();
        if (maximizedState) {
            setSize(maximizedState.size);
            setPosition(maximizedState.position);
        }
    }, [isMaximized, viewportSize, canvasPan, canvasZoom]);

    const handleHeaderMouseDown = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isDropdownOpen || isResizing) return;
        onFocus(id);
        if (isMaximized) {
            setPosition(previousState.position);
            setSize(previousState.size);
            setIsMaximized(false);
            return;
        }
        setIsDragging(true);
        setDragStart({x: e.clientX - position.x, y: e.clientY - position.y});
    };

    const handleWindowClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onFocus(id);
    };

    const handleMouseUp = () => {
        setIsDragging(false);
        setIsResizing(false);
        setResizeDirection(null);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDropdownOpen) return;
        if (isDragging) {
            setPosition({x: e.clientX - dragStart.x, y: e.clientY - dragStart.y});
        } else if (isResizing && resizeDirection) {
            const dx = e.clientX - resizeStart.x;
            const dy = e.clientY - resizeStart.y;

            let newWidth = resizeStartSize.width;
            let newHeight = resizeStartSize.height;
            let newX = resizeStartPosition.x;
            let newY = resizeStartPosition.y;

            if (resizeDirection.includes("e")) {
                newWidth = Math.max(400, resizeStartSize.width + dx);
            }
            if (resizeDirection.includes("s")) {
                newHeight = Math.max(360, resizeStartSize.height + dy);
            }
            if (resizeDirection.includes("w")) {
                newWidth = Math.max(400, resizeStartSize.width - dx);
                newX = resizeStartPosition.x + dx;
            }
            if (resizeDirection.includes("n")) {
                newHeight = Math.max(360, resizeStartSize.height - dy);
                newY = resizeStartPosition.y + dy;
            }
            setSize({width: newWidth, height: newHeight});
            setPosition({x: newX, y: newY});
        }
    };

    const handleResizeStart = (e: React.MouseEvent, direction: string) => {
        if (isDropdownOpen || isMaximized) return; // Prevent resize if dropdown is open or box is maximized
        e.stopPropagation();
        e.preventDefault();
        onFocus(id);
        setIsResizing(true);
        setResizeDirection(direction);
        setResizeStart({x: e.clientX, y: e.clientY});
        setResizeStartSize(size);
        setResizeStartPosition(position);
    };

    const toggleMaximize = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isDropdownOpen) return;

        if (isMaximized) {
            setPosition(previousState.position);
            setSize(previousState.size);
            setIsMaximized(false);
        } else {
            setPreviousState({
                position,
                size,
            });

            if (viewportSize.width > 0 && viewportSize.height > 0 && canvasZoom > 0) {
                const maximizedWidth = viewportSize.width / canvasZoom;
                const maximizedHeight = viewportSize.height / canvasZoom;

                setSize({width: maximizedWidth, height: maximizedHeight});

                const newX = -canvasPan.x - (maximizedWidth / 2);
                const newY = -canvasPan.y - (maximizedHeight / 2);
                setPosition({x: newX, y: newY});
                setIsMaximized(true);
            } else {
                console.warn("Cannot maximize: viewportSize or canvasZoom is invalid.", viewportSize, canvasZoom);
            }
        }
    };

    const handleClose = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onClose) onClose(id);
    };

    const applyPresetSize = (presetKey: keyof typeof WINDOW_SIZES) => {
        if (isMaximized) setIsMaximized(false);
        const newSize = WINDOW_SIZES[presetKey];
        setSize(newSize);
    };

    useEffect(() => {
        const handleGlobalMouseMove = (e: MouseEvent) => {
            if (isDropdownOpen) return;
            if (isDragging || isResizing) {
                handleMouseMove(e as unknown as React.MouseEvent);
            }
        };

        const handleGlobalMouseUp = () => {
            handleMouseUp();
        };

        if (isDragging || isResizing) {
            document.addEventListener("mousemove", handleGlobalMouseMove);
            document.addEventListener("mouseup", handleGlobalMouseUp);
        }

        return () => {
            document.removeEventListener("mousemove", handleGlobalMouseMove);
            document.removeEventListener("mouseup", handleGlobalMouseUp);
        };
    }, [isDragging, isResizing, dragStart, position, resizeDirection, resizeStart, resizeStartSize, resizeStartPosition, isDropdownOpen]); // Added dependencies

    const opacity = isDragging || isResizing ? 0.7 : 1;
    const defaultIcon = <Folder className="h-5 w-5 text-amber-500"/>;

    // Disable resizing controls when maximized
    const showResizeHandles = !isDropdownOpen && !isMaximized;

    return (
        <div
            ref={boxRef}
            className={cn(
                "box-container absolute flex flex-col bg-white dark:bg-slate-800 shadow-lg border border-blue-100 dark:border-slate-700 overflow-hidden transition-opacity",
                isDragging && "cursor-grabbing", "will-change-transform",
                isMaximized ? "border-blue-500 dark:border-blue-400" : "rounded-xl"
            )}
            style={{
                transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
                width: `${size.width}px`,
                height: `${size.height}px`,
                zIndex: box.zIndex,
                opacity,
            }}
            onClick={handleWindowClick}
            onMouseDown={(e) => {
                if (isResizing) e.stopPropagation();
            }}
        >
            <div
                className="h-12 bg-white dark:bg-slate-800 flex items-center justify-between px-4 cursor-grab border-b border-slate-100 dark:border-slate-700"
                onMouseDown={handleHeaderMouseDown}
            >
                <div className="flex items-center gap-3">
                    <div
                        className="select-none flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30">
                        {icon || defaultIcon}
                    </div>
                    <div className="select-none text-slate-800 dark:text-slate-200">{title}</div>
                </div>
                <div className="flex items-center gap-1 select-none">
                    <DropdownMenu onOpenChange={setIsDropdownOpen}>
                        <DropdownMenuTrigger asChild>
                            <button
                                disabled={isMaximized}
                                className={cn(
                                    "p-1.5 rounded-md transition-colors",
                                    isDropdownOpen
                                        ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                        : "text-slate-500 hover:bg-blue-100/50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400",
                                    isMaximized && "opacity-50 cursor-not-allowed"
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
                                {Object.keys(WINDOW_SIZES).map((key) => (
                                    <DropdownMenuItem
                                        key={key}
                                        onClick={() => applyPresetSize(key as keyof typeof WINDOW_SIZES)}
                                        className="flex items-center px-3 py-2 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 dark:hover:from-blue-900/20 dark:hover:to-indigo-900/20 rounded-md cursor-pointer transition-colors"
                                    >
                                        <div
                                            className={`w-${key === 'small' ? 3 : key === 'medium' ? 4 : key === 'large' ? 5 : 6} h-${key === 'small' ? 3 : key === 'medium' ? 4 : key === 'large' ? 5 : 6} rounded-sm border border-blue-200 dark:border-blue-700 mr-2`}></div>
                                        <span>{key.charAt(0).toUpperCase() + key.slice(1)} ({WINDOW_SIZES[key as keyof typeof WINDOW_SIZES].width}×{WINDOW_SIZES[key as keyof typeof WINDOW_SIZES].height})</span>
                                    </DropdownMenuItem>
                                ))}
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

            <div className="flex flex-1 overflow-hidden bg-slate-50 dark:bg-slate-900/50">
                {type == "local" ?  (
                            <>
                            <FileExplorer/>
                            </>
                ) : (
                    <>
                    <FileExplorer cloudType={box.cloudType} accountId={box.accountId}/>
                    </>
                )}
            </div>

            {!isMaximized && (
                <div className="absolute bottom-1 right-2 text-xs text-slate-400 pointer-events-none">
                    {Math.round(size.width)} × {Math.round(size.height)}
                </div>
            )}

            {showResizeHandles && (
                <>
                    {/* Corner resize handles */}
                    <div
                        className="absolute right-0 bottom-0 w-6 h-6 cursor-se-resize bg-transparent hover:bg-blue-500/10 z-10"
                        onMouseDown={(e) => handleResizeStart(e, "se")}/>
                    <div
                        className="absolute left-0 bottom-0 w-6 h-6 cursor-sw-resize bg-transparent hover:bg-blue-500/10 z-10"
                        onMouseDown={(e) => handleResizeStart(e, "sw")}/>
                    <div
                        className="absolute left-0 top-0 w-6 h-6 cursor-nw-resize bg-transparent hover:bg-blue-500/10 z-10"
                        onMouseDown={(e) => handleResizeStart(e, "nw")}/>
                    <div
                        className="absolute right-0 top-0 w-6 h-6 cursor-ne-resize bg-transparent hover:bg-blue-500/10 z-10"
                        onMouseDown={(e) => handleResizeStart(e, "ne")}/>
                    {/* Edge resize handles */}
                    <div className="absolute right-0 top-6 bottom-6 w-1 cursor-e-resize hover:bg-blue-500/10 z-10"
                         onMouseDown={(e) => handleResizeStart(e, "e")}/>
                    <div className="absolute left-6 right-6 bottom-0 h-1 cursor-s-resize hover:bg-blue-500/10 z-10"
                         onMouseDown={(e) => handleResizeStart(e, "s")}/>
                    <div className="absolute left-0 top-6 bottom-6 w-1 cursor-w-resize hover:bg-blue-500/10 z-10"
                         onMouseDown={(e) => handleResizeStart(e, "w")}/>
                    <div className="absolute left-6 right-6 top-0 h-1 cursor-n-resize hover:bg-blue-500/10 z-10"
                         onMouseDown={(e) => handleResizeStart(e, "n")}/>
                </>
            )}
        </div>
    );
}