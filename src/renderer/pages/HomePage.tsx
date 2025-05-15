import React, {useState} from 'react';
import {HardDrive} from "lucide-react"
import CanvaSettings from "@Components/CanvaSettings";
import ActionBar from "@Components/ActionBar";
import {CanvasContainer} from "@Components/CanvasContainer";
import {StorageBox} from "@Components/StorageBox";
import { type StorageBoxData, WINDOW_TYPES } from "@Types/box"
import {FaGoogleDrive} from "react-icons/fa";

const test = {
    folders: ["Documents", "Pictures", "Downloads", "Desktop"],
    files: ["readme.txt", "report.pdf", "image.jpg", "data.csv"],
}




const HomePage = () => {
    const [zoomLevel, setZoomLevel] = useState(1) // 1 = 100%, 0.5 = 50%, 2 = 200%
    const [isPanMode, setIsPanMode] = useState(false)
    const [action, setAction] = useState("dashboard")
    const [position, setPosition] = useState({x: 0, y: 0})
    const [nextZIndex, setNextZIndex] = useState(4)
    const [nextId, setNextId] = useState(4)

    const [storageBoxes, setStorageBoxes] = useState<StorageBoxData[]>([
        {
            id: 1,
            title: "Local Directory",
            type: "local",
            content: test,
            icon: <HardDrive className="h-6 w-6"/>,
            position: { x: -500, y: -200 },
            size: { width: 500, height: 400 },
            zIndex: 1,
        },
        {
            id: 2,
            title: "Google acc",
            type: "cloud",
            content: test,
            icon: <FaGoogleDrive className="h-6 w-6"/>,
            position: { x: -500, y: -200 },
            size: { width: 500, height: 400 },
            zIndex: 1,
        },
    ])

    const removeWindow = (id: number) => {
        setStorageBoxes(storageBoxes.filter((w) => w.id !== id))
    }


    const bringToFront = (id: number) => {
        setStorageBoxes(
            storageBoxes.map((window) => {
                if (window.id === id) {
                    return { ...window, zIndex: nextZIndex }
                }
                return window
            }),
        )
        setNextZIndex(nextZIndex + 1)
    }

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
            <main className="flex flex-1 overflow-hidden">
                <ActionBar action={action} setAction={setAction}/>
                <CanvasContainer
                    zoomLevel={zoomLevel}
                    isPanMode={isPanMode}
                    className="relative"
                    position={position}
                    setPosition={setPosition}

                >
                    {storageBoxes.map((box) => (
                        <StorageBox key={box.id} box={box} onClose={removeWindow} onFocus={bringToFront} />
                    ))}
                </CanvasContainer>
            </main>
        </div>
    );
};

export default HomePage;
