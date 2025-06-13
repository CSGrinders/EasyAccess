/**
 * BoxDragPreview component 
 * 
 * Renders a visual preview that follows the cursor 
 * during drag operations, showing the number of items being dragged
 */

import React, { useEffect } from 'react';
import {useBoxDrag} from '@/contexts/BoxDragContext';

export const BoxDragPreview = ({ zoomLevel }: { zoomLevel: number }) => {
    const {isDragging, dragItems} = useBoxDrag();
    const dragPreviewRef = React.useRef<HTMLDivElement | null>(null);

    /** Updates the drag preview position to follow the mouse cursor */
    useEffect(() => {
        // If we're not dragging, don't do anything
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            // Make sure our preview element exists before trying to move it
            if (!dragPreviewRef.current) return;
            
            requestAnimationFrame(() => {
                if (dragPreviewRef.current) {
                    const x = e.clientX;
                    const y = e.clientY;

                    // Move the preview to the mouse position and apply zoom scaling
                    dragPreviewRef.current.style.transform = 
                        `translate3d(${x}px, ${y}px, 0) scale(${zoomLevel})`;
                }
            });
        };

        // Start listening for mouse movements across the entire window
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [isDragging, zoomLevel]);

    // Don't render if not dragging or no items to display
    if (!isDragging || dragItems.items.length === 0) {
        return null;
    }

    return (
        <div
            ref={dragPreviewRef}
            className="fixed pointer-events-none z-[9999] bg-blue-500 text-white px-3 py-2 rounded-lg shadow-lg opacity-90"
        >
            <div className="flex items-center gap-2">
                
                {/* Item count badge */}
                <div className="w-4 h-4 bg-white/20 rounded flex items-center justify-center">
                    <span className="text-xs font-bold">
                        {dragItems.items.length}
                    </span>
                </div>
               
                {/* Item name or count label if multiple items */}
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
