/**
 * StorageBox Component
 * 
 * A draggable, resizable window component that displays file explorers for local and cloud storage.
 * Contains the logic for maximization, file drag-and-drop between boxes, and preset sizing options.
 */

import React, {memo, useMemo, useCallback, useImperativeHandle} from "react"
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
import {StorageBoxProps, WINDOW_SIZES, MIN_BOX_HEIGHT, MIN_BOX_WIDTH} from "@Types/box";
import {FileExplorer} from "@/components/box/FileExplorer";
import {useBoxDrag} from "@/contexts/BoxDragContext";
import {CloudType} from "@Types/cloudType";

/**
 * Memoized StorageBox component with an equality comparison
 * to prevent unnecessary re-renders during canvas pan/zoom operations
 */
export const StorageBox = memo(
    React.forwardRef(StorageBoxInner),
    areEqual
);

/**
 * Checks if the box needs to be redrawn
 * Returns true = don't redraw (nothing changed)
 * Returns false = redraw it (something changed)
 */
function areEqual(prev: StorageBoxProps, next: StorageBoxProps) {
    // Check if the box ID, maximized state, and zIndex have changed
    if (prev.box.id !== next.box.id || 
        prev.isMaximized !== next.isMaximized ||
        prev.box.zIndex !== next.box.zIndex) {
        return false;
    }
    
    // If both boxes are not maximized, compare position, size, viewport size, and canvas zoom
    if (!prev.isMaximized && !next.isMaximized) {
        return (
            prev.box.position === next.box.position &&
            prev.box.size === next.box.size &&
            prev.viewportSize.width === next.viewportSize.width &&
            prev.viewportSize.height === next.viewportSize.height &&
            prev.canvasZoom === next.canvasZoom
        );
    }
    
    // For full-screen boxes, only redraw if the view moved a lot
    const panThreshold = 1; // Only care if it moved more than 1 pixel
    const panXDiff = Math.abs(prev.canvasPan.x - next.canvasPan.x);
    const panYDiff = Math.abs(prev.canvasPan.y - next.canvasPan.y);
    
    return (
        prev.box.position === next.box.position &&
        prev.box.size === next.box.size &&
        prev.viewportSize.width === next.viewportSize.width &&
        prev.viewportSize.height === next.viewportSize.height &&
        prev.canvasZoom === next.canvasZoom &&
        panXDiff < panThreshold &&
        panYDiff < panThreshold
    );
}

/**
 * Main StorageBox component implementation
 * Handles all box interactions, animations, and state management
 */
