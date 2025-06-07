import React, { useEffect } from 'react';
import {useBoxDrag} from '@/contexts/BoxDragContext';

export const BoxDragPreview = ({ zoomLevel }: { zoomLevel: number }) => {
    const {isDragging, dragItems, dragPreviewRef } = useBoxDrag();

    // In BoxDragPreview component
    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!dragPreviewRef.current) return;
            
            requestAnimationFrame(() => {
                if (dragPreviewRef.current) {
                    // You could add an offset here if needed
                    const x = e.clientX; // Small offset so it doesn't interfere with mouse
                    const y = e.clientY;
                    dragPreviewRef.current.style.transform = 
                        `translate3d(${x}px, ${y}px, 0) scale(${zoomLevel})`;
                }
            });
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [isDragging, zoomLevel]);

    // useEffect(() => {
    //     console.log('BoxDragPreview rendered or re-rendered');
    // });


    if (!isDragging || dragItems.items.length === 0) {
        return null;
    }

    return (
        <div
            ref={dragPreviewRef}
            className="fixed pointer-events-none z-[9999] bg-blue-500 text-white px-3 py-2 rounded-lg shadow-lg opacity-90"
        >
            <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-white/20 rounded flex items-center justify-center">
          <span className="text-xs font-bold">
            {dragItems.items.length}
          </span>
                </div>
                <span className="text-sm font-medium">
          {dragItems.items.length === 1
              ? dragItems.items[0].name
              : ` items`}
        </span>
            </div>
            <div className="text-xs opacity-75 mt-1">
                Drag Tool
            </div>
        </div>
    );
};
