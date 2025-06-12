import React, { useState, useRef, useEffect, useCallback } from 'react';
import {HardDrive } from "lucide-react"
import CanvaSettings from "@Components/CanvaSettings";
import ActionBar from "@Components/ActionBar";
import { CanvasContainer } from "@Components/CanvasContainer";
import { StorageBox } from "@Components/StorageBox";
import { type StorageBoxData } from "@Types/box";
import StorageSideWindow from '@/components/StorageSideWindow';
import { CloudType } from '@Types/cloudType';
import { FileContent } from '@Types/fileSystem';
import { BoxDragProvider } from "@/contexts/BoxDragContext";
import { BoxDragPreview } from '@/components/BoxDragPreview';
import SettingsPanel from '@/components/SettingsPanel';
import AgentWindow from '../components/AgentWindow';
import { MovingItemStatus } from '@/components/MovingItemStatus';
import { UploadConfirmationDialog } from '@/components/UploadConfirmationDialog';


export async function showAreYouSure(): Promise<{ confirmed: boolean; keepOriginal: boolean }> {
    return new Promise<{ confirmed: boolean; keepOriginal: boolean }>((resolve) => {
        resolve({ confirmed: false, keepOriginal: false });
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
    const [movingItemProgress, setMovingItemProgress] = useState(0);
    const [movingItemError, setMovingItemError] = useState<string | null>(null);
    const [movingItemCompleted, setMovingItemCompleted] = useState(false);
    const [currentMovingItem, setCurrentMovingItem] = useState<string>("");
    const [transferStartTime, setTransferStartTime] = useState<number>(0);
    const [totalItemsToTransfer, setTotalItemsToTransfer] = useState<number>(0);
    const [showMcpTest, setShowMcpTest] = useState(false);
    const [disabledAction, setDisabledAction] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [showUploadDialog, setShowUploadDialog] = useState(false);
    const [uploadDialogResolve, setUploadDialogResolve] = useState<((value: { confirmed: boolean; keepOriginal: boolean }) => void) | null>(null);

    const fileContentsCacheRef = useRef<FileContent[]>([]);
    const isContentLoading = useRef(false);
    const transferAbortController = useRef<AbortController | null>(null);

    const boxRefs = useRef(new Map());

    const getRefForBox = (id: number) => {
        if (!boxRefs.current.has(id)) {
            boxRefs.current.set(id, React.createRef());
        }
        return boxRefs.current.get(id);
    };

    // Function to show upload confirmation dialog
    const showUploadConfirmation = (): Promise<{ confirmed: boolean; keepOriginal: boolean }> => {
        return new Promise((resolve) => {
            setUploadDialogResolve(() => resolve);
            setShowUploadDialog(true);
        });
    };

    // Handle upload dialog confirmation
    const handleUploadDialogConfirm = (keepOriginal: boolean) => {
        setShowUploadDialog(false);
        if (uploadDialogResolve) {
            uploadDialogResolve({ confirmed: true, keepOriginal });
            setUploadDialogResolve(null);
        }
    };

    // Handle upload dialog cancellation
    const handleUploadDialogCancel = () => {
        setShowUploadDialog(false);
        if (uploadDialogResolve) {
            uploadDialogResolve({ confirmed: false, keepOriginal: false });
            setUploadDialogResolve(null);
        }
    };

    // Should be called from the successful uploaded file
    const deleteFileFromSource = async (fileContentCache: FileContent, keepOriginal: boolean = false) => {
        if (keepOriginal) {
            console.log("Keeping original file, skipping deletion:", fileContentCache.path);
            return;
        }

        console.log("Deleting file from source:", fileContentCache);
        // source from the local file system
        if (!fileContentCache.sourceCloudType || !fileContentCache.sourceAccountId) {
            await (window as any).fsApi.deleteFile(fileContentCache.path);
        } else {
            // source from the cloud file system
            await (window as any).cloudFsApi.deleteFile(fileContentCache.sourceCloudType, fileContentCache.sourceAccountId, fileContentCache.path);
        }
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
            // Wait for user confirmation with the new dialog
            const confirmation = await showUploadConfirmation();
            if (!confirmation.confirmed) {
                throw new Error("User cancelled the operation");
            }

            // Show MovingItemStatus popup immediately after confirmation
            setIsMovingItem(true);
            setMovingItemProgress(0);
            setMovingItemError(null);
            setMovingItemCompleted(false);
            setCurrentMovingItem("Preparing transfer...");
            setIsCancelling(false);
            setTransferStartTime(Date.now());

            // Create abort controller for cancellation
            transferAbortController.current = new AbortController();

            // Wait for download to complete if still in progress
            while (isContentLoading.current) {
                setCurrentMovingItem("Downloading files...");
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            const fileContentsCache = fileContentsCacheRef.current;
            if (!fileContentsCache?.length) {
                throw new Error("No file content to upload");
            }

            const totalFiles = fileContentsCache.length;
            setTotalItemsToTransfer(totalFiles);

            const startProgress = 0;
            setMovingItemProgress(startProgress);

            let completedFiles = 0;
            const progressRange = 100;

            // Upload files based on destination type
            if (!cloudType || !accountId) {
                // Local file system uploads
                for (const fileContent of fileContentsCache) {
                    if (transferAbortController.current.signal.aborted) {
                        throw new Error("Transfer cancelled by user");
                    }

                    setCurrentMovingItem(`${confirmation.keepOriginal ? 'Copying' : 'Moving'} ${fileContent.name}`);
                    
                    try {
                        await (window as any).fsApi.postFile(
                            fileContent.name,
                            parentPath,
                            fileContent.content
                        );
                        await deleteFileFromSource(fileContent, confirmation.keepOriginal);
                        completedFiles++;
                        setMovingItemProgress((completedFiles / totalFiles) * progressRange);
                    } catch (err) {
                        throw new Error(`Failed to upload ${fileContent.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
                    }
                }
            } else {
                // Cloud file system uploads
                for (const fileContent of fileContentsCache) {
                    if (transferAbortController.current.signal.aborted) {
                        throw new Error("Transfer cancelled by user");
                    }

                    setCurrentMovingItem(`${confirmation.keepOriginal ? 'Copying' : 'Moving'} ${fileContent.name}`);
                    
                    try {
                        await (window as any).cloudFsApi.postFile(
                            cloudType,
                            accountId,
                            fileContent.name,
                            parentPath,
                            fileContent.content
                        );
                        await deleteFileFromSource(fileContent, confirmation.keepOriginal);
                        completedFiles++;
                        setMovingItemProgress((completedFiles / totalFiles) * progressRange);
                    } catch (err) {
                        throw new Error(`Failed to upload ${fileContent.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
                    }
                }
            }

            // Success
            setMovingItemCompleted(true);

            setTimeout(() => {
                if (!movingItemError) {
                    resetMovingItemState();
                }
            }, 3000);

        } catch (error) {
            console.log("File upload failed:", error);
            const errorMessage = error instanceof Error ? error.message : "Upload failed";
            
            if (errorMessage.includes("cancelled")) {
                setMovingItemError("Transfer cancelled");
            } else {
                setMovingItemError(errorMessage);
            }
        } finally {
            setIsCancelling(false);
            transferAbortController.current = null;
        }
    }

    const handleCancelTransfer = () => {
        if (transferAbortController.current && !isCancelling) {
            setIsCancelling(true);
            transferAbortController.current.abort();
        }
    };

    const resetMovingItemState = () => {
        setIsMovingItem(false);
        setMovingItemProgress(0);
        setMovingItemError(null);
        setMovingItemCompleted(false);
        setCurrentMovingItem("");
        setIsCancelling(false);
        setTransferStartTime(0);
        setTotalItemsToTransfer(0);
        fileContentsCacheRef.current = [];
        transferAbortController.current = null;
    };

    const tempGetFile = async (filePaths: string[], cloudType?: CloudType, accountId?: string) => {
        try {
            isContentLoading.current = true; 
            
            // Reset file cache
            fileContentsCacheRef.current = [];
            
            const totalFiles = filePaths.length;
            let downloadedFiles = 0;
            
            if (!cloudType || !accountId) {
                // local file system
                console.log("local file system, call getFile from local file system:", filePaths);
                for (const filePath of filePaths) {
                    try {
                        const fileName = filePath.split('/').pop() || filePath;
                        
                        const fileContent: FileContent = await (window as any).fsApi.getFile(filePath);
                        console.log("File content:", fileContent);
                        fileContentsCacheRef.current.push(fileContent); // Update the ref with the new file content
                        downloadedFiles++;
                    } catch (err: any) {
                        console.error(err);
                        throw new Error(`Failed to read ${filePath}: ${err.message}`);
                    }
                }
            } else {
                console.log("Fetching file content from cloud account:", cloudType, accountId, filePaths);

                for (const filePath of filePaths) {
                    try {
                        const fileName = filePath.split('/').pop() || filePath;
                        
                        const fileContent: FileContent = await (window as any).cloudFsApi.getFile(cloudType, accountId, filePath);
                        console.log("File content:", fileContent);
                        fileContentsCacheRef.current.push(fileContent); // Update the ref with the new file content
                        downloadedFiles++;
                    } catch (err: any) {
                        console.error(err);
                        throw new Error(`Failed to download ${filePath}: ${err.message}`);
                    }
                }
            }
            console.log("File content fetch completed");
        } catch (error: any) {
            throw error;
        } finally {
            isContentLoading.current = false;
        }
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

    useEffect(() => {
        return () => {
            if (transferAbortController.current) {
                transferAbortController.current.abort();
            }
        };
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isMovingItem && !movingItemCompleted && !movingItemError) {
                handleCancelTransfer();
            }
        };

        if (isMovingItem) {
            document.addEventListener('keydown', handleKeyDown);
            return () => document.removeEventListener('keydown', handleKeyDown);
        }
    }, [isMovingItem, movingItemCompleted, movingItemError]);

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
        setStorageBoxes(prevBoxes => prevBoxes.filter((w) => w.id !== id));
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
            <main className="flex flex-1 overflow-hidden" ref={canvasVwpRef}>
                {isMovingItem && (
                    <MovingItemStatus
                        isVisible={isMovingItem}
                        itemCount={totalItemsToTransfer}
                        currentItem={currentMovingItem}
                        progress={movingItemProgress}
                        error={movingItemError}
                        isCompleted={movingItemCompleted}
                        onCancel={isCancelling ? undefined : handleCancelTransfer}
                        onClose={resetMovingItemState}
                        startTime={transferStartTime}
                    />
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
                
                <UploadConfirmationDialog
                    isOpen={showUploadDialog}
                    onConfirm={handleUploadDialogConfirm}
                    onCancel={handleUploadDialogCancel}
                    fileCount={fileContentsCacheRef.current?.length || 1}
                />
            </main>
        </div>
    );
};

export default HomePage;