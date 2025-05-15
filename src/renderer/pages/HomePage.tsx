import React, {useRef, useState} from 'react';
import {HardDrive} from "lucide-react"
import CanvaSettings from "@Components/CanvaSettings";
import ActionBar from "@Components/ActionBar";
import {CanvasContainer} from "@Components/CanvasContainer";
import StorageSideWindow from '@/components/StorageSideWindow';

const test = {
    folders: ["Documents", "Pictures", "Downloads", "Desktop"],
    files: ["readme.txt", "report.pdf", "image.jpg", "data.csv"],
}


type BoxSize = "small" | "medium" | "large" | "full"
type SplitZone = "top" | "right" | "bottom" | "left" | null

const HomePage = () => {
    const [activeBoxId, setActiveBoxId] = useState(1)
    const [zoomLevel, setZoomLevel] = useState(1) // 1 = 100%, 0.5 = 50%, 2 = 200%
    const [isPanMode, setIsPanMode] = useState(false)
    const [action, setAction] = useState("dashboard")
    const [position, setPosition] = useState({x: 0, y: 0})
    const containerRef = useRef<HTMLDivElement>(null)
    const [showStorageWindow, setShowStorageWindow] = useState(false);
    
    const toggleShowSideWindow = () => {
        setShowStorageWindow(!showStorageWindow); // Toggle the storage window visibility
    };

    const [storageBoxes, setStorageBoxes] = useState([
        {
            id: 1,
            name: "Local Directory",
            type: "local",
            content: test,
            width: 1200,
            height: 400,
        },
    ])

    return (
        <div className="flex flex-col h-screen  bg-white dark:bg-gray-900 text-black dark:text-white">

            <header className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-md">

                <div className="flex items-center justify-between ml-5 mr-5 mt-3 mb-3">
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center">
                            <div
                                className="bg-gradient-to-r from-blue-500 to-indigo-600 p-2 rounded-lg shadow-md mr-3">
                                <HardDrive className="h-6 w-6 text-white"/>
                            </div>
                            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent select-none">
                                Easy Access
                            </h1>
                        </div>

                    </div>
                    <CanvaSettings zoomLevel={zoomLevel} setZoomLevel={setZoomLevel} isPanMode={isPanMode}
                                   setIsPanMode={setIsPanMode}/>
                </div>
            </header>
            <main className="relative flex flex-1 overflow-hidden">
                <ActionBar action={action} setAction={setAction} toggleShowSideWindow={toggleShowSideWindow}/>
                <div className="relative flex flex-1">
                    <StorageSideWindow show={showStorageWindow}/>
                    <CanvasContainer
                        zoomLevel={zoomLevel}
                        isPanMode={isPanMode}
                        className="relative"
                        position={position}
                        setPosition={setPosition}

                    >
                        <></>
                    </CanvasContainer>
                </div>
            </main>
        </div>
    );
};

export default HomePage;
