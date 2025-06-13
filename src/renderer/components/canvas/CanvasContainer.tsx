/**
 * CanvaSettings Component 
 * 
 * Control panel for canvas zoom and pan modes
 */

import {Toggle} from "@/components/ui/toggle"
import {Maximize, Minimize, Move, ZoomIn, ZoomOut} from "lucide-react"
import {Button} from "@/components/ui/button"
import {Slider} from "@/components/ui/slider"
import {CanvaSettingsProps} from "@Types/canvas";

const CanvaSettings = ({
    zoomLevel,        // Current zoom level 
    setZoomLevel,     // Function to change the zoom level
    isPanMode,        // Is pan mode currently active? (allows dragging canvas)
    setIsPanMode,     // Function to turn pan mode on/off
    isBoxMaximized,   // Is a box currently maximized? (disables controls)
    isDisabled        // Are all controls disabled? (general disable state)
}: CanvaSettingsProps) => {

    /** Increase zoom level by 10%  */
    const zoomIn = () => {
        setZoomLevel((prev) => {
            return Math.min(prev + 0.1, 2)
        })
    }

    /** Decrease zoom level by 10% */
    const zoomOut = () => {
        setZoomLevel((prev) => {
            return Math.max(prev - 0.1, 0.5)
        })
    }

    /** Reset zoom back to normal size (100%) */
    const resetZoom = () => {
        setZoomLevel(1) 
    }

    /** Handle when user drags the zoom slider */
    const handleZoomChange = (value: number[]) => {
        const newZoom = value[0] 
        setZoomLevel(newZoom)
    }

    return (
        <div className="flex items-center gap-2">
            
            {/* pan Mode */}
            <Toggle
                disabled={isBoxMaximized || isDisabled}
                className={`mr-2 hover:bg-slate-100 dark:hover:bg-slate-700 ${isPanMode ? "bg-slate-100 dark:bg-slate-700" : ""}`}
                aria-label="Toggle pan mode" 
                pressed={isPanMode} 
                onPressedChange={setIsPanMode}
            >
                {/* Move icon */}
                <Move className={`h-4 w-4 ${isPanMode ? "text-blue-600" : "text-slate-500"}`}/>
                {/* Label text */}
                <span className="ml-2">Pan</span>
            </Toggle>

            {/* zoom control */}
            <div className="flex items-center gap-2 mr-4">
                
                {/* zoom out */}
                <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-full hover:shadow-md hover:bg-slate-100 dark:hover:bg-slate-700"
                    onClick={zoomOut}
                    // Disable if already at minimum zoom (50%) or if globally disabled
                    disabled={zoomLevel <= 0.5 || isDisabled}
                >
                    <ZoomOut className="h-4 w-4"/>
                </Button>

                {/* zoom slider */}
                <div className="flex items-center gap-2 w-48">
                    <span className="text-xs w-10 select-none font-bold">
                        {Math.round(zoomLevel * 100)}%
                    </span>
                    <Slider 
                        disabled={isDisabled}
                        value={[zoomLevel]}           
                        min={0.5}             
                        max={2}                
                        step={0.1}                  
                        onValueChange={handleZoomChange} 
                        className={`w-32 z-10 ${isDisabled && 'text-black'}`}
                    />
                </div>

                {/* zoom in */}
                <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
                    onClick={zoomIn}
                    disabled={zoomLevel >= 2 || isDisabled}
                >
                    <ZoomIn className="h-4 w-4"/>
                </Button>

                {/* reset zoom */}
                <Button 
                    variant="outline" 
                    size="icon"
                    disabled={isDisabled}
                    className="h-8 w-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700" 
                    onClick={resetZoom}
                >
                    {zoomLevel === 1 ? <Maximize className="h-4 w-4"/> : <Minimize className="h-4 w-4"/>}
                </Button>
            </div>

        </div>
    )
}

export default CanvaSettings