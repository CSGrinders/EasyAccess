import React, { createContext, useContext, useState, useCallback, ReactNode, useRef, useMemo } from 'react';
import { FileSystemItem } from '@Types/fileSystem';

export interface DragItems {
    items: FileSystemItem[]; // TODO 
    sourceBoxId: number | null;
}

// TODO implement TargetLocation to work with other elemnents
export interface TargetLocation {
    boxId: number; // assume it can be used to identify cloudType and accountId
    targetPath: string; // path within the box
    targetId?: string; // optional ID for the target item, if applicable
}

export interface BoxDragContextType {
    isDragging: boolean;
    sourceBoxId: number | null;
    dragItems: DragItems;
    target: TargetLocation | null; // Target location for the drag operation
    setDragItems: (items: FileSystemItem[], sourceBoxId: number | null, sourceCloudType?: string, sourceAccountId?: string) => void;
    setIsDragging: (isDragging: boolean) => void;
    setTarget: (target: TargetLocation) => void; 
}

const BoxDragContext = createContext<BoxDragContextType | null>(null);

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

export const BoxDragProvider: React.FC<BoxDragProviderProps> = ({ children }) => {
    const [dragItems, setDragItemsState] = useState<DragItems>({
        items: [],
        sourceBoxId: null,
    });
    const [drag, setDrag] = useState<boolean>(false);
    const targetRef = useRef<TargetLocation>(null);
    const [sourceBoxId, setSourceBoxId] = useState<number | null>(null); // Store the source box ID
    // const sourceBoxIdRef = useRef<number | null>(null); // Store the source box ID

    const setDragItems = useCallback(
        (items: FileSystemItem[], sourceBoxId: number | null) => {
            setDragItemsState({
                items,
                sourceBoxId
            });
            setSourceBoxId(sourceBoxId); // Update the source box ID
            // sourceBoxIdRef.current = sourceBoxId; // Store the source box ID
        },
        []
    );

    const setIsDragging = useCallback((isDragging: boolean) => {
        // This function is not used in the current context, but can be implemented if needed
        // For example, you could update a state variable to control the dragging state
        setDrag(isDragging);
    }, []);

    const setTarget = useCallback((target: TargetLocation) => {
        targetRef.current = target;
    }, []);

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