import React, { useState, useRef, useEffect, use, useCallback } from 'react';
import { CloudLightning, HardDrive } from "lucide-react"
import CanvaSettings from "@Components/CanvaSettings";
import ActionBar from "@Components/ActionBar";
import { CanvasContainer } from "@Components/CanvasContainer";
import { StorageBox } from "@Components/StorageBox";
import { type StorageBoxData } from "@Types/box";
import { FaGoogleDrive } from "react-icons/fa";
import StorageSideWindow from '@/components/StorageSideWindow';
import { CloudType } from '@Types/cloudType';
import { FileContent } from '@Types/fileSystem';
import { BoxDragProvider } from "@/contexts/BoxDragContext";
import { BoxDragPreview } from '@/components/BoxDragPreview';
import { FileUploadMessage } from '@/components/FileUploadMessage';
import SettingsPanel from '@/components/SettingsPanel';

import { motion, AnimatePresence } from "framer-motion" // Uncomment if available
import { Button } from '@/components/ui/button';
import AgentWindow from '../components/AgentWindow';
const test = {
    folders: ["Documents", "Pictures", "Downloads", "Desktop"],
    files: ["readme.txt", "report.pdf", "image.jpg", "data.csv"],
};

export async function showAreYouSure(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const userConfirmed = window.confirm("Are you sure you want to upload the file? This action cannot be undone.");
        if (userConfirmed) {
            resolve();
        } else {
            reject(new Error("User cancelled the operation"));
        }
    });
};

