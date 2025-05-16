import type React from "react"
import {useState, useRef, useEffect} from "react"
import {cn} from "@/lib/utils"
import {Crosshair} from "lucide-react";
import {Button} from "@Components/ui/button";
import {CANVAS_SIZE, CanvasContainerProps, Position} from "@Types/canvas";


export function CanvasContainer({
                                    zoomLevel,
                                    isPanMode = false,
                                    children,
                                    className,
                                    onPositionChange,
                                    position,
                                    setPosition,
                                }: CanvasContainerProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState<Position>({x: 10000, y: 10000})
    const [dragStartPosition, setDragStartPosition] = useState<Position>({x: 10000, y: 10000})
    const [isAnimating, setIsAnimating] = useState(false)
    const [isVisible, setIsVisible] = useState(false)
    const initialPosition = useRef(position)


    const handleMouseDown = (e: React.MouseEvent) => {
        if (!isPanMode || isAnimating) return
        e.preventDefault()
        setIsDragging(true)
        setDragStart({x: e.clientX, y: e.clientY})
        setDragStartPosition({x: position.x, y: position.y})
    }


    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging || !isPanMode || isAnimating) return

        const dx = e.clientX - dragStart.x
        const dy = e.clientY - dragStart.y

        const newPosition = {
            x: dragStartPosition.x + dx / zoomLevel,
            y: dragStartPosition.y + dy / zoomLevel,
        }

        const half = CANVAS_SIZE / 2
        newPosition.x = Math.max(-half, Math.min(half, newPosition.x))
        newPosition.y = Math.max(-half, Math.min(half, newPosition.y))


        setPosition(newPosition)
        if (onPositionChange) onPositionChange(newPosition)
    }

    const handleMouseUp = () => {
        setIsDragging(false)
    }

    const handleMouseLeave = () => {
        setIsDragging(false)
    }

    const handleWheel = (e: React.WheelEvent) => {
        if (isAnimating) return

        if (e.ctrlKey) {
            e.preventDefault()
            return
        }

        if (!isPanMode) return

        e.preventDefault()

        const newPosition = {
            x: position.x - e.deltaX / zoomLevel,
            y: position.y - e.deltaY / zoomLevel,
        }

        setPosition(newPosition)
        if (onPositionChange) onPositionChange(newPosition)
    }

    useEffect(() => {
        const {x: ix, y: iy} = initialPosition.current
        setIsVisible(position.x !== ix || position.y !== iy)
    }, [position])

    const goCenter = () => {
        setIsAnimating(true)
        const center = initialPosition.current
        setPosition(center)
        if (onPositionChange) onPositionChange(center)
    }

    return (
        <div
            className={cn(
                "relative overflow-hidden border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded-md flex-1",
                className,
            )}
            onWheel={handleWheel}
        >
            <div
                ref={containerRef}
                className={`absolute w-full h-full ${isPanMode === true ? "cursor-grab" : ""}`}
                style={{
                    transform: `scale(${zoomLevel})`,
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
            >
                <div
                    className="absolute transition-transform"
                    style={{
                        transform: `translate(${position.x}px, ${position.y}px)`,
                        width: `${CANVAS_SIZE}px`,
                        height: `${CANVAS_SIZE}px`,
                        left: `calc(50% - ${CANVAS_SIZE / 2}px)`,
                        top: `calc(50% - ${CANVAS_SIZE / 2}px)`,
                    }}
                    onTransitionEnd={() => setIsAnimating(false)}
                >
                    <div
                        className="absolute w-full h-full"
                        style={{
                            backgroundImage: `
                linear-gradient(to right, rgba(55, 65, 81, 0.1) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(55, 65, 81, 0.1) 1px, transparent 1px)
              `,
                            backgroundSize: "40px 40px",
                            backgroundPosition: "center center",
                        }}
                    />

                    <div
                        className="absolute w-4 h-4 rounded-full bg-blue-500/50 border border-blue-500"
                        style={{
                            left: `${CANVAS_SIZE / 2}px`,
                            top: `${CANVAS_SIZE / 2}px`,
                            transform: "translate(-50%, -50%)",
                            zIndex: 1,
                        }}
                    />

                    <div
                        className="absolute"
                        style={{
                            left: `${CANVAS_SIZE / 2}px`,
                            top: `${CANVAS_SIZE / 2}px`,
                        }}
                    >
                        {children}
                    </div>
                </div>
            </div>

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
                    >Go Center</span>
                </div>

                <div
                    className="select-none bg-slate-800 text-slate-200 text-xs px-3 py-1.5 rounded-md shadow-lg border border-slate-700"
                >
                    Position: {Math.round(position.x)}, {Math.round(position.y)}
                </div>
            </div>
        </div>
    )
}
