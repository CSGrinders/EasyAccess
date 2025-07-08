import React, { useState, useRef, useEffect, useCallback } from 'react';
import {HardDrive } from "lucide-react"
import CanvaSettings from "@/components/canvas/CanvaSettings";
import ActionBar from "@/components/app/ActionBar";
import { CanvasContainer } from "@/components/canvas/CanvasContainer";
import { StorageBox } from "@/components/box/StorageBox";
import { type StorageBoxData } from "@Types/box";
import StorageSideWindow from '@/components/box/StorageSideWindow';
import { CloudType } from '@Types/cloudType';
import { DashboardState } from '@Types/canvas';
import { BoxDragProvider } from "@/contexts/BoxDragContext";
import { BoxDragPreview } from '@/components/box/BoxDragPreview';
import SettingsPanel from '@/pages/SettingsPanel';
import AgentWindow from '../components/app/AgentWindow';
import { TransferManager } from '@/components/transactions/TransferManager';
import { TransferDetailPanel } from '@/pages/TransferDetailPanel';
import { UploadConfirmationDialog } from '@/components/transactions/UploadConfirmationDialog';
import { useTransferService } from '@/services/TransferService';
import { RendererIpcCommandDispatcher } from '@/services/AgentControlService';

import { FaDropbox, FaGoogleDrive} from "react-icons/fa";
import { TbBrandOnedrive } from "react-icons/tb";
import { AgentClarificationDialog } from '@/components/box/AgentClarificationDialog';
import AgentAction  from '@/components/box/AgentAction';

