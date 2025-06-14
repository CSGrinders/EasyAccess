/**
 * Type definitions for canvas components and interactions
 * Handles infinite canvas positioning, zooming, panning, and viewport management
 */

import type React from "react";

/**
 * Total size of the infinite canvas in pixels
 * Provides a large virtual space for positioning storage boxes
 */
export const CANVAS_SIZE = 20000;

/**
 * 2D coordinate position on the canvas
 */
export interface Position {
    /** Horizontal position in pixels */
    x: number;
    /** Vertical position in pixels */
    y: number;
}

/**
 * Props for the main canvas container component
 * Manages the infinite scrollable canvas that hosts storage boxes
 */
export interface CanvasContainerProps {
    /** Current zoom level (1.0 = 100%, 0.5 = 50%, 2.0 = 200%) */
    zoomLevel: number;
    
    /** Function to update the zoom level */
    setZoomLevel: React.Dispatch<React.SetStateAction<number>>;
    
    /** Whether pan mode is active (disables box interactions) */
    isPanMode?: boolean;
    
    /** Child components to render within the canvas */
    children: React.ReactNode;
    
    /** Optional CSS class name for styling */
    className?: string;
    
    /** Callback triggered when canvas position changes */
    onPositionChange?: (position: Position) => void;
    
    /** Current pan position of the canvas viewport */
    position: Position;
    
    /** Function to update the canvas pan position */
    setPosition: React.Dispatch<React.SetStateAction<Position>>;
    
    /** Whether any storage box is currently maximized */
    boxMaximized: boolean;
}

/**
 * Props for the canvas settings/controls component
 * Provides UI controls for canvas manipulation and viewing options
 */
export interface CanvaSettingsProps {
    /** Current zoom level for display and controls */
    zoomLevel: number;
    
    /** Function to modify the zoom level */
    setZoomLevel: React.Dispatch<React.SetStateAction<number>>;
    
    /** Whether pan mode is currently enabled */
    isPanMode: boolean;
    
    /** Function to toggle pan mode on/off */
    setIsPanMode: React.Dispatch<React.SetStateAction<boolean>>;
    
    /** Whether any box is maximized (affects control availability) */
    isBoxMaximized: boolean;
    
    /** Whether the settings controls should be disabled */
    isDisabled: boolean;
}

