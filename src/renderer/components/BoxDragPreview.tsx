import React from 'react';
import {useBoxDrag} from '@/contexts/BoxDragContext';

export const BoxDragPreview = ({ zoomLevel }: { zoomLevel: number }) => {
    const {dragState, } = useBoxDrag();

    if (!dragState.isDragging || dragState.draggedItems.length === 0) {
        return null;
    }

    return (
        <div
            className="fixed pointer-events-none z-[9999] bg-blue-500 text-white px-3 py-2 rounded-lg shadow-lg opacity-90"
            style={{
                left: `${dragState.dragPreviewPosition.x + 10}px`,
                top: `${dragState.dragPreviewPosition.y + 10}px`,
                transform: `scale(${zoomLevel}) translate3d(0,0,0)`,
            }}
        >
            <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-white/20 rounded flex items-center justify-center">
          <span className="text-xs font-bold">
            {dragState.draggedItems.length}
          </span>
                </div>
                <span className="text-sm font-medium">
          {dragState.draggedItems.length === 1
              ? dragState.draggedItems[0].name
              : ` items`}
        </span>
            </div>
            <div className="text-xs opacity-75 mt-1">
                Drag Tool
            </div>
        </div>
    );
};
