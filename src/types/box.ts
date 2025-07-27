/**
 * Type definitions for box components and interactions
 * Handles boxes interaction with canvas.
 */

import type React from "react";
import { CloudType } from "./cloudType";

/**
 * Minimum dimensions for storage boxes to ensure usability
 */
export const MIN_BOX_WIDTH = 400;
export const MIN_BOX_HEIGHT = 360;

/**
 * Predefined window size configurations for different display modes
 */
export const WINDOW_SIZES = {
    /** Medium size: for basic file browsing */
    medium: { width: 480, height: 360 },
    /** Large size: for detailed file operations */
    large: { width: 640, height: 480 },
    /** Extra large: for complex multi-file operations */
    xl: { width: 800, height: 600 },
};

/**
 * Available storage box types
 */
export const WINDOW_TYPES = ["local", "cloud"] as const;

/**
 * Props interface for the main StorageBox component
 * Defines all properties needed to render and manage a storage box
 */
export interface StorageBoxProps {
    /** Core box data containing position, size, and metadata */
    box: StorageBoxData;
    
    /** Callback triggered when the box is closed */
    onClose?: (id: number) => void;
    
    /** Callback triggered when the box gains focus */
    onFocus?: (id: number) => void;
    
    /** Current viewport dimensions for responsive positioning */
    viewportSize: { width: number; height: number };
    
    /** Reference to the main viewport container element */
    viewportRef: React.RefObject<HTMLDivElement>;
    
    /** Current zoom level of the canvas (1.0 = 100%) */
    canvasZoom: number;
    
    /** Current pan offset of the canvas */
    canvasPan: { x: number; y: number };
    
    /** Whether the box is currently maximized */
    isMaximized: boolean;
    
    /** Function to toggle the maximized state */
    setIsMaximized: (isMaximized: boolean) => void;
    
    /** Optional drag and drop transfer handler box */
    handleItemTransfer?: (filePaths: string[], sourceCloudType?: CloudType, sourceAccountId?: string, targetPath?: string, targetCloudType?: CloudType, targetAccountId?: string) => void;
    
    /** Handler for transferring items between storage boxes */
    onBoxTransfer?: (sourceItems: any[], targetBoxId: number, targetPath?: string) => void;
}

/**
 * Core data structure representing a storage box
 * Contains all information about a storage box instance
 */
export interface StorageBoxData {
    /** Unique identifier for the storage box */
    id: number;
    
    /** Display name shown in the box header */
    title: string;
    
    /** Type of storage (local or cloud) */
    type: string;
    
    /** Current position on the canvas */
    position: { x: number; y: number };
    
    /** Current dimensions of the box */
    size: { width: number; height: number };
    
    /** Icon displayed in the box header */
    icon?: React.ReactNode;
    
    /** Z-index for layering multiple boxes */
    zIndex?: number;
    
    /** Cloud service type (if applicable) */
    cloudType?: CloudType;
    
    /** Account identifier for cloud services */
    accountId?: string;
}

/**
 * Props for the wide storage window component
 * Used for storage management and account configuration
 */
export interface StorageWideWindowProps {
    /** Whether the window should be visible */
    show: boolean;
    
    /** Function to add a new storage box */
    addStorage: (type: string, title: string, cloudType?: CloudType, accountId?: string) => void;
    
    /** Callback when a cloud account is deleted */
    onAccountDeleted?: (cloudType: CloudType, accountId: string) => void;
}


