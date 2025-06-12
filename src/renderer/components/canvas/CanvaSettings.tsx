import type React from "react"
import {Toggle} from "@/components/ui/toggle"
import {Eye, LayoutGrid, Maximize, Minimize, Move, ZoomIn, ZoomOut} from "lucide-react"
import {Button} from "@/components/ui/button"
import {Slider} from "@/components/ui/slider"
import {CanvaSettingsProps} from "@Types/canvas";


const CanvaSettings = ({zoomLevel, setZoomLevel, isPanMode, setIsPanMode, isBoxMaximized, isDisabled}: CanvaSettingsProps) => {

    // Zoom in
    const zoomIn = () => {
        setZoomLevel((prev) => {
            return Math.min(prev + 0.1, 2)
        })
    }

    // Zoom out
    const zoomOut = () => {
        setZoomLevel((prev) => {
            return Math.max(prev - 0.1, 0.5)
        })
    }

    // Reset zoom
    const resetZoom = () => {
        setZoomLevel(1)
    }

    // Handle zoom slider change
    const handleZoomChange = (value: number[]) => {
        const newZoom = value[0]
        setZoomLevel(newZoom)
    }

    return (
        <div className="flex items-center gap-2">
            <Toggle
                disabled={isBoxMaximized ||isDisabled}
                className={`mr-2 hover:bg-slate-100 dark:hover:bg-slate-700 ${isPanMode ? "bg-slate-100 dark:bg-slate-700" : ""}`}
                aria-label="Toggle pan mode" pressed={isPanMode} onPressedChange={setIsPanMode}>
                <Move className={`h-4 w-4 ${isPanMode ? "text-blue-600" : "text-slate-500"}`}/>
                <span className="ml-2">Pan</span>
            </Toggle>

            {/* Zoom controls */}
            <div className="flex items-center gap-2 mr-4">
                <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-full hover:shadow-md hover:bg-slate-100 dark:hover:bg-slate-700"
                    onClick={zoomOut}
                    disabled={zoomLevel <= 0.5 || isDisabled}
                >
                    <ZoomOut className="h-4 w-4"/>
                </Button>

                <div className="flex items-center gap-2 w-48">
                    <span className="text-xs w-10 select-none font-bold">{Math.round(zoomLevel * 100)}%</span>
                    <Slider disabled={isDisabled} value={[zoomLevel]} min={0.5} max={2} step={0.1} onValueChange={handleZoomChange}
                            className={`w-32 z-10 ${isDisabled && 'text-black'}`}/>
                </div>

                <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
                    onClick={zoomIn}
                    disabled={zoomLevel >= 2 || isDisabled}
                >
                    <ZoomIn className="h-4 w-4"/>
                </Button>

                <Button variant="outline" size="icon"
                disabled={isDisabled}
                        className="h-8 w-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700" onClick={resetZoom}>
                    {zoomLevel === 1 ? <Maximize className="h-4 w-4"/> : <Minimize className="h-4 w-4"/>}
                </Button>
            </div>

        </div>
    )
}

export default CanvaSettings