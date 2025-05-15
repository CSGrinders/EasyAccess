"use client"

import type React from "react"
import {Toggle} from "@/components/ui/toggle"
import {Eye, LayoutGrid, Maximize, Minimize, Move, ZoomIn, ZoomOut} from "lucide-react"
import {Button} from "@/components/ui/button"
import {Slider} from "@/components/ui/slider"
import {CanvaSettingsProps} from "@Types/canvas";


const CanvaSettings = ({zoomLevel, setZoomLevel, isPanMode, setIsPanMode}: CanvaSettingsProps) => {

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
                    disabled={zoomLevel <= 0.5}
                >
                    <ZoomOut className="h-4 w-4"/>
                </Button>

                <div className="flex items-center gap-2 w-48">
                    <span className="text-xs w-10 select-none font-bold">{Math.round(zoomLevel * 100)}%</span>
                    <Slider value={[zoomLevel]} min={0.5} max={2} step={0.1} onValueChange={handleZoomChange}
                            className="w-32 z-10"/>
                </div>

                <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
                    onClick={zoomIn}
                    disabled={zoomLevel >= 2}
                >
                    <ZoomIn className="h-4 w-4"/>
                </Button>

                <Button variant="outline" size="icon"
                        className="h-8 w-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700" onClick={resetZoom}>
                    {zoomLevel === 1 ? <Maximize className="h-4 w-4"/> : <Minimize className="h-4 w-4"/>}
                </Button>
            </div>

            {/* Show all */}
            <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-slate-200 dark:border-slate-700 hover:bg-gradient-to-r hover:from-blue-100 hover:to-indigo-100 dark:hover:from-blue-900/30 dark:hover:to-indigo-900/30 hover:border-blue-300 dark:hover:border-blue-600 transition-all"
                onClick={() => null}
            >
                <Eye className="h-4 w-4 text-blue-600 dark:text-blue-400"/>
                <span>Show all</span>
            </Button>
        </div>
    )
}

export default CanvaSettings