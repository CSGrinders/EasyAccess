import type React from "react";
import {useCallback, useEffect, useRef, useState} from "react";
import {cn} from "@/lib/utils";
import {Crosshair} from "lucide-react";
import {Button} from "@Components/ui/button";
import {CANVAS_SIZE, CanvasContainerProps, Position} from "@Types/canvas";

export function CanvasContainer({
                                    zoomLevel,
                                    setZoomLevel,
                                    isPanMode = false,
                                    children,
                                    className,
                                    onPositionChange,
                                    position: controlledPos,
                                    setPosition,
                                    boxMaximized,
                                }: CanvasContainerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const translateRef = useRef<HTMLDivElement>(null);
    const posRef = useRef<Position>(controlledPos);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState<Position>({x: 0, y: 0});
    const [dragStartPos, setDragStartPos] = useState<Position>({x: 0, y: 0});
    const [isAnimating, setIsAnimating] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const initialPosition = useRef(controlledPos);
    const velocityRef = useRef<Position>({x: 0, y: 0});
    const frameRef = useRef<number | null>(null);
    const FRICTION = 0.5;
    const MIN_V = 0.07;
    const PINCH = 0.005;

    const applyTransform = (p: Position) => {
        if (translateRef.current) {
            translateRef.current.style.transform = `translate(${p.x}px, ${p.y}px)`;
        }
    };

    const step = useCallback(() => {
        const v = velocityRef.current;
        if (Math.abs(v.x) < MIN_V && Math.abs(v.y) < MIN_V) {
            velocityRef.current = {x: 0, y: 0};
            frameRef.current = null;
            setPosition(posRef.current);
            onPositionChange?.(posRef.current);
            return;
        }

        const HALF = CANVAS_SIZE / 2;
        posRef.current = {
            x: Math.max(-HALF, Math.min(HALF, posRef.current.x + v.x)),
            y: Math.max(-HALF, Math.min(HALF, posRef.current.y + v.y)),
        };
        applyTransform(posRef.current);

        velocityRef.current = {x: v.x * FRICTION, y: v.y * FRICTION};
        frameRef.current = requestAnimationFrame(step);
    }, [setPosition, onPositionChange]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!isPanMode || isAnimating) return;
        e.preventDefault();
        setIsDragging(true);
        setDragStart({x: e.clientX, y: e.clientY});
        setDragStartPos(posRef.current);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging || !isPanMode || isAnimating) return;
        const dx = (e.clientX - dragStart.x) / zoomLevel;
        const dy = (e.clientY - dragStart.y) / zoomLevel;
        const HALF = CANVAS_SIZE / 2;

        posRef.current = {
            x: Math.max(-HALF, Math.min(HALF, dragStartPos.x + dx)),
            y: Math.max(-HALF, Math.min(HALF, dragStartPos.y + dy)),
        };
        applyTransform(posRef.current);
    };

    const stopDragging = () => {
        if (isDragging) {
            setIsDragging(false);
            setPosition(posRef.current);
            onPositionChange?.(posRef.current);
        }
    };

    const wheelListener = useCallback(
        (e: WheelEvent) => {
            if (isAnimating) return;
            if (e.ctrlKey) {
                if (boxMaximized) return;
                e.preventDefault();
                const zoomDelta = -e.deltaY * PINCH;
                setZoomLevel(prev => {
                    return Math.min(2, Math.max(0.5, prev + zoomDelta));
                });
                return;
            }

            const target = e.target as HTMLElement | null;
            if (target && target.closest(".box-container")) return;

            if (boxMaximized) return;
            e.preventDefault();

            velocityRef.current.x += -e.deltaX / zoomLevel;
            velocityRef.current.y += -e.deltaY / zoomLevel;

            if (!frameRef.current) frameRef.current = requestAnimationFrame(step);
        },
        [isAnimating, zoomLevel, step, boxMaximized, setZoomLevel],
    );

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

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        el.addEventListener("wheel", wheelListener, {passive: false});
        return () => el.removeEventListener("wheel", wheelListener);
    }, [wheelListener]);

    useEffect(() => {
        const {x: ix, y: iy} = initialPosition.current;
        setIsVisible(controlledPos.x !== ix || controlledPos.y !== iy);
        posRef.current = controlledPos;
        applyTransform(controlledPos);
    }, [controlledPos]);

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

    return (
        <div
            className={cn(
                "relative overflow-hidden border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded-md flex-1",
                className,
            )}
        >
            <div
                ref={containerRef}
                className={`absolute w-full h-full ${isPanMode ? "cursor-grab" : ""}`}
                style={{transform: `scale(${zoomLevel})`, overscrollBehavior: "contain"}}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={stopDragging}
                onMouseLeave={stopDragging}
            >
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
                    {/* Grid */}
                    <div
                        className="absolute w-full h-full pointer-events-none"
                        style={{
                            backgroundImage:
                                "linear-gradient(to right, rgba(55, 65, 81, 0.1) 1px, transparent 1px),\n                 linear-gradient(to bottom, rgba(55, 65, 81, 0.1) 1px, transparent 1px)",
                            backgroundSize: "40px 40px",
                            backgroundPosition: "center center",
                        }}
                    />
                    <div
                        className="absolute w-4 h-4 rounded-full bg-blue-500/50 border border-blue-500 pointer-events-none"
                        style={{
                            left: `${CANVAS_SIZE / 2}px`,
                            top: `${CANVAS_SIZE / 2}px`,
                            transform: "translate(-50%, -50%)",
                            zIndex: 1,
                        }}
                    />
                    <div
                        className="absolute"
                        style={{left: `${CANVAS_SIZE / 2}px`, top: `${CANVAS_SIZE / 2}px`}}
                    >
                        {children}
                    </div>
                </div>
            </div>
            {!boxMaximized && (
                <div className="fixed bottom-4 right-4 flex flex-col gap-3" style={{zIndex: 9999}}>
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

                    <div
                        className="select-none bg-slate-800 text-slate-200 text-xs px-3 py-1.5 rounded-md shadow-lg border border-slate-700">
                        Position: {Math.round(controlledPos.x)}, {Math.round(controlledPos.y)}
                    </div>
                </div>
            )}
        </div>
    );
}
