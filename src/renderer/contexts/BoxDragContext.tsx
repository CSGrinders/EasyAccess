/**
 * BoxDragContext Context
 * 
 * Provides a centralized way to manage drag and drop operations across the application.
 */

import React, { createContext, useContext, useState, useCallback, ReactNode, useRef, useMemo } from 'react';
import { FileSystemItem } from '@Types/fileSystem';

/** Items being dragged and their source information */
export interface DragItems {
    items: FileSystemItem[]; // TODO 
    sourceBoxId: number | null;
}

/** Target location for drag and drop operations */
export interface TargetLocation {
    boxId: number;          // ID of the box where items will be dropped
    targetPath: string;     // Path within the box where items will be dropped
    targetId?: string;      // Specific item ID for precise targeting
}

/** Context interface for managing drag and drop operations */
export interface BoxDragContextType {
    isDragging: boolean;                            // Whether a drag operation is currently active
    sourceBoxId: number | null;                     // ID of the box where the drag operation started
    dragItems: DragItems;                           // Items currently being dragged      
    target: TargetLocation | null;                  // Target location for the drag operation
    setDragItems: (                                 // Function to set the items being dragged
        items: FileSystemItem[], 
        sourceBoxId: number | null, 
        sourceCloudType?: string, 
        sourceAccountId?: string) => void;
    setIsDragging: (isDragging: boolean) => void;   // Function to set the dragging state
    setTarget: (target: TargetLocation) => void;    // Function to set the target location for the drag operation
}

//** Create the context with null as default */
const BoxDragContext = createContext<BoxDragContextType | null>(null);


/** Hook for components to access drag and drop state */
export const useBoxDrag = () => {
    const context = useContext(BoxDragContext);
    if (!context) {
        throw new Error('useBoxDrag context error');
    }
    return context;
};

interface BoxDragProviderProps {
    children: ReactNode; 
}

export const BoxDragProvider = ({ children }: BoxDragProviderProps) => {
    
    /**
     * What files/folders are currently being dragged
     * Starts empty, gets populated when a drag begins
     */
    const [dragItems, setDragItemsState] = useState<DragItems>({
        items: [],
        sourceBoxId: null,
    });

    /** Used to show/hide drop zones and change UI */
    const [drag, setDrag] = useState<boolean>(false);

    /**  Reference to the current drop target */
    const targetRef = useRef<TargetLocation>(null);

    /** Reference to the source box ID */
    const [sourceBoxId, setSourceBoxId] = useState<number | null>(null); 

    /** Function to set the items being dragged and their source box ID */
    const setDragItems = useCallback(
        (items: FileSystemItem[], sourceBoxId: number | null) => {
            setDragItemsState({
                items,
                sourceBoxId
            });
            setSourceBoxId(sourceBoxId); // Update the source box ID
        },
        []
    );

    /** Function to set the dragging state */
    const setIsDragging = useCallback((isDragging: boolean) => {
        setDrag(isDragging);
    }, []);

    /** Function to set the target location for the drag operation */
    const setTarget = useCallback((target: TargetLocation) => {
        targetRef.current = target;
    }, []);

    /** Memoized context value to avoid re-renders */
    const contextValue: BoxDragContextType = useMemo(() => ({
        isDragging: drag,
        sourceBoxId,
        dragItems,
        get target() {
            return targetRef.current;
        },
        setDragItems,
        setIsDragging,
        setTarget,
    }), [drag, sourceBoxId, dragItems, setDragItems, setIsDragging, setTarget]);

    return (
        <BoxDragContext.Provider value={contextValue}>
            {children}
        </BoxDragContext.Provider>
    );
};