import React, {memo, useImperativeHandle} from "react"
import {useState, useEffect, useRef} from "react"
import {X, Maximize2, Minimize2, ChevronDown, Folder, Box} from "lucide-react"
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
import {TargetLocation, useBoxDrag} from "@/contexts/BoxDragContext";




export const StorageBox = memo(
    React.forwardRef(StorageBoxInner),
    areEqual
);
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

const MIN_BOX_WIDTH = 400;
const MIN_BOX_HEIGHT = 360;


function StorageBoxInner({
                             box,
                             onClose,
                             onFocus,
                             viewportSize,
                             canvasZoom,
                             canvasPan,
                             isMaximized,
                             setIsMaximized,
                             tempPostFile,
                             tempGetFile,
                             onBoxTransfer
                         }: StorageBoxProps, 
                         ref: React.Ref<{
                            callDoRefresh: () => void; 
                                }>
                        ) {
    const {id, title, type, icon} = box;
    const BoxDrag = useBoxDrag();

    const positionRef = useRef(box.position);
    const sizeRef = useRef(box.size);
    const prevStateRef = useRef({position: box.position, size: box.size});

    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({x: 0, y: 0});
    const [isResizing, setIsResizing] = useState(false);
    const [resizeDirection, setResizeDirection] = useState<string | null>(null);
    const [resizeStart, setResizeStart] = useState({x: 0, y: 0});
    const [resizeStartSize, setResizeStartSize] = useState(box.size);
    const [resizeStartPosition, setResizeStartPosition] = useState(box.position);


    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);

    const [isDropZoneActive, setIsDropZoneActive] = useState(false);
    const [currentPath, setCurrentPath] = useState("/");

    const [refreshToggle, setRefreshToggle] = useState(false);

    const doRefresh = () => {
        console.log("Function called from parent for box", box.id);
          setRefreshToggle(!refreshToggle); // Toggle to trigger a refresh in the FileExplorer
        // You can add any custom behavior here
      }

    useImperativeHandle(ref, () => ({
        callDoRefresh: doRefresh,
      }));

    const handleCurrentPathChange = (newPath: string) => {
        setCurrentPath(newPath);
    };

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

    // update box style based on position and size refs
    function updateBox() {
        if (boxRef.current) {
            boxRef.current.style.transform = `translate3d(${positionRef.current.x}px, ${positionRef.current.y}px, 0)`;
            boxRef.current.style.width = `${sizeRef.current.width}px`;
            boxRef.current.style.height = `${sizeRef.current.height}px`;
        }
    }

    // Handle drag box to box drag detection
    useEffect(() => {
        const handleDragOver = (e: MouseEvent) => {
            if (!boxRef.current || !BoxDrag.isDragging) return;
            console.log("handleDragOver");

            const rect = boxRef.current.getBoundingClientRect();
            const isOverBox = e.clientX >= rect.left &&
                e.clientX <= rect.right &&
                e.clientY >= rect.top &&
                e.clientY <= rect.bottom;

            // const isValidTarget = BoxDrag.isValidDropTarget(id);
            // Check if the target is a valid drop target (the box is not the source box)
            const isValidTarget = BoxDrag.isDragging && BoxDrag.sourceBoxId != id;

            setIsDropZoneActive(isOverBox && isValidTarget);

            // TODO maybe not update if not over box is not changed?
            // set the target location (box id, folder path within the box)
            BoxDrag.setTarget({
                boxId: id,
                targetPath: currentPath, // Assuming currentPath is the folder path within the box
                // No specific target ID for box-to-box transfer
            }); 
        };

        const handleDrop = async (e: MouseEvent) => {
            console.log("handleDrop");
            document.removeEventListener('mousemove', handleDragOver);
            document.removeEventListener('mouseup', handleDrop);
            if (!BoxDrag.isDragging) {
                return;
            }

            // Check if the drop happened within this box
            if (boxRef.current) {
                const rect = boxRef.current.getBoundingClientRect();
                const isDroppedOnBox = e.clientX >= rect.left &&
                    e.clientX <= rect.right &&
                    e.clientY >= rect.top &&
                    e.clientY <= rect.bottom;

                if (isDroppedOnBox) {
                    if (isDropZoneActive) {
                        console.log("Box drop detected on box:", id);
                        console.log("BoxDrag Context:", BoxDrag);

                        await tempPostFile?.(currentPath, box.cloudType, box.accountId);
                        setRefreshToggle(!refreshToggle); // Trigger a refresh in the FileExplorer

                        // Call the box transfer handler in HomePage
                        // if (onBoxTransfer) {
                            // onBoxTransfer(BoxDrag.dragItems, id, currentPath); TODO
                        // }
                    }
                    // BoxDrag.endBoxDrag();
                    BoxDrag.setDragItems([], null);
                    BoxDrag.setIsDragging(false);
                    setIsDropZoneActive(false);
                }
            }
        };

        if (BoxDrag.isDragging) {
            document.addEventListener('mousemove', handleDragOver);
            document.addEventListener('mouseup', handleDrop);
        }
    }, [BoxDrag.isDragging, id, box.cloudType, box.accountId, isDropZoneActive]);

    // Update maximized box when canvas changes
    useEffect(() => {
        console.log(title);
        if (!isMaximized) return;
        console.log(title + "why?2");
        const maximizedState = getMaximizedState();
        if (maximizedState) {
            sizeRef.current = maximizedState.size;
            positionRef.current = maximizedState.position;
            updateBox();
        }
    }, [isMaximized, viewportSize, canvasPan, canvasZoom]);

    useEffect(() => {
        console.log("Rendering StorageBox for:", title);
    }, []);


    const handleHeaderMouseDown = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isDropdownOpen || isResizing) return;

        onFocus(id);

        if (isMaximized) {
            positionRef.current = prevStateRef.current.position;
            sizeRef.current = prevStateRef.current.size;
            setIsMaximized(false);
            updateBox();
            return;
        }

        setIsDragging(true);

        setDragStart({
            x: e.clientX - positionRef.current.x,
            y: e.clientY - positionRef.current.y
        });
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
            // Simple and correct drag calculation
            const newX = e.clientX - dragStart.x;
            const newY = e.clientY - dragStart.y;


            // Update the ref
            positionRef.current = { x: newX, y: newY };

            updateBox();
       } else if (isResizing && resizeDirection) {
           const dx = e.clientX - resizeStart.x;
           const dy = e.clientY - resizeStart.y;


           let newWidth = resizeStartSize.width;
           let newHeight = resizeStartSize.height;
           let newX = resizeStartPosition.x;
           let newY = resizeStartPosition.y;


           if (resizeDirection.includes("e")) {
               newWidth = Math.max(MIN_BOX_WIDTH, resizeStartSize.width + dx);
           }
           if (resizeDirection.includes("s")) {
               newHeight = Math.max(MIN_BOX_HEIGHT, resizeStartSize.height + dy);
           }
           if (resizeDirection.includes("w")) {
               newWidth = Math.max(MIN_BOX_WIDTH, resizeStartSize.width - dx);
               // cursor on the west side
               if (dx < 0) {
                // when the size increases to the left, x should be adjusted
                    newX = resizeStartPosition.x + dx;
                } else {
                    // when the size decrease to the right, x should be fixed if width is 400, minimum width
                    // otherwise, it should be updated according to the dx
                    if (newWidth > MIN_BOX_WIDTH) {
                        newX = resizeStartPosition.x + dx;
                    }
                    else if (newWidth <= MIN_BOX_WIDTH) {
                        newX = positionRef.current.x;
                    }
                }
               
           }
           if (resizeDirection.includes("n")) {
               newHeight = Math.max(MIN_BOX_HEIGHT, resizeStartSize.height - dy);
               if (dy < 0) {
                   newY = resizeStartPosition.y + dy;
               } else {
                    // when the size decrease to the right, x should be fixed if width is 400, minimum width
                    // otherwise, it should be updated according to the dx
                    if (newHeight > MIN_BOX_HEIGHT) {
                        newY = resizeStartPosition.y + dy;
                    }
                    else if (newHeight <= MIN_BOX_HEIGHT) {
                        newY = positionRef.current.y;
                    }
               }
           }
          
           sizeRef.current = {width: newWidth, height: newHeight};
           positionRef.current = { x: newX, y: newY };
           updateBox();
        }
    };


    // Add initial transform application in useEffect
    useEffect(() => {
        if (boxRef.current) {
            boxRef.current.style.transform = `translate3d(${positionRef.current.x}px, ${positionRef.current.y}px, 0)`;
            boxRef.current.style.width = `${sizeRef.current.width}px`;
            boxRef.current.style.height = `${sizeRef.current.height}px`;
        }
    }, []);


    const handleResizeStart = (e: React.MouseEvent, direction: string) => {
        if (isDropdownOpen || isMaximized) return; // Prevent resize if dropdown is open or box is maximized
        e.stopPropagation();
        e.preventDefault();
        onFocus(id);
        setIsResizing(true);
        setResizeDirection(direction);
        setResizeStart({x: e.clientX, y: e.clientY});
        setResizeStartSize(sizeRef.current);
        setResizeStartPosition(positionRef.current);
    };


    const toggleMaximize = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isDropdownOpen) return;


        console.log("Toggling maximize state for box:", isMaximized);


        if (isMaximized) {
            sizeRef.current = prevStateRef.current.size;
            positionRef.current = prevStateRef.current.position;
            setIsMaximized(false);
            console.log("Restoring previous state:", prevStateRef.current);
        } else {
            prevStateRef.current = {
                position: positionRef.current,
                size: sizeRef.current
            };


            if (viewportSize.width > 0 && viewportSize.height > 0 && canvasZoom > 0) {
                const maximizedWidth = viewportSize.width / canvasZoom;
                const maximizedHeight = viewportSize.height / canvasZoom;


                sizeRef.current = {width: maximizedWidth, height: maximizedHeight};


                const newX = -canvasPan.x - (maximizedWidth / 2);
                const newY = -canvasPan.y - (maximizedHeight / 2);
                positionRef.current = { x: newX, y: newY };
                console.log("Maximizing box to:", positionRef.current, sizeRef.current);
                setIsMaximized(true);
                console.log("isMaximized set to true", isMaximized);
            } else {
                console.warn("Cannot maximize: viewportSize or canvasZoom is invalid.", viewportSize, canvasZoom);
            }

        }
        updateBox();
    };


    const handleClose = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onClose) onClose(id);
    };


    const applyPresetSize = (presetKey: keyof typeof WINDOW_SIZES) => {
        if (isMaximized) setIsMaximized(false);
        const newSize = WINDOW_SIZES[presetKey];
        // setSize(newSize);
        sizeRef.current = newSize;
    };


    useEffect(() => {
        console.log("StorageBox useEffect triggered");
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
    }, [isDragging, isResizing, dragStart, resizeDirection, resizeStart, resizeStartSize, resizeStartPosition, isDropdownOpen]); // Added dependencies


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
                isMaximized ? "border-blue-500 dark:border-blue-400" : "rounded-xl",
                isDropZoneActive && "ring-4 ring-green-400 bg-green-50 dark:bg-green-900/20 border-green-400"
            )}
            style={{
                zIndex: box.zIndex,
                opacity,
            }}
            onClick={handleWindowClick}
            onMouseDown={(e) => {
                if (isResizing) e.stopPropagation();
            }}
        >
            {isDropZoneActive && (
                <div className="absolute inset-0 bg-green-100/50 dark:bg-green-900/30 border-4 border-green-400 border-dashed rounded-xl flex items-center justify-center z-20 pointer-events-none select-none">
                    <div className="bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg font-medium">
                        Drop files here to transfer
                    </div>
                </div>
            )}
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
                        <FileExplorer tempGetFile={tempGetFile} tempPostFile={tempPostFile} boxId={id} isBoxToBoxTransfer={isDropZoneActive} onCurrentPathChange={handleCurrentPathChange} refreshToggle={refreshToggle}/>
                    </>
                ) : (
                    <>
                        <FileExplorer cloudType={box.cloudType} accountId={box.accountId} tempGetFile={tempGetFile} tempPostFile={tempPostFile} boxId={id} isBoxToBoxTransfer={isDropZoneActive} onCurrentPathChange={handleCurrentPathChange} refreshToggle={refreshToggle} />
                    </>
                )}
            </div>

            {!isMaximized && (
                <div className="absolute bottom-1 right-2 text-xs text-slate-400 pointer-events-none">
                    {/* {Math.round(size.width)} × {Math.round(size.height)} */}
                    {Math.round(sizeRef.current.width)} × {Math.round(sizeRef.current.height)}
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



