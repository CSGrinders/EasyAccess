import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { FileSystemItem } from '@Types/fileSystem';
import {CanvaSettingsProps} from "@Types/canvas";

export interface BoxDragState {
    isDragging: boolean;
    draggedItems: FileSystemItem[];
    sourceBoxId: number | null;
    sourceCloudType?: string;
    sourceAccountId?: string;
    dragPreviewPosition: { x: number; y: number };
}

export interface BoxDragContextType {
    dragState: BoxDragState;
    startBoxDrag: (
        items: FileSystemItem[],
        sourceBoxId: number,
        sourceCloudType?: string,
        sourceAccountId?: string,
        position?: { x: number; y: number }
    ) => void;
    updateDragPosition: (position: { x: number; y: number }) => void;
    endBoxDrag: () => void;
    isValidDropTarget: (targetBoxId: number, targetCloudType?: string, targetAccountId?: string) => boolean;
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
    const [dragState, setDragState] = useState<BoxDragState>({
        isDragging: false,
        draggedItems: [],
        sourceBoxId: null,
        sourceCloudType: undefined,
        sourceAccountId: undefined,
        dragPreviewPosition: { x: 0, y: 0 }
    });

    const startBoxDrag = useCallback((
        items: FileSystemItem[],
        sourceBoxId: number,
        sourceCloudType?: string,
        sourceAccountId?: string,
        position: { x: number; y: number } = { x: 0, y: 0 }
    ) => {
        setDragState({
            isDragging: true,
            draggedItems: items,
            sourceBoxId,
            sourceCloudType,
            sourceAccountId,
            dragPreviewPosition: position
        });
    }, []);

    const updateDragPosition = useCallback((position: { x: number; y: number }) => {
        setDragState(prev => ({
            ...prev,
            dragPreviewPosition: position
        }));
    }, []);

    const endBoxDrag = useCallback(() => {
        setDragState({
            isDragging: false,
            draggedItems: [],
            sourceBoxId: null,
            sourceCloudType: undefined,
            sourceAccountId: undefined,
            dragPreviewPosition: { x: 0, y: 0 }
        });
    }, []);

    const isValidDropTarget = useCallback((
        targetBoxId: number,
    ) => {
        if (!dragState.isDragging || dragState.sourceBoxId === targetBoxId) {
            return false;
        }

        return dragState.sourceBoxId !== targetBoxId;
    }, [dragState.isDragging, dragState.sourceBoxId]);

    const contextValue: BoxDragContextType = {
        dragState,
        startBoxDrag,
        updateDragPosition,
        endBoxDrag,
        isValidDropTarget
    };

    return (
        <BoxDragContext.Provider value={contextValue}>
            {children}
        </BoxDragContext.Provider>
    );
};