const Dashboard = () => {
    const [zoomLevel, setZoomLevel] = useState(1);
    const [isPanMode, setIsPanMode] = useState(false);
    const [action, setAction] = useState("dashboard");
    const [maximizedBoxes, setMaximizedBoxes] = useState<Set<number>>(new Set());
    const [position, setPosition] = useState({x: 0, y: 0});
    const nextZIndexRef = useRef(4);
    const canvasVwpRef = useRef<HTMLDivElement>({} as HTMLDivElement);
    const [canvasVwpSize, setCanvasViewportSize] = useState({ width: 0, height: 0 });
    const [showStorageWindow, setShowStorageWindow] = useState(false);
    const [showMcpTest, setShowMcpTest] = useState(false);
    const [disabledAction, setDisabledAction] = useState(false);

    const [showClarificationDialog, setShowClarificationDialog] = useState(false);
    const [question, setQuestion] = useState("");
    // const [userResponseForClarification, setUserResponseForClarification] = useState("");
    // const [showAgentWork, setShowAgentWork] = useState(false);
    // const [agentWorkingMessages, setAgentWorkingMessages] = useState<string[]>([]);

    const boxRefs = useRef(new Map());

    const getRefForBox = (id: number) => {
        if (!boxRefs.current.has(id)) {
            boxRefs.current.set(id, React.createRef());
        }
        return boxRefs.current.get(id);
    };

    const [storageBoxes, setStorageBoxes] = useState<StorageBoxData[]>([]);

    // To sync storageBoxes with a ref for performance.. not sure actually..
    const storageBoxesRef = useRef<StorageBoxData[]>(storageBoxes);

    useEffect(() => {
        storageBoxesRef.current = storageBoxes;
    }, [storageBoxes]);

    // Initialize transfer service
    const {
        transferQueue,
        fileContentsCacheRef,
        showUploadDialog,
        handleCancelTransfer,
        handleCloseTransfer,
        handleRetryTransfer,
        tempPostFile,
        tempGetFile,
        tempDragDropTransfer,
        handleUploadDialogConfirm,
        handleUploadDialogCancel,
    } = useTransferService({ boxRefs, storageBoxesRef });


    const toggleShowSideWindow = () => {
        setShowStorageWindow(!showStorageWindow); // Toggle the storage window visibility
    };

    const toggleShowAgentWindow = () => {
        console.log("Toggling MCP Test window visibility");
        setShowMcpTest(!showMcpTest); // Toggle the storage window visibility
    };

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

    function getNextBoxId() {
        // Get the next box ID based on the current state
        const setUsedIds = new Set(storageBoxes.map(box => box.id));
        let nextId = 1;
        while (setUsedIds.has(nextId)) {
            nextId++;
        }
        return nextId;
    }

    const addStorageBox = (type: string, title: string, icon?: React.ReactNode, cloudType?: CloudType, accountId?: string) => {
        console.log(`Adding storage box: type=${type}, title=${title}, icon=${icon}, cloudType=${cloudType}, accountId=${accountId}`);
        const nextBoxId = getNextBoxId();
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
        // there can be better algorithm to handle z-index management TODO
        // but now its fine i guess...
        // Skip if box is maximized
        if (maximizedBoxes.has(id)) return;

        // Increment zIndex
        nextZIndexRef.current += 1;
        const newZIndex = nextZIndexRef.current;

        // Update all box z-indices
        storageBoxesRef.current.forEach((box) => {
            const boxRef = boxRefs.current.get(box.id);
            if (boxRef && boxRef.current) {
                // Set higher z-index for clicked box, lower for others
                boxRef?.current?.setStyle({
                    zIndex: box.id === id ? newZIndex : (box.zIndex ? (box.zIndex > 2 ? box.zIndex - 1 : 2) : 2),
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
        } else if (newAction === "transfers") {
            setShowMcpTest(false);
            setShowStorageWindow(false);
            setDisabledAction(true)
        } else {
            setDisabledAction(false)
        }
        setAction(newAction);
    };


    useEffect(() => {
        const dispatcher = RendererIpcCommandDispatcher.getInstance();

        dispatcher.register('openAccountWindow', addStorageBox);
        dispatcher.register('getFileOnRenderer', tempGetFile);
        dispatcher.register('postFileOnRenderer', tempPostFile);

        return () => {
            dispatcher.unregister('openAccountWindow');
            dispatcher.unregister('getFileOnRenderer');
            dispatcher.unregister('postFileOnRenderer');
        };
    }, [tempPostFile, tempGetFile, addStorageBox]);

    // Move the listener setup into a useEffect to properly handle state updates
    useEffect(() => {
        const layoutHandler = () => {
            console.log("Requesting layout for Dashboard");
            const currentState: DashboardState = {
                scale: zoomLevel,  // Now this will have the current value
                pan: position,
                boxes: storageBoxesRef.current.map(box => {
                    const boxRef = getRefForBox(box.id);
                    const boxState = boxRef.current?.getCurrentState();
                    return {
                        id: box.id.toString(),
                        title: box.title,
                        type: box.type,
                        position: boxState?.position || { x: -1, y: -1 },
                        size: boxState?.size || { width: 400, height: 300 },
                        zIndex: box.zIndex ?? 0,
                        cloudType: box.cloudType ? String(box.cloudType) : undefined,
                        accountId: box.accountId,
                    };
                }),
            };
            console.log("Current state:", currentState);
            return currentState;
        };

        // Register the handler
        (window as any).electronAPI.onRequestLayout(layoutHandler);


        (window as any).electronAPI.onLoadSavedState((state: DashboardState | undefined) => {
            if (!state) {
                console.warn("No saved state found, initializing with default");
                setZoomLevel(1);
                setPosition({ x: 0, y: 0 });
                setStorageBoxes([
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
                return;
            }
            console.log("Loading saved state for Dashboard");
            console.log("Loaded state:", state);
            setZoomLevel(state.scale);
            setPosition(state.pan);
            if (state.boxes.length === 0) {
                console.warn("No boxes found in saved state, initializing with default box");
                setStorageBoxes([
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
                return;
            }
            setStorageBoxes(state.boxes.map(box => {
                let icon = <HardDrive className="h-6 w-6" />;
                if (box.cloudType === CloudType.GoogleDrive) {
                    icon = <FaGoogleDrive className="h-6 w-6" />;
                } else if (box.cloudType === CloudType.Dropbox) {
                    icon = <FaDropbox className="h-6 w-6" />;
                } else if (box.cloudType === CloudType.OneDrive) {
                    icon = <TbBrandOnedrive className="h-6 w-6" />;
                }
                return {
                    id: parseInt(box.id, 10),
                    title: box.title,
                    type: box.type,
                    position: box.position,
                    size: box.size,
                    zIndex: box.zIndex,
                    cloudType: box.cloudType as CloudType | undefined,
                    accountId: box.accountId,
                    icon: icon,
                };
            }));
        });

        // Cleanup on unmount
        return () => {
            // Assuming you have a way to remove the listener
            (window as any).electronAPI.removeRequestLayoutListener(layoutHandler);
            (window as any).electronAPI.removeLoadSavedStateListener();
        };
    }, [zoomLevel, position]); // Add dependencies that should trigger updates


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
                <TransferManager
                    transfers={transferQueue.transfers}
                    onCancelTransfer={handleCancelTransfer}
                    onCloseTransfer={handleCloseTransfer}
                    onRetryTransfer={handleRetryTransfer}
                    isHidden={action === "transfers"}
                    isTransferPanelOpen={action === "transfers"}
                />
                <ActionBar action={action} setAction={handleActionChange} toggleShowSideWindow={toggleShowSideWindow} toggleShowAgentWindow={toggleShowAgentWindow} />
                <BoxDragProvider>
                    <div className="relative flex flex-1">
                        <StorageSideWindow show={showStorageWindow} addStorage={addStorageBox} onAccountDeleted={closeStorageBoxesForAccount} />
                        <div className="relative flex flex-col flex-1">
                            <div className={`absolute inset-0 ${action === "settings" ? 'block' : 'hidden'}`}>
                                <SettingsPanel onAccountsCleared={handleAccountsCleared} />
                            </div>
                            <div className={`absolute inset-0 ${action === "transfers" ? 'block' : 'hidden'}`}>
                                <TransferDetailPanel 
                                    transfers={transferQueue.transfers}
                                    onCancelTransfer={handleCancelTransfer}
                                    onCloseTransfer={handleCloseTransfer}
                                    onRetryTransfer={handleRetryTransfer}
                                />
                            </div>
                            {canvasVwpSize.width > 0 && canvasVwpSize.height > 0 ? (
                                <CanvasContainer
                                    zoomLevel={zoomLevel}
                                    setZoomLevel={setZoomLevel}
                                    isPanMode={isPanMode}
                                    className={`absolute inset-0 ${action !== "settings" && action !== "transfers" ? 'block' : 'hidden'}`}
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
                                            tempDragDropTransfer={tempDragDropTransfer}
                                        />
                                    ))}
                                </CanvasContainer>
                            ) : (
                                <div className="flex-1 flex items-center justify-center">Loading canvas...</div>
                            )}     
                            {/* <AgentWindow show={showMcpTest} setShow={setShowMcpTest} /> */}
                            <AgentAction/>
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

export default Dashboard;