function StorageBoxInner({
                             box,               // Info about this box (name, position, etc.)
                             onClose,           // What to do when user closes the box
                             onFocus,           // What to do when user clicks on the box
                             viewportSize,      // How big the screen is
                             canvasZoom,        // How zoomed in the view is
                             canvasPan,         // Where the view is looking
                             isMaximized,       // Is this box full screen?
                             setIsMaximized,    // Function to make box full screen or no
                             tempPostFile,      // Function to upload files
                             tempGetFile,       // Function to download files
                             tempDragDropTransfer, // Function to handle drag and drop with confirmation first
                         }: StorageBoxProps, 
                         ref: React.Ref<{}>
                        ) {

    /** Get the basic info from the box data */
    const {id, title, type, icon} = box;

    /** Connect to the system that handles dragging files between boxes from @Context/BoxDragContext */
    const BoxDrag = useBoxDrag();

    /** Keep track of where the box is and how big it is */
    const positionRef = useRef(box.position); // Where the box is on screen
    const sizeRef = useRef(box.size); // How big the box is
    const prevStateRef = useRef({position: box.position, size: box.size}); // Remember size before full screen

    /** Track when the browser window is being resized  */
    const [isWindowResizing, setIsWindowResizing] = useState(false);
    const windowResizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    /** Keep track of what the user is doing with the mouse */
    const isDraggingRef = useRef(false); // Is user dragging the box?
    const [dragStart, setDragStart] = useState({x: 0, y: 0});  // Where did the drag start?

    const isResizingRef = useRef(false); // Is user resizing the box?
    const [resizeDirection, setResizeDirection] = useState<string | null>(null); // Which corner/edge are they pulling?
    const [resizeStart, setResizeStart] = useState({x: 0, y: 0}); // Where did resize start?
    const [resizeStartSize, setResizeStartSize] = useState(box.size);  // How big was it when resize started?
    const [resizeStartPosition, setResizeStartPosition] = useState(box.position); // Where was it when resize started?

    /** Track if the dropdown menu is open (affects how mouse events work) */
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    /** Reference to the actual HTML element so we can change it directly */
    const boxRef = useRef<HTMLDivElement>(null);

    /** Keep track of time to limit how often we update (for performance) */
    const lastUpdateTimeRef = useRef<number>(0);

    /** Show green highlight when user drags files over this box */
    const [isDropZoneActive, setIsDropZoneActive] = useState(false);

    /** Keep track of which folder the user is looking at */
    const [currentPath, setCurrentPath] = useState("/");

    /**
     * Toggle this to make the file list refresh
     * When this changes, the FileExplorer component will reload its files
     */
    const [refreshToggle, setRefreshToggle] = useState(false);
    
    /** 
     * Ref to track if the next refresh should be silent
     */
    const nextRefreshSilentRef = useRef(false);

    const fileExplorerRef = React.createRef<any>();

    /** 
     * Function to refresh the file list
     * Parent components can call this through the ref
     */
    const doRefresh = (silent: boolean = false) => {
        nextRefreshSilentRef.current = silent;
        setRefreshToggle(!refreshToggle);
    };

    /**
     * Let parent components control this box directly
     * This is like giving them a remote control for the box
     */
    useImperativeHandle(ref, () => ({
        /**
         * Let parent refresh the file list
         */
        callDoRefresh: (silent?: boolean) => doRefresh(silent),
        setStyle: (style: Partial<CSSStyleDeclaration>) => {
            if (boxRef.current) {
                Object.assign(boxRef.current.style, style);
            }
        },
        getCurrentState: () => {
            return {
                position: positionRef.current,
                size: sizeRef.current,
                currentPath: currentPath,
                isMaximized: isMaximized,
            };
        },
        // used by dashboard.tsx to set the position of the box (invoked when agent worked on it)
        setPosition: (newPosition: {x: number, y: number}) => {
            if (boxRef.current) {
                positionRef.current = newPosition;
                boxRef.current.style.transform = `translate3d(${newPosition.x}px, ${newPosition.y}px, 0)`;
            }
        },

        setPath: (newPath: string) => {
            if (boxRef.current) {
                setCurrentPath(newPath);
                if (fileExplorerRef.current) {
                    fileExplorerRef.current.updatePath(newPath);
                }
            }
        },

        // Highlight the box with a pulsing animation
        // used when storage box is moved to current view position by Agent
        highlightBoxAnimation: (duration: number = 400) => {
            if (boxRef.current) {
                const element = boxRef.current;
                
                // Add CSS class for smooth pulsing animation
                const style = document.createElement('style');
                style.textContent = `
                    @keyframes pulseGlow {
                        0%, 100% { 
                            box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5), 
                                        0 0 20px rgba(59, 130, 246, 0.3),
                                        0 0 40px rgba(59, 130, 246, 0.1); 
                        }
                        50% { 
                            box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.8), 
                                        0 0 30px rgba(59, 130, 246, 0.5),
                                        0 0 60px rgba(59, 130, 246, 0.2); 
                        }
                    }
                    .highlight-pulse {
                        animation: pulseGlow ${duration}ms ease-in-out;
                        border-radius: 8px;
                    }
                `;
                
                if (!document.head.querySelector('#highlight-styles')) {
                    style.id = 'highlight-styles';
                    document.head.appendChild(style);
                }
                
                element.classList.add('highlight-pulse');
                
                setTimeout(() => {
                    element.classList.remove('highlight-pulse');
                }, duration);
            }
        }
    }));

    /** Update the current folder path when user navigates */
    const handleCurrentPathChange = useCallback((newPath: string) => {
        setCurrentPath(newPath);
    }, []);

    /** 
     * Calculate where and how big a full-screen box should be
     * This considers the current view position and zoom level
     */
    const getMaximizedState = useMemo(() => {
        // Make sure we have valid numbers before calculating
        if (viewportSize.width > 0 && viewportSize.height > 0 && canvasZoom > 0) {

            // Full screen size adjusted for zoom level
            const maximizedWidth = viewportSize.width / canvasZoom;
            const maximizedHeight = viewportSize.height / canvasZoom;

            // Center the box in the current view
            const newX = -canvasPan.x - (maximizedWidth / 2);
            const newY = -canvasPan.y - (maximizedHeight / 2);

            return {
                size: { width: maximizedWidth, height: maximizedHeight },
                position: { x: newX, y: newY }
            };
        }
        return null;
    }, [viewportSize.width, viewportSize.height, canvasZoom, canvasPan.x, canvasPan.y]);

    /** 
     * Actually move and resize the box on screen
     * This directly changes the HTML element
     */
    const updateBox = useCallback((useTransition: boolean = false) => {
        if (boxRef.current) {
            const element = boxRef.current;

            // Create the CSS values for position and size
            const transform = `translate3d(${positionRef.current.x}px, ${positionRef.current.y}px, 0)`;
            const width = `${sizeRef.current.width}px`;
            const height = `${sizeRef.current.height}px`;
            
            if (useTransition && isMaximized) {
                element.style.transition = 'width 0.2s ease-out, height 0.2s ease-out, transform 0.2s ease-out';
            } else {
                element.style.transition = ''; // No animation for normal dragging/resizing
            }

            // Only update if the value actually changed
            
            if (element.style.transform !== transform) {
                element.style.transform = transform;
            }
            if (element.style.width !== width) {
                element.style.width = width;
            }
            if (element.style.height !== height) {
                element.style.height = height;
            }
        }
    }, [isMaximized]);

    /** 
     * Handle dragging files from one box to another
     * This listens for mouse movement when files are being dragged
     */
    useEffect(() => {

        /**
         * Check if files are being dragged over this box
         */
        const handleDragOver = (e: MouseEvent) => {
            // Exit early if no box or no files being dragged
            if (!boxRef.current || !BoxDrag.isDragging) return;


            // Check if the mouse is over THIS box (not another box on top)
            const elementAtPoint = document.elementFromPoint(e.clientX, e.clientY);
            const isTopMostBox = elementAtPoint && (
                boxRef.current === elementAtPoint || 
                boxRef.current.contains(elementAtPoint)
            );

            if (!isTopMostBox) {
                setIsDropZoneActive(false); // Turn off green highlight
                return;
            }

            // Check if mouse is actually inside the box boundaries
            const rect = boxRef.current.getBoundingClientRect();
            const isOverBox = e.clientX >= rect.left &&
                e.clientX <= rect.right &&
                e.clientY >= rect.top &&
                e.clientY <= rect.bottom;

            // Only show green highlight if dragging files from a DIFFERENT box
            const isValidTarget = BoxDrag.isDragging && BoxDrag.sourceBoxId != id;

            setIsDropZoneActive(isOverBox && isValidTarget);

            // Tell the drag system this box is a potential target
            if (isOverBox && isValidTarget) {
                BoxDrag.setTarget({
                    boxId: id,
                    targetPath: currentPath, 
                }); 
            }
        };


        /**
         * Handle actually dropping the files
         */
        const handleDrop = async (e: MouseEvent) => {
            document.removeEventListener('mouseup', handleDrop);
            document.removeEventListener('mousemove', handleDragOver);
            
            // Exit if no files being dragged
            if (!BoxDrag.isDragging) {
                return;
            }

            // Check if dropped on THIS box
            const elementAtPoint = document.elementFromPoint(e.clientX, e.clientY);
            const isTopMostBox = elementAtPoint && (
                boxRef.current === elementAtPoint || 
                boxRef.current!.contains(elementAtPoint)
            );

            if (!isTopMostBox) {
                return; // Dropped somewhere else
            }

            if (boxRef.current) {
                 // Double-check the drop location, to ensure it's within the box
                const rect = boxRef.current.getBoundingClientRect();
                const isDroppedOnBox = e.clientX >= rect.left &&
                    e.clientX <= rect.right &&
                    e.clientY >= rect.top &&
                    e.clientY <= rect.bottom;

                if (isDroppedOnBox) {
                    // Actually transfer the files if green highlight was shown
                    if (isDropZoneActive) {
                        // Handle drag and drop operation
                        const handleDragDropTransfer = async () => {
                            if (BoxDrag.isDragging && BoxDrag.dragItems.items.length > 0) {
                                try {
                                    // Get source cloud information from drag context
                                    const sourceCloudType = BoxDrag.dragItems.sourceCloudType;
                                    const sourceAccountId = BoxDrag.dragItems.sourceAccountId;
                                    const draggedItems = BoxDrag.dragItems.items;
                                    
                                    
                                    const filePaths = draggedItems.map(item => item.path);
                                    await tempDragDropTransfer?.(
                                        filePaths, 
                                        sourceCloudType as any, 
                                        sourceAccountId,
                                        currentPath,
                                        box.cloudType,
                                        box.accountId
                                    );
                                } catch (error) {
                                }
                            } else {
                                // Regular transfer (not drag and drop)
                                try {
                                    await tempPostFile?.(currentPath, box.cloudType, box.accountId);
                                } catch (error) {
                                }
                            }
                        };
                        
                        await handleDragDropTransfer();
                        setRefreshToggle(!refreshToggle); // Refresh file list to show new files
                    }
                    // Clean up the drag operation
                    BoxDrag.setDragItems([], null);
                    BoxDrag.setIsDragging(false);
                    setIsDropZoneActive(false);
                }
            }
        };

        // Set up event listeners when files start being dragged
        if (BoxDrag.isDragging) {
            document.addEventListener('mousemove', handleDragOver);
            document.addEventListener('mouseup', handleDrop);
        }
    }, [BoxDrag.isDragging, id, box.cloudType, box.accountId, isDropZoneActive]);

    /** 
     * Handle browser window resizing for full-screen boxes
     * When the browser window changes size, full-screen boxes need to adjust
     */
    useEffect(() => {
        if (!isMaximized) return; // Only care about full-screen boxes

        const handleWindowResize = () => {
            setIsWindowResizing(true); // Start resize animation mode
            
            // Clear any existing timeout
            if (windowResizeTimeoutRef.current) {
                clearTimeout(windowResizeTimeoutRef.current);
            }
            
            // Stop resize animation mode after a short delay
            windowResizeTimeoutRef.current = setTimeout(() => {
                setIsWindowResizing(false);
            }, 150);
        };

        // Listen for browser window resize
        window.addEventListener('resize', handleWindowResize);
        
        return () => {
            window.removeEventListener('resize', handleWindowResize);
            if (windowResizeTimeoutRef.current) {
                clearTimeout(windowResizeTimeoutRef.current);
            }
        };
    }, [isMaximized]);

    /** 
     * Keep full-screen boxes properly sized and positioned
     * This runs every frame to keep the box centered and full-screen
     */
    useEffect(() => {
        if (!isMaximized) return; // Only for full-screen boxes
         
        let animationFrameId: number | null = null;
        
        const updateMaximizedBox = () => {
            const now = performance.now();
            // Slow down updates during window resize 
            const throttleDelay = isWindowResizing ? 50 : 16;
            
            // Skip this update if not enough time has passed
            if (now - lastUpdateTimeRef.current < throttleDelay) {
                return;
            }
            
            lastUpdateTimeRef.current = now;
            
             // Calculate new full-screen size and position
            const maximizedState = getMaximizedState;
            if (maximizedState) {
                const prevSize = { ...sizeRef.current };
                const prevPosition = { ...positionRef.current };
                
                // Update the box's size and position
                sizeRef.current = maximizedState.size;
                positionRef.current = maximizedState.position;
                
                // Check if anything actually changed
                const sizeChanged = prevSize.width !== maximizedState.size.width || 
                                  prevSize.height !== maximizedState.size.height;
                const positionChanged = prevPosition.x !== maximizedState.position.x || 
                                      prevPosition.y !== maximizedState.position.y;
                
                // Update the visual box
                updateBox(isWindowResizing && (sizeChanged || positionChanged));
            }
        };
        
        animationFrameId = requestAnimationFrame(updateMaximizedBox);
        
        return () => {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
        };
    }, [isMaximized, viewportSize, canvasPan, canvasZoom, updateBox, isWindowResizing, getMaximizedState]);

    /** 
     * Set up the box's initial position and size when it first appears
     */
    useEffect(() => {
        if (boxRef.current) {
            boxRef.current.style.transform = `translate3d(${positionRef.current.x}px, ${positionRef.current.y}px, 0)`;
            boxRef.current.style.width = `${sizeRef.current.width}px`;
            boxRef.current.style.height = `${sizeRef.current.height}px`;
        }
    }, []);

    /** 
     * Handle clicking and dragging the header bar
     */
    const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();

        // Don't start dragging if dropdown is open or already resizing
        if (isDropdownOpen || isResizingRef.current) return;

        // If box is full-screen, clicking header should un-maximize it
        if (isMaximized) {
            positionRef.current = prevStateRef.current.position; // Restore old position
            sizeRef.current = prevStateRef.current.size;  // Restore old size
            setIsMaximized(false);
            updateBox();
            return;
        }

        // Start dragging
        isDraggingRef.current = true;
        
        requestAnimationFrame(() => {
            isDraggingRef.current = true;
            if (boxRef.current) {
                boxRef.current.style.opacity = '0.7';
            }
            
            // Calculate offset from mouse to box corner
            const dragStartX = e.clientX - positionRef.current.x;
            const dragStartY = e.clientY - positionRef.current.y;
            setDragStart({
                x: dragStartX,
                y: dragStartY   
            });
        });
        
        // Tell parent this box is now focused (brings it to front)
        onFocus?.(id);
    }, [onFocus, id, isDropdownOpen, isMaximized, updateBox]);

    /** 
     * Prevent clicks inside the box from bubbling up to parent
     */
    const handleWindowClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
    }, [id]);

    /** 
     * Handle when user releases mouse button (stop dragging/resizing)
     */
    const handleMouseUp = useCallback(() => {
        requestAnimationFrame(() => {
            isDraggingRef.current = false;
            if (boxRef.current) {
                boxRef.current.style.opacity = '1';  // Back to full opacity
                boxRef.current.style.willChange = 'transform';
            }
            isResizingRef.current = false;
            setResizeDirection(null);
        });
    }, []);
    
    /** 
     * Handle mouse movement for dragging and resizing
     * This is the main function that makes dragging and resizing work
     */
    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (isDropdownOpen) return;  // Don't drag/resize when dropdown is open

        if (isDraggingRef.current) {
            // Calculate new position based on mouse movement
            const newX = e.clientX - dragStart.x;
            const newY = e.clientY - dragStart.y;

            positionRef.current = { x: newX, y: newY };
            updateBox(); // Move the box visually
        } else if (isResizingRef.current && resizeDirection) {
            console.log('Resizing in direction:', resizeDirection);
            // Calculate how much the mouse moved since resize started
           const dx = e.clientX - resizeStart.x;
           const dy = e.clientY - resizeStart.y;

           // Start with original size and position
           let newWidth = resizeStartSize.width;
           let newHeight = resizeStartSize.height;
           let newX = resizeStartPosition.x;
           let newY = resizeStartPosition.y;

            // Handle resizing from the right edge (east)
           if (resizeDirection.includes("e")) {
               newWidth = Math.max(MIN_BOX_WIDTH, resizeStartSize.width + dx);
           }

            // Handle resizing from the bottom edge (south)
           if (resizeDirection.includes("s")) {
               newHeight = Math.max(MIN_BOX_HEIGHT, resizeStartSize.height + dy);
           }

           // Handle resizing from the left edge (west) 
           if (resizeDirection.includes("w")) {
               newWidth = Math.max(MIN_BOX_WIDTH, resizeStartSize.width - dx);
               if (dx < 0) {
                    // Mouse moved left - box gets bigger and position moves left
                    newX = resizeStartPosition.x + dx;
                } else {
                    // Mouse moved right - box gets smaller
                    if (newWidth > MIN_BOX_WIDTH) {
                        newX = resizeStartPosition.x + dx; // Position moves right
                    } else if (newWidth <= MIN_BOX_WIDTH) {
                        newX = positionRef.current.x;  // Keep current position when at minimum
                    }
                }
           }
           // Handle resizing from the top edge (north) 
           if (resizeDirection.includes("n")) {
               newHeight = Math.max(MIN_BOX_HEIGHT, resizeStartSize.height - dy);
               if (dy < 0) {
                    // Mouse moved up - box gets bigger and position moves up
                   newY = resizeStartPosition.y + dy;
               } else {
                    // Mouse moved down - box gets smaller
                    if (newHeight > MIN_BOX_HEIGHT) {
                        newY = resizeStartPosition.y + dy; // Position moves down
                    } else if (newHeight <= MIN_BOX_HEIGHT) {
                        newY = positionRef.current.y;  // Keep current position when at minimum
                    }
               }
           }
          
           sizeRef.current = {width: newWidth, height: newHeight};
           positionRef.current = { x: newX, y: newY };
           updateBox(); // Update the visual box
        }
    }, [isDropdownOpen, dragStart, resizeDirection, resizeStart.x, resizeStart.y, resizeStartSize, resizeStartPosition, updateBox]);

    /** 
     * Start a resize operation when user clicks on a resize handle
     */
    const handleResizeStart = (e: React.MouseEvent, direction: string) => {
        if (isDropdownOpen || isMaximized) return; // Can't resize when dropdown open or full-screen
        
        e.stopPropagation();
        e.preventDefault();

        onFocus?.(id); // Bring box to front

        // Set up resize state
        isResizingRef.current = true;
        setResizeDirection(direction); // Remember which handle was clicked (e.g., "se", "n", "w")
        setResizeStart({x: e.clientX, y: e.clientY}); // Remember where mouse was when resize started
        setResizeStartSize(sizeRef.current); // Remember starting size
        setResizeStartPosition(positionRef.current); // Remember starting position
    };

    /** 
     * Toggle between full-screen and normal size
     */
    const toggleMaximize = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isDropdownOpen) return;

        if (isMaximized) {
            // Going from full-screen back to normal
            sizeRef.current = prevStateRef.current.size;
            positionRef.current = prevStateRef.current.position;
            setIsMaximized(false);
        } else {
            // Going from normal to full-screen
            // First, save current state so we can restore it later
            prevStateRef.current = {
                position: positionRef.current,
                size: sizeRef.current
            };

            // Calculate full-screen size and position
            if (viewportSize.width > 0 && viewportSize.height > 0 && canvasZoom > 0) {
                const maximizedWidth = viewportSize.width / canvasZoom;
                const maximizedHeight = viewportSize.height / canvasZoom;

                sizeRef.current = {width: maximizedWidth, height: maximizedHeight};

                // Center the box in the current view
                const newX = -canvasPan.x - (maximizedWidth / 2);
                const newY = -canvasPan.y - (maximizedHeight / 2);
                positionRef.current = { x: newX, y: newY };
                setIsMaximized(true);
            }
        }
        updateBox();
    };

    /** 
     * Handle the close button
     */
    const handleClose = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onClose) onClose(id); // Tell parent to close this box
    };

    /** 
     * Apply a preset size from the dropdown menu
     */
    const applyPresetSize = (presetKey: keyof typeof WINDOW_SIZES) => {
        if (isMaximized) setIsMaximized(false); 
        const newSize = WINDOW_SIZES[presetKey]; 
        sizeRef.current = newSize;
    };

    /** 
     * Set up global mouse listeners for dragging and resizing
     * This allows dragging/resizing to work even when mouse goes outside the box
     */
    useEffect(() => {
        /**
         * Handle mouse movement anywhere on the page during drag/resize
         */
        const handleGlobalMouseMove = (e: MouseEvent) => {
            if (isDropdownOpen) return;
            if (isDraggingRef.current || isResizingRef.current) {
                // Convert global mouse event to React mouse event format
                handleMouseMove(e as unknown as React.MouseEvent);
            }
        };

        /**
         * Handle mouse release anywhere on the page
         */
        const handleGlobalMouseUp = () => {
            document.removeEventListener("mousemove", handleGlobalMouseMove);
            document.removeEventListener("mouseup", handleGlobalMouseUp);
            handleMouseUp();
        };

        // Set up listeners when dragging or resizing starts
        if (isDraggingRef.current || isResizingRef.current) {
            document.addEventListener("mousemove", handleGlobalMouseMove);
            document.addEventListener("mouseup", handleGlobalMouseUp);
        }

        return () => {
            document.removeEventListener("mousemove", handleGlobalMouseMove);
            document.removeEventListener("mouseup", handleGlobalMouseUp);
        };
    }, [dragStart, resizeDirection, resizeStart, resizeStartSize, resizeStartPosition, isDropdownOpen]);

    /** How transparent the box should be (slightly faded when dragging/resizing) */
    const opacity = isDraggingRef.current || isResizingRef.current ? 0.7 : 1;

    /** Default folder icon if no custom icon provided */
    const defaultIcon = <Folder className="h-5 w-5 text-amber-500"/>;

    /** Should we show the resize handles? (not when dropdown open or full-screen) */
    const showResizeHandles = !isDropdownOpen && !isMaximized;

    return (
        <div
            ref={boxRef}
                className={cn(
                    "box-container absolute flex flex-col bg-white dark:bg-slate-800 shadow-lg border border-blue-100 dark:border-slate-700 overflow-hidden",
                    isMaximized ? "border-blue-500 dark:border-blue-400" : "rounded-xl",
                    isDropZoneActive && "ring-4 ring-green-400 bg-green-50 dark:bg-green-900/20 border-green-400"
                )}
                style={{
                    opacity,
                    transitionProperty: isMaximized ? 'none' : 'opacity',
                }}
                onClick={handleWindowClick}
        >
            {/* Green overlay shown when files are being dragged over this box */}
            {isDropZoneActive && (
                <div className="absolute inset-0 bg-green-100/50 dark:bg-green-900/30 border-4 border-green-400 border-dashed rounded-xl flex items-center justify-center z-20 pointer-events-none select-none">
                    <div className="bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg font-medium">
                        Drop files here to transfer
                    </div>
                </div>
            )}
            
            {/* Top bar with icon, title, and control buttons */}
            <div
                className="h-12 bg-white dark:bg-slate-800 flex items-center justify-between px-4 cursor-grab border-b border-slate-100 dark:border-slate-700"
                onMouseDown={handleHeaderMouseDown}
            >
                {/* Left side: icon and title */}
                <div className="flex items-center gap-3">
                    <div className="select-none flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30">
                        {icon || defaultIcon}
                    </div>
                    <div>
                        <div className="select-none text-slate-800 dark:text-slate-200">{title}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                            {type === "local" ? "" : `(${box.accountId})`}
                        </div>
                    </div>
                </div>
                
                {/* Right side: control buttons */}
                <div className="flex items-center gap-1 select-none">
                    {/* Dropdown menu for preset sizes */}
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
                            <div className="px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-b border-blue-100 dark:border-slate-700">
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
                                        <div className={`w-${key === 'small' ? 3 : key === 'medium' ? 4 : key === 'large' ? 5 : 6} h-${key === 'small' ? 3 : key === 'medium' ? 4 : key === 'large' ? 5 : 6} rounded-sm border border-blue-200 dark:border-blue-700 mr-2`}></div>
                                        <span>{key.charAt(0).toUpperCase() + key.slice(1)} ({WINDOW_SIZES[key as keyof typeof WINDOW_SIZES].width}×{WINDOW_SIZES[key as keyof typeof WINDOW_SIZES].height})</span>
                                    </DropdownMenuItem>
                                ))}
                            </div>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Maximize/minimize button */}
                    <button
                        className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
                        onClick={toggleMaximize}
                    >
                        {isMaximized ? <Minimize2 className="h-4 w-4"/> : <Maximize2 className="h-4 w-4"/>}
                    </button>

                    {/* Close button */}
                    <button
                        className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-500 hover:text-red-500"
                        onClick={handleClose}
                    >
                        <X className="h-4 w-4"/>
                    </button>
                </div>
            </div>

            {/* Main content area - the file explorer */}
            <div className="flex flex-1 overflow-hidden bg-slate-50 dark:bg-slate-900/50">
                {type == "local" ? (
                    /* Local file explorer */
                    <FileExplorer 
                        ref={fileExplorerRef}
                        zoomLevel={canvasZoom} 
                        tempGetFile={tempGetFile} 
                        tempPostFile={tempPostFile} 
                        boxId={id} 
                        onCurrentPathChange={handleCurrentPathChange} 
                        refreshToggle={refreshToggle}
                        silentRefresh={nextRefreshSilentRef.current}
                    />
                ) : (
                    /* Cloud file explorer */
                    <FileExplorer 
                        ref={fileExplorerRef}
                        zoomLevel={canvasZoom} 
                        cloudType={box.cloudType} 
                        accountId={box.accountId} 
                        tempGetFile={tempGetFile} 
                        tempPostFile={tempPostFile} 
                        boxId={id} 
                        onCurrentPathChange={handleCurrentPathChange} 
                        refreshToggle={refreshToggle} 
                        silentRefresh={nextRefreshSilentRef.current}
                    />
                )}
            </div>

            {/* Size indicator (only shown when not maximized) */}
            {!isMaximized && (
                <div className="absolute bottom-1 right-2 text-xs text-slate-400 pointer-events-none">
                    {Math.round(sizeRef.current.width)} × {Math.round(sizeRef.current.height)}
                </div>
            )}

            {/* Resize handles (only shown when not maximized and dropdown closed) */}
            {showResizeHandles && (
                <>
                    {/* Corner resize handles - these resize both width and height */}
                    <div
                        className="absolute right-0 bottom-0 w-6 h-6 cursor-se-resize bg-transparent hover:bg-blue-500/10 z-10"
                        onMouseDown={(e) => handleResizeStart(e, "se")} // southeast = bottom-right
                    />
                    <div
                        className="absolute left-0 bottom-0 w-6 h-6 cursor-sw-resize bg-transparent hover:bg-blue-500/10 z-10"
                        onMouseDown={(e) => handleResizeStart(e, "sw")} // southwest = bottom-left
                    />
                    <div
                        className="absolute left-0 top-0 w-6 h-6 cursor-nw-resize bg-transparent hover:bg-blue-500/10 z-10"
                        onMouseDown={(e) => handleResizeStart(e, "nw")} // northwest = top-left
                    />
                    <div
                        className="absolute right-0 top-0 w-6 h-6 cursor-ne-resize bg-transparent hover:bg-blue-500/10 z-10"
                        onMouseDown={(e) => handleResizeStart(e, "ne")} // northeast = top-right
                    />
                    
                    {/* Edge resize handles */}
                    <div 
                        className="absolute right-0 top-6 bottom-6 w-1 cursor-e-resize hover:bg-blue-500/10 z-10"
                        onMouseDown={(e) => handleResizeStart(e, "e")} // east = right edge
                    />
                    <div 
                        className="absolute left-6 right-6 bottom-0 h-1 cursor-s-resize hover:bg-blue-500/10 z-10"
                        onMouseDown={(e) => handleResizeStart(e, "s")} // south = bottom edge
                    />
                    <div 
                        className="absolute left-0 top-6 bottom-6 w-1 cursor-w-resize hover:bg-blue-500/10 z-10"
                        onMouseDown={(e) => handleResizeStart(e, "w")} // west = left edge
                    />
                    <div 
                        className="absolute left-6 right-6 top-0 h-1 cursor-n-resize hover:bg-blue-500/10 z-10"
                        onMouseDown={(e) => handleResizeStart(e, "n")} // north = top edge
                    />
                </>
            )}
        </div>
    );
}
