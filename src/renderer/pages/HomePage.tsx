import React, {useState, useRef, useEffect} from 'react';
import {HardDrive} from "lucide-react"
import CanvaSettings from "@Components/CanvaSettings";
import ActionBar from "@Components/ActionBar";
import {CanvasContainer} from "@Components/CanvasContainer";
import {StorageBox} from "@Components/StorageBox";
import { type StorageBoxData } from "@Types/box";
import {FaGoogleDrive} from "react-icons/fa";
import StorageSideWindow from '@/components/StorageSideWindow';

const test = {
    folders: ["Documents", "Pictures", "Downloads", "Desktop"],
    files: ["readme.txt", "report.pdf", "image.jpg", "data.csv"],
};

const HomePage = () => {
    const [zoomLevel, setZoomLevel] = useState(1);
    const [isPanMode, setIsPanMode] = useState(false);
    const [action, setAction] = useState("dashboard");
    const [position, setPosition] = useState({x: 0, y: 0});
    const [nextZIndex, setNextZIndex] = useState(4);
    const canvasVwpRef = useRef<HTMLDivElement>({} as HTMLDivElement);
    const [canvasVwpSize, setCanvasViewportSize] = useState({ width: 0, height: 0 });
    const [showStorageWindow, setShowStorageWindow] = useState(false);
    
    const toggleShowSideWindow = () => {
        setShowStorageWindow(!showStorageWindow); // Toggle the storage window visibility
    };

    const [storageBoxes, setStorageBoxes] = useState<StorageBoxData[]>([
        {
            id: 1,
            title: "Local Directory",
            type: "local",
            content: test,
            icon: <HardDrive className="h-6 w-6"/>,
            position: { x: -250, y: -200 },
            size: { width: 400, height: 300 },
            zIndex: 1,
        },
        {
            id: 2,
            title: "Google acc",
            type: "cloud",
            content: test,
            icon: <FaGoogleDrive className="h-6 w-6"/>,
            position: { x: 200, y: -150 },
            size: { width: 450, height: 350 },
            zIndex: 2,
        },
    ]);


    useEffect(() => {
        const observedElement = canvasVwpRef.current;
        if (!observedElement) return;

        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                setCanvasViewportSize({
                    width: width - 80,
                    height: height,
                });
            }
        });

        resizeObserver.observe(observedElement);

        if (observedElement.clientWidth > 0 && observedElement.clientHeight > 0) {
            if (canvasVwpSize.width === 0 && canvasVwpSize.height === 0) {
                const initialWidth = observedElement.clientWidth - 80;
                const initialHeight = observedElement.clientHeight;
                setCanvasViewportSize({ width: initialWidth, height: initialHeight });
                console.log("CanvasViewportSize set on initial check:", { width: initialWidth, height: initialHeight });
            }
        }


        return () => {
            resizeObserver.unobserve(observedElement);
        };
    }, [canvasVwpRef.current]);

    const removeWindow = (id: number) => {
        setStorageBoxes(storageBoxes.filter((w) => w.id !== id));
    };

    const bringToFront = (id: number) => {
        setStorageBoxes(
            storageBoxes.map((window) => {
                if (window.id === id) {
                    return { ...window, zIndex: nextZIndex };
                }
                return window;
            }),
        );
        setNextZIndex(nextZIndex + 1);
    };

    return (
        <div className="flex flex-col h-screen bg-white dark:bg-gray-900 text-black dark:text-white">
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
            <main className="flex flex-1 overflow-hidden" ref={canvasVwpRef}>
            <ActionBar action={action} setAction={setAction} toggleShowSideWindow={toggleShowSideWindow}/>
            <div className="relative flex flex-1">
                    <StorageSideWindow show={showStorageWindow}/>
                    {canvasVwpSize.width > 0 && canvasVwpSize.height > 0 ? (
                        <CanvasContainer
                            zoomLevel={zoomLevel}
                            isPanMode={isPanMode}
                            className="relative"
                            position={position}
                            setPosition={setPosition}
                        >
                            {storageBoxes.map((box) => (
                                <StorageBox
                                    key={box.id}
                                    box={box}
                                    onClose={removeWindow}
                                    onFocus={bringToFront}
                                    viewportSize={canvasVwpSize}
                                    viewportRef={canvasVwpRef as React.RefObject<HTMLDivElement>}
                                    canvasZoom={zoomLevel}
                                    canvasPan={position}
                                />
                            ))}
                        </CanvasContainer>
                    ) : (
                        <div className="flex-1 flex items-center justify-center">Loading canvas...</div>
                    )}
            </div>
            </main>
        </div>
    );
};

export default HomePage;