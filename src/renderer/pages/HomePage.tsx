import React, {useRef, useState} from 'react';
import {HardDrive} from "lucide-react"
import CanvaSettings from "@Components/CanvaSettings";
import ActionBar from "@Components/ActionBar";
import {CanvasContainer} from "@Components/CanvasContainer";

const test = {
    folders: ["Documents", "Pictures", "Downloads", "Desktop"],
    files: ["readme.txt", "report.pdf", "image.jpg", "data.csv"],
}


type BoxSize = "small" | "medium" | "large" | "full"
type SplitZone = "top" | "right" | "bottom" | "left" | null
import {CloudItem} from "@Components/ui/cloudItem";
import { FaGoogleDrive, FaDropbox } from "react-icons/fa";
import { SiIcloud } from "react-icons/si";


const HomePage = () => {

    // State to track the active navigation item
    const [activeNav, setActiveNav] = useState("Home");
    const [showStorageWindow, setShowStorageWindow] = useState(false);
    const [token, setToken] = useState<string | null>(null);

    const handleGoogleAuth = async () => {
        // TODO added for testing
        // await (window as any).electronAPI.clearAuthTokens(); 
        console.log('google drive clicked')
        try {
            var token = await (window as any).electronAPI.getAuthTokens();
            if (!token) {
                token = await (window as any).electronAPI.googleAuth();
                await (window as any).electronAPI.saveAuthTokens(token);
            }
            setToken(token.access_token);
            console.log("Token: ", token);
        } catch (error) {
            console.error('Login error:', error)
        }
    }

    const handleNavClick = (label: string) => {
        setActiveNav(label); // Update the active navigation item
    };

    const handleAddStorageClick = () => {
        setShowStorageWindow(!showStorageWindow); // Toggle the storage window visibility
    };
    const [activeBoxId, setActiveBoxId] = useState(1)
    const [zoomLevel, setZoomLevel] = useState(1) // 1 = 100%, 0.5 = 50%, 2 = 200%
    const [isPanMode, setIsPanMode] = useState(false)
    const [action, setAction] = useState("dashboard")
    const [position, setPosition] = useState({x: 0, y: 0})
    const containerRef = useRef<HTMLDivElement>(null)

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
            <main className="flex flex-1 overflow-hidden">
                <ActionBar action={action} setAction={setAction}/>
                <CanvasContainer
                    zoomLevel={zoomLevel}
                    isPanMode={isPanMode}
                    className="relative"
                    position={position}
                    setPosition={setPosition}

                >
                    <></>
                </CanvasContainer>
            </main>
        </div>
    );
};

export default HomePage;
