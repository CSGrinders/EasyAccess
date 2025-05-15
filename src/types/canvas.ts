import type React from "react";


export const CANVAS_SIZE = 20000

export interface Position {
    x: number
    y: number
}

export interface CanvasContainerProps {
    zoomLevel: number
    isPanMode?: boolean
    children: React.ReactNode
    className?: string
    onPositionChange?: (position: Position) => void
    position: Position
    setPosition: React.Dispatch<React.SetStateAction<Position>>
}

export interface CanvaSettingsProps {
    zoomLevel: number
    setZoomLevel: React.Dispatch<React.SetStateAction<number>>
    isPanMode: boolean
    setIsPanMode: React.Dispatch<React.SetStateAction<boolean>>
}

