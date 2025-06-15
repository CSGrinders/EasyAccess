/**
 * CanvasContainer Component
 * 
 * A canvas with drag-and-drop support
 */

import type React from "react";
import {useCallback, useEffect, useRef, useState} from "react";
import {cn} from "@/lib/utils";
import {Crosshair} from "lucide-react";
import {Button} from "@Components/ui/button";
import {CANVAS_SIZE, CanvasContainerProps, Position} from "@Types/canvas";
import {useBoxDrag} from "@/contexts/BoxDragContext";

export function CanvasContainer({
                                    zoomLevel,                  // Current zoom level
                                    setZoomLevel,               // Function to set zoom level
                                    isPanMode = false,          // Whether canvas is in pan mode
                                    children,                   // Child components to render inside the canvas
                                    className,                  // Additional class names for styling
                                    onPositionChange,           // Callback for position changes
                                    position: controlledPos,    // Controlled position of the canvas
                                    setPosition,                // Function to set the canvas position    
                                    boxMaximized,               // Whether a box is maximized
                                }: CanvasContainerProps) {
    
                                    
    /** Main container div that holds the entire canvas */                             
    const containerRef = useRef<HTMLDivElement>(null);

    /** Inner div that actually moves when we pan/translate the canvas */
    const translateRef = useRef<HTMLDivElement>(null);
    
    /** Position and drag state */ 
    const posRef = useRef<Position>(controlledPos); // Current position of the canvas
    const [isDragging, setIsDragging] = useState(false); // Whether the canvas is currently being dragged
    const [isAnimating, setIsAnimating] = useState(false); // Whether the canvas is currently animating (scrolling or panning)
    
    /** Animation */
    const lastMousePos = useRef<Position>({x: 0, y: 0}); // Last known mouse position (for calculating movement speed)
    const velocityRef = useRef<Position>({x: 0, y: 0}); // How fast the canvas is moving (velocity in x and y directions)
    const frameRef = useRef<number | null>(null); // Current animation frame ID (for cancelling the animation)
    

    /** UI State */
    const [isVisible, setIsVisible] = useState(false); // Whether the control panel is visible
    const initialPosition = useRef(controlledPos); // Record of the initial position
    
    /** Physics constants for smooth movement */
    const FRICTION = 0.5;           // How quickly momentum slows down (0.5 = half speed each frame)
    const MIN_V = 0.07;             // Minimum speed before we stop the animation
    const PINCH = 0.005;            // How sensitive zooming is to mouse wheel

    // Get the box drag context (for handling dragging boxes around)
    const BoxDrag = useBoxDrag();

    // Timer for checking if boxes were dropped on canvas
    const dragCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    /** Move the canvas to a specific position */                           
    const applyTransform = (p: Position) => {
        if (translateRef.current) {
            translateRef.current.style.transform = `translate(${p.x}px, ${p.y}px)`;
        }
    };

    /**
     * Animation frame step for momentum-based movement
     * Handles velocity decay and boundary constraints
     */
    const step = useCallback(() => {
        const v = velocityRef.current;
        
        // If we're moving very slowly, just stop
        if (Math.abs(v.x) < MIN_V && Math.abs(v.y) < MIN_V) {
            velocityRef.current = {x: 0, y: 0};
            frameRef.current = null;
            setPosition(posRef.current);
            onPositionChange?.(posRef.current);
            return;
        }

        // Move the canvas based on current velocity
        // Also make sure we don't go outside the canvas boundaries
        const HALF = CANVAS_SIZE / 2;
        posRef.current = {
            x: Math.max(-HALF, Math.min(HALF, posRef.current.x + v.x)),
            y: Math.max(-HALF, Math.min(HALF, posRef.current.y + v.y)),
        };
        applyTransform(posRef.current);

        // Slow down the velocity 
        velocityRef.current = {x: v.x * FRICTION, y: v.y * FRICTION};
        frameRef.current = requestAnimationFrame(step);
    }, [setPosition, onPositionChange]);

    /**
     * Initiates pan drag operation when mouse is pressed in pan mode
     */
    const handleMouseDown = (e: React.MouseEvent) => {
        // Don't drag if not in pan mode or if canvas is animating
        if (!isPanMode || isAnimating) return;
        e.preventDefault();
        setIsDragging(true);
        lastMousePos.current = {x: e.clientX, y: e.clientY};
    };

    /**
     * Handles mouse movement during pan operation
     * Calculates velocity for momentum scrolling
     */
    const handleMouseMove = (e: React.MouseEvent) => {
        // Only do something if we're actively dragging
        if (!isDragging || !isPanMode || isAnimating) return;
        
        const currentMousePos = {x: e.clientX, y: e.clientY};

        // Calculate how far mouse moved since last frame
        const dx = (currentMousePos.x - lastMousePos.current.x) / zoomLevel;
        const dy = (currentMousePos.y - lastMousePos.current.y) / zoomLevel;
        const target = e.target as HTMLElement | null;
        
        // Don't pan if mouse is over a box or if boxes are being dragged
        if (target && target.closest(".box-container")) return;
        if (BoxDrag.isDragging) return;
        if (boxMaximized) return;
        
        e.preventDefault();

        // Add to velocity for momentum 
        velocityRef.current.x += dx * 0.5; 
        velocityRef.current.y += dy * 0.5;
        
        // Start animation frame if not already running
        if (!frameRef.current) {
            frameRef.current = requestAnimationFrame(step);
        }
        
        // Remember this mouse position for next frame
        lastMousePos.current = currentMousePos;
    };

    /** Stops the current drag operation */
    const stopDragging = () => {
        if (isDragging) {
            setIsDragging(false);
        }
    };

    /**
     * Handles box drop events on the canvas
     * Ends box drag operation if dropped outside of any box container
     */
    const handleCanvasDrop = useCallback((e: MouseEvent | DragEvent) => {
        if (dragCheckTimeoutRef.current) {
            clearTimeout(dragCheckTimeoutRef.current);
        }

        dragCheckTimeoutRef.current = setTimeout(() => {
            if (!BoxDrag.isDragging) return;

            const target = e.target as HTMLElement;
            const isDroppedOnBox = target.closest('.box-container');

            if (!isDroppedOnBox) {
                console.log("Dropped on canvas - ending BoxDrag");
                BoxDrag.setIsDragging(false);
                BoxDrag.setDragItems([], null);
            }
        }, 10);
    }, [BoxDrag]);

    /** Handles mouse leave events to cleanup box drag operations */
    const handleMouseLeave = useCallback((e: MouseEvent) => {
        if (!BoxDrag.isDragging) return;

        if (e.target === document.documentElement || e.target === document.body) {
            console.log("Mouse left document - ending BoxDrag");
            BoxDrag.setIsDragging(false);
            BoxDrag.setDragItems([], null);
        }
    }, [BoxDrag]);

    /**  Handle when the window loses focus (user clicked on another app) */
    const handleWindowBlur = useCallback(() => {
        if (BoxDrag.isDragging) {
            console.log("Window lost focus - ending BoxDrag");
            BoxDrag.setIsDragging(false);
            BoxDrag.setDragItems([], null);
        }
    }, [BoxDrag]);

    /** Handle clicks on the canvas during box drag operations */
    const handleCanvasClick = useCallback((e: React.MouseEvent) => {
        // Only care if boxes are being dragged
        if (!BoxDrag.isDragging) return;

        const target = e.target as HTMLElement;
        const isClickedOnBox = target.closest('.box-container');

         // If clicked on empty canvas, end the box drag
        if (!isClickedOnBox) {
            console.log("Clicked on canvas during drag - ending BoxDrag");
            BoxDrag.setIsDragging(false);
            BoxDrag.setDragItems([], null);
        }
    }, [BoxDrag]);

    /** Cleanup function for drag timeout references */
    const cleanupDragTimeout = useCallback(() => {
        if (dragCheckTimeoutRef.current) {
            clearTimeout(dragCheckTimeoutRef.current);
            dragCheckTimeoutRef.current = null;
        }
    }, []);

    /** 
     * Handles wheel events for zooming and scrolling
     * Ctrl+wheel = zoom, regular wheel = pan
     */
    const wheelListener = useCallback(
        (e: WheelEvent) => {
            if (isAnimating) return;
            
            // Handle zoom with Ctrl key
            if (e.ctrlKey) {
                if (boxMaximized) return;
                e.preventDefault();

                // Calculate zoom change based on wheel movement
                const zoomDelta = -e.deltaY * PINCH;
                setZoomLevel(prev => {
                    return Math.min(2, Math.max(0.5, prev + zoomDelta));
                });
                return;
            }

            const target = e.target as HTMLElement | null;
            
            // Prevent scrolling when over box containers or when maximized
            if (target && target.closest(".box-container")) return;
            if (boxMaximized) return;
            
            e.preventDefault();

            // Apply wheel delta to velocity for momentum scrolling
            velocityRef.current.x += -e.deltaX / zoomLevel;
            velocityRef.current.y += -e.deltaY / zoomLevel;

            if (!frameRef.current) frameRef.current = requestAnimationFrame(step);
        },
        [isAnimating, zoomLevel, step, boxMaximized, setZoomLevel],
    );

    /** Centers the canvas to its initial position */
    const goCenter = () => {
        if (boxMaximized) return;
        setIsAnimating(true);
        const center = initialPosition.current;
        posRef.current = center;
        applyTransform(center);
        setPosition(center);
        onPositionChange?.(center);
        setIsAnimating(false);
    };

    // Set up wheel event listener for zooming and panning
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        el.addEventListener("wheel", wheelListener, {passive: false});
        return () => el.removeEventListener("wheel", wheelListener);
    }, [wheelListener]);

    // Update canvas position when controlled position changes
    useEffect(() => {
        const {x: ix, y: iy} = initialPosition.current;
        setIsVisible(controlledPos.x !== ix || controlledPos.y !== iy);
        posRef.current = controlledPos;
        applyTransform(controlledPos);
    }, [controlledPos]);

    // Periodically sync the internal position with parent component
    useEffect(() => {
        let id: number | null = null;
        const tick = () => {
            setPosition(posRef.current);
            onPositionChange?.(posRef.current);
            id = window.setTimeout(tick, 150);
        };
        tick();
        return () => {
            if (id) clearTimeout(id);
        };
    }, []);

    // Set up event listeners for box drag operations
    useEffect(() => {
        if (BoxDrag.isDragging) {
            document.addEventListener('mouseup', handleCanvasDrop);
            document.addEventListener('dragend', handleCanvasDrop);
            document.addEventListener('mouseleave', handleMouseLeave);
            window.addEventListener('blur', handleWindowBlur);

            return () => {
                document.removeEventListener('mouseup', handleCanvasDrop);
                document.removeEventListener('dragend', handleCanvasDrop);
                document.removeEventListener('mouseleave', handleMouseLeave);
                window.removeEventListener('blur', handleWindowBlur);
                cleanupDragTimeout();
            };
        } else {
            cleanupDragTimeout();
        }
    }, [BoxDrag.isDragging, handleCanvasDrop, handleMouseLeave, handleWindowBlur, cleanupDragTimeout]);

    /** Cleanup on unmount */
    useEffect(() => {
        return () => {
            cleanupDragTimeout();
        };
    }, [cleanupDragTimeout]);

    return (
        <div
            className={cn(
                "relative overflow-hidden border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded-md flex-1",
                className,
            )}
            onClick={handleCanvasClick}
        >
            {/* Main canvas container */}
            <div
                ref={containerRef}
                className={`absolute w-full h-full ${isPanMode ? "cursor-grab" : ""}`}
                style={{transform: `scale(${zoomLevel})`, overscrollBehavior: "contain"}}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={stopDragging}
                onMouseLeave={stopDragging}
            >
                {/* Inner container that handles translation (panning) */}
                <div
                    ref={translateRef}
                    className="absolute"
                    style={{
                        width: `${CANVAS_SIZE}px`,
                        height: `${CANVAS_SIZE}px`,
                        left: `calc(50% - ${CANVAS_SIZE / 2}px)`,
                        top: `calc(50% - ${CANVAS_SIZE / 2}px)`,
                        willChange: "transform",
                    }}
                >
                    {/* Grid background */}
                    <div
                        className="absolute w-full h-full pointer-events-none"
                        style={{
                            backgroundImage:
                                "linear-gradient(to right, rgba(55, 65, 81, 0.1) 1px, transparent 1px),\n                 linear-gradient(to bottom, rgba(55, 65, 81, 0.1) 1px, transparent 1px)",
                            backgroundSize: "40px 40px",
                            backgroundPosition: "center center",
                        }}
                    />
                    {/* Canvas center marker */}
                    <div
                        className="absolute w-4 h-4 rounded-full bg-blue-500/50 border border-blue-500 pointer-events-none"
                        style={{
                            left: `${CANVAS_SIZE / 2}px`,
                            top: `${CANVAS_SIZE / 2}px`,
                            transform: "translate(-50%, -50%)",
                            zIndex: 1,
                        }}
                    />

                    {/* Container for all the content (boxes, etc.) */}
                    <div
                        className="absolute"
                        style={{left: `${CANVAS_SIZE / 2}px`, top: `${CANVAS_SIZE / 2}px`}}
                    >
                        {children}
                    </div>
                </div>
            </div>

            {/* Control panel - only visible when not maximized */}
            {!boxMaximized && (
                <div className="fixed bottom-4 right-4 flex flex-col gap-3" style={{zIndex: 9999}}>
                    {/* Center button - appears when canvas is moved from origin */}
                    <div className={`relative flex justify-end group ${isVisible ? "opacity-100" : "opacity-0"}`}>
                        <Button
                            size="icon"
                            onClick={goCenter}
                            className="group flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs px-3 py-1.5 border border-blue-500/30 transition-all duration-300 hover:shadow-lg hover:scale-105 rounded-full shadow-lg"
                        >
                            <Crosshair className="h-3.5 w-3.5 text-white group-hover:animate-pulse"/>
                        </Button>
                        <span
                            className="absolute select-none bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10"
                        >
              Go Center
            </span>
                    </div>

                    {/* Position indicator */}
                    <div
                        className="select-none bg-slate-800 text-slate-200 text-xs px-3 py-1.5 rounded-md shadow-lg border border-slate-700">
                        Position: {Math.round(controlledPos.x)}, {Math.round(controlledPos.y)}
                    </div>
                </div>
            )}
        </div>
    );
}