const HomePage = () => {
    const [zoomLevel, setZoomLevel] = useState(1);
    const [isPanMode, setIsPanMode] = useState(false);
    const [action, setAction] = useState("dashboard");
    const [maximizedBoxes, setMaximizedBoxes] = useState<Set<number>>(new Set());
    const [position, setPosition] = useState({x: 0, y: 0});
    const nextZIndexRef = useRef(4);
    const canvasVwpRef = useRef<HTMLDivElement>({} as HTMLDivElement);
    const [canvasVwpSize, setCanvasViewportSize] = useState({ width: 0, height: 0 });
    const [showStorageWindow, setShowStorageWindow] = useState(false);
    const [nextBoxId, setNextBoxId] = useState(3);
    const [isMovingItem, setIsMovingItem] = useState(false);
    const [fileUploadMessage, setFileUploadMessage] = useState<string>("");
    const [fileUploadMessageOpen, setFileUploadMessageOpen] = useState<boolean>(false);
    const [showMcpTest, setShowMcpTest] = useState(false);
    const [disabledAction, setDisabledAction] = useState(false);

    const fileContentsCacheRef = useRef<FileContent[]>([]);
    const isContentLoading = useRef(false);

    const boxRefs = useRef(new Map());

    const getRefForBox = (id: number) => {
        if (!boxRefs.current.has(id)) {
            boxRefs.current.set(id, React.createRef());
        }
        return boxRefs.current.get(id);
    };

    // Should be called from the successful uploaded file
    const deleteFileFromSource = async (fileContentCache: FileContent) => {
        console.log("Deleting file from source:", fileContentCache);
        // source from the local file system
        if (!fileContentCache.sourceCloudType || !fileContentCache.sourceAccountId) {
            await (window as any).fsApi.deleteFile(fileContentCache.path); // TODO remove from the corresponding source file owner           

        }
        // source from the cloud file system
        await (window as any).cloudFsApi.deleteFile(fileContentCache.sourceCloudType, fileContentCache.sourceAccountId, fileContentCache.path); // TODO remove from the corresponding source file owner
        storageBoxesRef.current.forEach((box) => {
            console.log("Checking box:", box.id, "for file deletion");
            console.log("Box sourceAccountId:", box.accountId, "Box cloudType:", box.cloudType);
            console.log("File sourceAccountId:", fileContentCache.sourceAccountId, "File cloudType:", fileContentCache.sourceCloudType);
            if (box.accountId === fileContentCache.sourceAccountId && box.cloudType === fileContentCache.sourceCloudType ||
                (!box.accountId && !fileContentCache.sourceAccountId && !box.cloudType && !fileContentCache.sourceCloudType) // Local file system
            ) {
                // If the box is open, we can call a method on the box to update its content
                console.log("Refresh for updated box content for box:", box.id);
                const ref = boxRefs.current.get(box.id);
                ref.current?.callDoRefresh?.();
            }
        });
    }


    const tempPostFile = async (parentPath: string, cloudType?: CloudType, accountId?: string) => {
        try {
            // Wait for user confirmation
            await showAreYouSure();

            setIsMovingItem(true);

            // Wait for content loading
            while (isContentLoading.current) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            const fileContentsCache = fileContentsCacheRef.current;
            if (!fileContentsCache?.length) {
                throw new Error("No file content to upload");
            }

            // Upload files based on destination type
            if (!cloudType || !accountId) {
                // Local file system uploads
                await Promise.all(fileContentsCache.map(async (fileContent) => {
                    try {
                        await (window as any).fsApi.postFile(
                            fileContent.name,
                            parentPath,
                            fileContent.content
                        );
                        await deleteFileFromSource(fileContent);
                        return Promise.resolve();
                    } catch (err) {
                        return Promise.reject(err);
                    }
                }));
            } else {
                // Cloud file system uploads
                await Promise.all(fileContentsCache.map(async (fileContent) => {
                    try {
                        await (window as any).cloudFsApi.postFile(
                            cloudType,
                            accountId,
                            fileContent.name,
                            parentPath,
                            fileContent.content
                        );
                        await deleteFileFromSource(fileContent);
                        return Promise.resolve();
                    } catch (err) {
                        return Promise.reject(err);
                    }
                }));
            }

            setFileUploadMessage("Files uploaded successfully");
            setFileUploadMessageOpen(true);

        } catch (error) {
            console.log("File upload failed:", error);
            // setFileUploadMessage(error instanceof Error ? error.message : "Upload failed");
            // setFileUploadMessageOpen(true);
        } finally {
            setIsMovingItem(false);
            fileContentsCacheRef.current = [];
        }
    }

    const tempGetFile = async (filePaths: string[], cloudType?: CloudType, accountId?: string) => {
        isContentLoading.current = true; // Set content loading state to true
        if (!cloudType || !accountId) {
            // local file system
            console.log("local file system, call getFile from local file system:", filePaths);
            for (const filePath of filePaths) {
                await (window as any).fsApi.getFile(filePath)
                    .then((fileContent: FileContent) => {
                        console.log("File content:", fileContent);
                        // fileContentCacheRef.current = fileContent; // Update the ref with the new file content
                        fileContentsCacheRef.current.push(fileContent); // Update the ref with the new file content
                        // setFileContentCache(fileContent);
                    })
                    .catch((err: Error) => {
                        console.error(err)
                    })
            }
        } else {
            console.log("Fetching file content from cloud account:", cloudType, accountId, filePaths);

            for (const filePath of filePaths) {
                await (window as any).cloudFsApi.getFile(cloudType, accountId, filePath)
                    .then((fileContent: FileContent) => {
                        console.log("File content:", fileContent);
                        fileContentsCacheRef.current.push(fileContent); // Update the ref with the new file content
                    })
                    .catch((err: Error) => {
                        console.error(err)
                    })
            }
        }
        console.log("File content fetch completed");
        isContentLoading.current = false; // Set content loading state to false
    }

    //Manage box-to-box transfer
    const handleBoxTransfer = async (
        sourceItems: any[],
        targetBoxId: number,
        targetPath: string = "/"
    ) => {
        const targetBox = storageBoxes.find(box => box.id === targetBoxId);
        if (!targetBox) {
            console.error("Target box not found:", targetBoxId);
            return;
        }


        console.log("Starting box transfer:");
        console.log("Source items:", sourceItems);
        console.log("Target box:", targetBox);
        console.log("Target path:", targetPath);

        // TODO: Implement actual box file transfer logic, I will leave this to you,
        for (const item of sourceItems) {
            console.log(`Transferring: ${item.name} to box ${targetBoxId}`);

            if (targetBox.cloudType && targetBox.accountId) {
                // Cloud

                console.log("Would transfer to cloud:", targetBox.cloudType, targetBox.accountId);
            } else {
                // Local
                console.log("Would transfer to local:", targetPath);
            }
        }

        //TODO: Implement a notification like a loading spinner or progress bar or something?
        console.log("Box transfer completed");
    };

    const toggleShowSideWindow = () => {
        setShowStorageWindow(!showStorageWindow); // Toggle the storage window visibility
    };


    const toggleShowAgentWindow = () => {
        console.log("Toggling MCP Test window visibility");
        setShowMcpTest(!showMcpTest); // Toggle the storage window visibility
    };

    const [storageBoxes, setStorageBoxes] = useState<StorageBoxData[]>([
        {
            id: 1,
            title: "Local Directory",
            type: "local",
            icon: <HardDrive className="h-6 w-6" />,
            position: { x: -250, y: -200 },
            size: { width: 400, height: 300 },
            zIndex: 1,
        }
    ]);

    // To sync storageBoxes with a ref for performance.. not sure actually..
    const storageBoxesRef = useRef<StorageBoxData[]>(storageBoxes);

    useEffect(() => {
        storageBoxesRef.current = storageBoxes;
    }, [storageBoxes]);

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

    const addStorageBox = (type: string, title: string, icon: React.ReactNode, cloudType?: CloudType, accountId?: string) => {
        const newStorageBox: StorageBoxData = {
            id: nextBoxId,
            title: title,
            type: type,
            icon: icon,
            position: { x: 0, y: 0 },
            size: { width: 400, height: 300 },
            // zIndex: nextZIndexRef.current,
            cloudType: cloudType,
            accountId: accountId,
        };
        setStorageBoxes([...storageBoxes, newStorageBox]);
        setNextBoxId(nextBoxId + 1);
        // setNextZIndex(nextZIndex + 1);
        // nextZIndexRef.current += 1;
        setShowStorageWindow(false); // Close the storage window after adding
    };

    const removeWindow = (id: number) => {
        setStorageBoxes(storageBoxes.filter((w) => w.id !== id));
    };

    // Function to close all storage boxes when accounts are cleared
    const handleAccountsCleared = () => {
        console.log('All accounts cleared, closing all storage boxes');
        setStorageBoxes([]);
    };

    // Function to close storage boxes 
    const closeStorageBoxesForAccount = (cloudType: CloudType, accountId: string) => {
        console.log(`Closing storage boxes for deleted account ${accountId} of type ${cloudType}`);
        
        // Filter out storage boxes 
        setStorageBoxes(prev => prev.filter(box => 
            !(box.cloudType === cloudType && box.accountId === accountId)
        ));
    };

    const bringToFront = useCallback((id: number) => {
        // Skip if box is maximized
        if (maximizedBoxes.has(id)) return;

        // Increment zIndex
        nextZIndexRef.current += 1;
        const newZIndex = nextZIndexRef.current;

        // Update all box z-indices
        storageBoxesRef.current.forEach((box) => {
            const boxRef = boxRefs.current.get(box.id);
            console.log(box.id === id);
            console.log("Box ref:", boxRef);
            if (boxRef && boxRef.current) {
                // Set higher z-index for clicked box, lower for others
                boxRef?.current?.setStyle({
                    zIndex: box.id === id ? newZIndex : (box.zIndex || 1) - 1,
                });
            }
        });
    }, [storageBoxes, maximizedBoxes]);

    const setBoxMaximized = (boxId: number, isMaximized: boolean) => {
        setMaximizedBoxes(prev => {
            const newSet = new Set(prev);
            if (isMaximized) {
                newSet.add(boxId);
            } else {
                newSet.delete(boxId);
            }
            return newSet;
        });
    };

    // Check if any box is maximized
    const anyBoxMaximized = maximizedBoxes.size > 0;

    const handleActionChange: React.Dispatch<React.SetStateAction<string>> = (newAction) => {
        if (newAction === "settings") {
            setShowMcpTest(false);
            setShowStorageWindow(false);
            setDisabledAction(true)
        } else {
            setDisabledAction(false)
        }
        setAction(newAction);
    };

    return (
        <div className="flex flex-col h-screen bg-white dark:bg-gray-900 text-black dark:text-white">
            <header className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-md">
                <div className="flex items-center justify-between ml-5 mr-5 mt-3 mb-3">
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center">
                            <div
                                className="bg-gradient-to-r from-blue-500 to-indigo-600 p-2 rounded-lg shadow-md mr-3">
                                <HardDrive className="h-6 w-6 text-white" />
                            </div>
                            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent select-none">
                                Easy Access
                            </h1>
                        </div>
                    </div>
                    <CanvaSettings zoomLevel={zoomLevel} setZoomLevel={setZoomLevel} isPanMode={isPanMode}
                        setIsPanMode={setIsPanMode} isBoxMaximized={anyBoxMaximized} isDisabled={disabledAction}/>
                </div>
            </header>
            <FileUploadMessage open={fileUploadMessageOpen} setOpen={setFileUploadMessageOpen} message={fileUploadMessage} showCloseButton={true}></FileUploadMessage>
            <main className="flex flex-1 overflow-hidden" ref={canvasVwpRef}>
                {isMovingItem && (
                    <div className="fixed top-0 left-0 w-full h-full bg-gray-500/50 backdrop-blur-sm flex items-center justify-center z-50">
                        <p>Moving item...</p>
                    </div>
                )}
                <ActionBar action={action} setAction={handleActionChange} toggleShowSideWindow={toggleShowSideWindow} toggleShowAgentWindow={toggleShowAgentWindow} />
                <BoxDragProvider>
                    <div className="relative flex flex-1">
                        <StorageSideWindow show={showStorageWindow} addStorage={addStorageBox} onAccountDeleted={closeStorageBoxesForAccount} />
                        <div className="relative flex flex-col flex-1">
                            {action === "settings" ? (
                                <SettingsPanel onAccountsCleared={handleAccountsCleared} />
                            ) : canvasVwpSize.width > 0 && canvasVwpSize.height > 0 ? (
                                <CanvasContainer
                                    zoomLevel={zoomLevel}
                                    setZoomLevel={setZoomLevel}
                                    isPanMode={isPanMode}
                                    className="relative"
                                    position={position}
                                    setPosition={setPosition}
                                    boxMaximized={anyBoxMaximized}
                                >
                                    {storageBoxes.map((box) => (
                                        <StorageBox
                                            ref={getRefForBox(box.id)}
                                            key={box.id}
                                            box={box}
                                            onClose={removeWindow}
                                            onFocus={bringToFront}
                                            viewportSize={canvasVwpSize}
                                            viewportRef={canvasVwpRef as React.RefObject<HTMLDivElement>}
                                            canvasZoom={zoomLevel}
                                            canvasPan={position}
                                            isMaximized={maximizedBoxes.has(box.id)}
                                            setIsMaximized={(isMaximized: boolean) => setBoxMaximized(box.id, isMaximized)}
                                            tempPostFile={tempPostFile}
                                            tempGetFile={tempGetFile}
                                            onBoxTransfer={handleBoxTransfer}
                                        />
                                    ))}
                                </CanvasContainer>
                            ) : (
                                <div className="flex-1 flex items-center justify-center">Loading canvas...</div>
                            )}                      
                             <AgentWindow show={showMcpTest} />
                        </div>
                    </div>
                    <BoxDragPreview zoomLevel={zoomLevel} />
                </BoxDragProvider>
            </main>
        </div>
    );
};

export default HomePage;