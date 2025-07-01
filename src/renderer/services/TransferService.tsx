import React, { useState, useRef, useCallback } from 'react';
import { CloudType } from '@Types/cloudType';
import { FileContent } from '@Types/fileSystem';
import { TransferItem, TransferQueueState } from '@Types/transfer';
import { StorageBoxData } from '@Types/box';
import { useTransferState } from '@/contexts/TransferStateContext';
import { v4 as uuidv4 } from 'uuid';

interface TransferServiceProps {
    boxRefs: React.RefObject<Map<any, any>>;
    storageBoxesRef: React.RefObject<StorageBoxData[]>;
}

interface TransferServiceReturn {
    transferQueue: TransferQueueState;
    fileContentsCacheRef: React.RefObject<FileContent[]>;
    showUploadDialog: boolean;
    setShowUploadDialog: React.Dispatch<React.SetStateAction<boolean>>;
    uploadDialogResolve: ((value: { confirmed: boolean; keepOriginal: boolean }) => void) | null;
    setUploadDialogResolve: React.Dispatch<React.SetStateAction<((value: { confirmed: boolean; keepOriginal: boolean }) => void) | null>>;
    
    // Transfer management functions
    createTransfer: (sourceStorageType: CloudType, sourceAccountId: string, targetStorageType: CloudType, targetAccountId: string, keepOriginal: boolean, itemCount: number, fileList?: string[]) => TransferItem;
    updateTransfer: (transferId: string, updates: Partial<TransferItem>) => void;
    batchUpdateTransfer: (transferId: string, updates: Partial<TransferItem>) => void;
    removeTransfer: (transferId: string) => void;
    getTransfer: (transferId: string) => TransferItem | undefined;
    handleCancelTransfer: (transferId: string) => void;
    handleCloseTransfer: (transferId: string) => void;
    handleRetryTransfer: (transferId: string) => void;
    
    // Transfer operations
    tempPostFile: (parentPath: string, cloudType?: CloudType, accountId?: string, fileName?: string) => Promise<void>;
    tempGetFile: (filePaths: string[], cloudType?: CloudType, accountId?: string, showProgress?: boolean) => Promise<void>;
    handleBoxFileTransfer: (filePaths: string[], sourceCloudType?: CloudType, sourceAccountId?: string, targetPath?: string, targetCloudType?: CloudType, targetAccountId?: string) => Promise<void>;
    
    // Dialog functions
    showUploadConfirmation: () => Promise<{ confirmed: boolean; keepOriginal: boolean }>;
    handleUploadDialogConfirm: (keepOriginal: boolean) => void;
    handleUploadDialogCancel: () => void;
}

export const useTransferService = ({ boxRefs, storageBoxesRef }: TransferServiceProps): TransferServiceReturn => {
    // Get access to the transfer state context
    const { addTransferringFiles, removeTransferringFiles } = useTransferState();
    
    // Transfer queue state
    const [transferQueue, setTransferQueue] = useState<TransferQueueState>({
        transfers: [
            {
                id: 'test-transfer-1',
                itemCount: 3,
                currentItem: "file2.txt",
                progress: 33,
                status: "fetching",
                startTime: Date.now(),
                keepOriginal: false,
                sourceStorageType: CloudType.Local,
                sourceAccountId: "",
                targetStorageType: CloudType.GoogleDrive,
                targetAccountId: "test2@gmail.com",
                fileList: ["file143873428934287948327879437894789755483893584787345.txt", "file2.txt", "file3.txt"],
                completedFiles: ["file143873428934287948327879437894789755483893584787345.txt"],
                failedFiles: [],
            }, 
            {
                id: 'test-transfer-10',
                itemCount: 3,
                currentItem: "file2.txt",
                progress: 33,
                status: "uploading",
                startTime: Date.now(),
                keepOriginal: false,
                sourceStorageType: CloudType.Local,
                sourceAccountId: "",
                targetStorageType: CloudType.GoogleDrive,
                targetAccountId: "test2@gmail.com",
                fileList: ["file143873428934287948327879437894789755483893584787345.txt", "file2.txt", "file3.txt"],
                completedFiles: ["file143873428934287948327879437894789755483893584787345.txt", "file2.txt"],
            },
         {
                id: 'test-transfer-12',
                itemCount: 3,
                currentItem: "file2.txt",
                progress: 33,
                status: "downloading",
                startTime: Date.now(),
                keepOriginal: false,
                sourceStorageType: CloudType.Local,
                sourceAccountId: "",
                targetStorageType: CloudType.GoogleDrive,
                targetAccountId: "test2@gmail.com",
                fileList: ["file143873428934287948327879437894789755483893584787345.txt", "file2.txt", "file3.txt"],
                completedFiles: ["file143873428934287948327879437894789755483893584787345.txt", "file2.txt"],
            },
            {
                id: 'test-transfer-2',
                itemCount: 3,
                currentItem: "file2.txt",
                progress: 33,
                status: "cancelled",
                cancelledMessage: "Transfer cancelled by user",
                startTime: Date.now(),
                keepOriginal: false,
                sourceStorageType: CloudType.Local,
                sourceAccountId: "",
                targetStorageType: CloudType.GoogleDrive,
                targetAccountId: "test2@gmail.com",
                fileList: ["file143873428934287948327879437894789755483893584787345.txt", "file2.txt", "file3.txt"],
                completedFiles: ["file143873428934287948327879437894789755483893584787345.txt"],
                failedFiles: [{ file: "file2.txt", error: "Transfer cancelled by user" }, { file: "file3.txt", error: "Transfer cancelled by user" }],
            },
            {
                id: 'test-transfer-3',
                itemCount: 3,
                currentItem: "file2.txt",
                progress: 33,
                status: "completed",
                startTime: Date.now(),
                keepOriginal: false,
                sourceStorageType: CloudType.Local,
                sourceAccountId: "",
                targetStorageType: CloudType.GoogleDrive,
                targetAccountId: "test2@gmail.com",
                fileList: ["file143873428934287948327879437894789755483893584787345.txt", "file2.txt", "file3.txt"],
                completedFiles: ["file143873428934287948327879437894789755483893584787345.txt", "file2.txt"],
            }
        ],
        nextId: 2
    });

    // Add a ref to store current transfer queue state
    const transferQueueRef = useRef<TransferQueueState>(transferQueue);

    // Update ref whenever state changes
    React.useEffect(() => {
        transferQueueRef.current = transferQueue;
    }, [transferQueue]);


    const [showUploadDialog, setShowUploadDialog] = useState(false);
    const [uploadDialogResolve, setUploadDialogResolve] = useState<((value: { confirmed: boolean; keepOriginal: boolean }) => void) | null>(null);

    const fileContentsCacheRef = useRef<FileContent[]>([]);
    const filesBeingTransferred = useRef<Set<string>>(new Set()); // Track files currently being transferred

    // Helper function to refresh both source and target storage boxes
    const refreshSourceAndTargetBoxes = (fileContentsCache: FileContent[], targetCloudType?: CloudType, targetAccountId?: string) => {
        // Refresh source boxes (where files came from)
        fileContentsCache.forEach(fileContent => {
            storageBoxesRef.current.forEach((box) => {
                if (box.accountId === fileContent.sourceAccountId && box.cloudType === fileContent.sourceCloudType ||
                    (!box.accountId && !fileContent.sourceAccountId && !box.cloudType && !fileContent.sourceCloudType) // Local file system
                ) {
                    const ref = boxRefs.current.get(box.id);
                    ref.current?.callDoRefresh?.(true); // Pass true for silent refresh
                }
            });
        });

        // Refresh target boxes (where files went to)
        storageBoxesRef.current.forEach((box) => {
            if (box.accountId === targetAccountId && box.cloudType === targetCloudType ||
                (!box.accountId && !targetAccountId && !box.cloudType && !targetCloudType) // Local file system
            ) {
                const ref = boxRefs.current.get(box.id);
                ref.current?.callDoRefresh?.(true); // Pass true for silent refresh
            }
        });
    };

    // Transfer queue management functions
    const createTransfer = (sourceStorageType: CloudType, sourceAccountId: string, targetStorageType: CloudType, targetAccountId: string, keepOriginal: boolean, itemCount: number, fileList?: string[]): TransferItem => {
        // Use uuid to have unique IDs
        const transferId =  uuidv4();
        const newTransfer: TransferItem = {
            id: transferId,
            itemCount,
            progress: 0,
            status: "fetching", 
            startTime: Date.now(),
            keepOriginal,
            sourceStorageType,
            sourceAccountId,
            targetStorageType,
            targetAccountId,
            fileList: fileList || [],
            completedFiles: [],
            failedFiles: [],
        };

        setTransferQueue(prev => ({
            transfers: [...prev.transfers, newTransfer],
            nextId: prev.nextId + 1
        }));

        return newTransfer;
    };

    // Batch update function 
    const batchUpdateTransfer = useCallback((transferId: string, updates: Partial<TransferItem>) => {
        setTransferQueue(prev => {
            const transferIndex = prev.transfers.findIndex(t => t.id === transferId);
            if (transferIndex === -1) return prev;
            
            const updatedTransfers = [...prev.transfers];
            const currentTransfer = updatedTransfers[transferIndex];
            
            // Create the updated transfer 
            updatedTransfers[transferIndex] = {
                ...currentTransfer,
                ...updates,
                completedFiles: updates.completedFiles ?? currentTransfer.completedFiles,
                failedFiles: updates.failedFiles ?? currentTransfer.failedFiles,
            };
            
            return {
                ...prev,
                transfers: updatedTransfers
            };
        });

        // Clean up transfer state when transfer completes or fails
        if (updates.status == "completed") {
            setTimeout(() => {
                removeTransferringFiles(transferId);
            }, 500);
        }
    }, [removeTransferringFiles]);

    const updateTransfer = useCallback((transferId: string, updates: Partial<TransferItem>) => {
        setTransferQueue(prev => {
            const updatedTransfers = prev.transfers.map(transfer => {
                if (transfer.id === transferId) {
                    const updatedTransfer = { ...transfer, ...updates };
                    
                    // Ensure completedFiles array is merged
                    if (updates.completedFiles && Array.isArray(updates.completedFiles)) {
                        updatedTransfer.completedFiles = [...updates.completedFiles];
                    }
                    
                    // Ensure failedFiles array is merged
                    if (updates.failedFiles && Array.isArray(updates.failedFiles)) {
                        updatedTransfer.failedFiles = [...updates.failedFiles];
                    }
                    
                    return updatedTransfer;
                }
                return transfer;
            });
            
            return {
                ...prev,
                transfers: updatedTransfers
            };
        });

        // Clean up transfer state when transfer completes or fails
        if (updates.status == "completed" || updates.status == "cancelled") {
            setTimeout(() => {
                removeTransferringFiles(transferId);
            }, 500); 
        }
    }, [removeTransferringFiles]);

    const removeTransfer = (transferId: string) => {
        // Remove from transfer state when transfer is removed
        removeTransferringFiles(transferId);
        
        setTransferQueue(prev => ({
            ...prev,
            transfers: prev.transfers.filter(transfer => transfer.id !== transferId)
        }));
    };

    const getTransfer = (transferId: string): TransferItem | undefined => {
        return transferQueueRef.current.transfers.find(transfer => transfer.id === transferId);
    };

    const handleCancelTransfer = async (transferId: string) => {
        try {
            const transfer = getTransfer(transferId);
            if (!transfer) {
                console.warn("Transfer not found for cancellation:", transferId);
                return;
            }

            console.log("Cancelling transfer:", transferId);

            // Cancel the transfer in the main process
            await (window as any).transferApi.cancelTransfer(transferId);

            const completedFiles = transfer.completedFiles || [];
            const allFiles = transfer.fileList || [];
            const failedFiles = allFiles
                .filter(fileName => !completedFiles.includes(fileName))
                .map(fileName => ({ file: fileName, error: "Transfer cancelled by user" }));
            
            // Update to final cancelled state
            batchUpdateTransfer(transferId, { 
                status: "cancelled",
                cancelledMessage: "Transfer cancelled by user",
                endTime: Date.now(),
                completedFiles: transfer.completedFiles || [],
                failedFiles: [...(transfer.failedFiles || []), ...failedFiles]
            });

            removeTransferringFiles(transferId);
        } catch (error) {
            const transfer = getTransfer(transferId);
            if (transfer) {
                const completedFiles = transfer.completedFiles || [];
                const allFiles = transfer.fileList || [];
                const failedFiles = allFiles
                    .filter(fileName => !completedFiles.includes(fileName))
                    .map(fileName => ({ file: fileName, error: "Error cancelling transfer" }));
                batchUpdateTransfer(transferId, {
                    status: "cancelled",
                    cancelledMessage: "Error cancelling. Please try again",
                    endTime: Date.now(),
                    completedFiles: completedFiles,
                    failedFiles: [...(transfer.failedFiles || []), ...failedFiles]
                });
            }
        }
    };

    const handleCloseTransfer = (transferId: string) => {
        removeTransfer(transferId);
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
    const deleteFileFromSource = async (fileInfo: any, keepOriginal: boolean = false) => {
        if (keepOriginal) {
            return; // No need to log when keeping original
        }
        console.warn("Deleting file from source:", fileInfo);

        const fileKey = `${fileInfo.sourceCloudType || 'local'}:${fileInfo.sourceAccountId || 'local'}:${fileInfo.sourcePath}`;
        
        // Check if this file is already being deleted
        if (filesBeingTransferred.current.has(fileKey)) {
            return; // File already being deleted by another transfer
        }

        // Mark file as being deleted
        filesBeingTransferred.current.add(fileKey);

        try {
            // source from the local file system
            if (!fileInfo.sourceCloudType || !fileInfo.sourceAccountId) {
                await (window as any).fsApi.deleteFile(fileInfo.sourcePath);
            } else {
                // source from the cloud file system
                await (window as any).cloudFsApi.deleteFile(fileInfo.sourceCloudType, fileInfo.sourceAccountId, fileInfo.sourcePath);
            }
            
        } catch (error: any) {
            // Handle deletion conflicts file might already be deleted by another transfer
            if (error.message?.includes('not found') || error.message?.includes('does not exist') || error.message?.includes('ENOENT')) {
                // File already deleted by another transfer - no need to refresh immediately
            } else {
                throw error;
            }
        } finally {
            // Always remove from tracking set
            filesBeingTransferred.current.delete(fileKey);
        }
    }

    const tempPostFile = async (parentPath: string, cloudType?: CloudType, accountId?: string, fileName?: string) => {
    }

    const tempGetFile = async (filePaths: string[], cloudType?: CloudType, accountId?: string, showProgress: boolean = false) => {
    }

    // New function to handle file/dir trasnfer workflow
    const handleBoxFileTransfer = async (filePaths: string[], sourceCloudType?: CloudType, sourceAccountId?: string, targetPath?: string, targetCloudType?: CloudType, targetAccountId?: string) => {
        let transfer: TransferItem;
        console.log('Starting box transfer transfer with paths:', filePaths, 'Source:', sourceCloudType, sourceAccountId, 'Target:', targetCloudType, targetAccountId);
        try {
            // Get user confirmation first (before downloading)
            const confirmation = await showUploadConfirmation();
            if (!confirmation.confirmed) {
                return; // User cancelled - don't create transfer 
            }


            // Create single transfer that shows the complete operation
            transfer = createTransfer(
                sourceCloudType || CloudType.Local,
                sourceAccountId || '',
                targetCloudType || CloudType.Local,
                targetAccountId || '',
                confirmation.keepOriginal,
                filePaths.length,
                filePaths.map(path => path.split('/').pop() || path) 
            );

            // Mark files as being transferred in the UI
            const transferringFiles = filePaths.map(filePath => ({
                path: filePath,
                name: filePath.split('/').pop() || filePath,
                sourceCloudType,
                sourceAccountId,
                targetCloudType,
                targetAccountId,
                transferId: transfer?.id || '',
                isMove: !confirmation.keepOriginal
            }));

            if (transfer) {
                addTransferringFiles(transferringFiles);
            }

            const totalFiles = filePaths.length;
            let processedFiles = 0;
            let currentCompletedFiles: string[] = [];
            let currentFailedFiles: { file: string; error: string }[] = [];

            try {
                // Process each file: download then upload (but only show upload progress)
                for (let i = 0; i < filePaths.length; i++) {
                    const filePath = filePaths[i];
                    
                    // if (transfer.abortController.signal.aborted) {
                    //     console.
                    //     throw new Error("Transfer cancelled by user");
                    // }

                    const fileName = filePath.split('/').pop() || filePath;
                    const fileIndex = i + 1;
                    
                    // Update status to show current file being processed
                    batchUpdateTransfer(transfer.id, {
                        currentItem: `${fileName}`,
                        status: "fetching",
                        progress: (processedFiles / totalFiles) * 100
                    });

                    try {
                        // progressListener to track download/upload progress
                        let progressListener: any = null;
                        const isLocalToLocal = transfer.sourceStorageType === CloudType.Local && transfer.targetStorageType === CloudType.Local;  // Local to Local show moving ui
                        const isClodutoCloud = transfer.sourceStorageType !== CloudType.Local && transfer.targetStorageType !== CloudType.Local;  // Cloud to Cloud show moving ui
                        const isLocaltoCloud = transfer.sourceStorageType === CloudType.Local && transfer.targetStorageType !== CloudType.Local; // Local to Cloud show uploading ui
                        const isCloudToLocal = transfer.sourceStorageType !== CloudType.Local && transfer.targetStorageType === CloudType.Local; // Cloud to local show downloading ui
        
                        progressListener = (window as any).transferApi.onTransferProgress((data: { fileName: string; transfered: number; total: number }) => {
                            const latestTransfer = getTransfer(transfer.id);
                            if (latestTransfer?.status === "cancelled") {
                                return; // Don't update progress if cancelled
                            }
                           
                            if (data.fileName === fileName && transfer) {
                                // Calculate file specific progress within overall transfer progress
                                const fileProgress = (data.transfered / data.total) * (100 / totalFiles);
                                const overallProgress = (processedFiles / totalFiles) * 100 + fileProgress;
                                // Update transfer progress
                                if (isLocalToLocal || isClodutoCloud) {
                                    batchUpdateTransfer(transfer.id, {
                                        status: transfer.keepOriginal ? "copying" : "moving",
                                        progress: Math.min(overallProgress, 100)
                                    })
                                } else if (isLocaltoCloud){
                                    batchUpdateTransfer(transfer.id, {
                                        status: transfer.keepOriginal ? "copying" : "uploading",
                                        progress: Math.min(overallProgress, 100)
                                    });
                                } else if (isCloudToLocal) {
                                    batchUpdateTransfer(transfer.id, {
                                        status: transfer.keepOriginal ? "copying" : "downloading",
                                        progress: Math.min(overallProgress, 100)
                                    });
                                }; 
                            }
                        });
                            
                        await new Promise(resolve => setTimeout(resolve, 10));
                        
                        
                        try {
                            // Cases: 
                            // 1. Local to Cloud
                            // 2. Cloud to local
                            // 3. Cloud to Cloud
                            
                            // Prepare information for transfer
                            const transferInfo = {
                                fileName,
                                sourcePath: filePath,
                                sourceCloudType,
                                sourceAccountId,
                                targetCloudType,
                                targetAccountId,
                                targetPath,
                                transferId: transfer?.id,
                            };

                            
                            await (window as any).transferApi.transferManager(transferInfo);
                        } finally {
                            const latestTransfer = getTransfer(transfer.id);
                            console.log("Latest transfer:", latestTransfer, "for file:", fileName);
                            // Clean up progress listener
                            if (progressListener) {
                                (window as any).transferApi.removeTransferProgressListener(progressListener);
                            }
                            if (latestTransfer?.status !== "cancelled") { // 
                                console.warn(`File ${fileName} processed successfully`);
                                // Track successful file completion
                                currentCompletedFiles.push(fileName);

                                deleteFileFromSource({
                                    sourceCloudType,
                                    sourceAccountId,
                                    sourcePath: filePath
                                }, confirmation.keepOriginal).catch(err => {
                                    console.warn(`Failed to delete source file ${fileName}:`, err);
                                });

                                processedFiles++;
                                batchUpdateTransfer(transfer.id, {
                                    completedFiles: [...currentCompletedFiles],
                                    progress: (processedFiles / totalFiles) * 100,
                                });
                            }
                        }
                    } catch (err: any) {
                        // Track failed file
                        const errorMessage = err.message || 'Transfer cancelled';
                        currentFailedFiles.push({ file: fileName, error: errorMessage });
                        
                        batchUpdateTransfer(transfer.id, {
                            failedFiles: [...currentFailedFiles]
                        });
                        console.error("transfer cancelled 1");
                        
                        // Check if transfer was cancelled - if so, mark remaining files as failed and break
                        const latestTransfer = getTransfer(transfer.id);
                        if (latestTransfer?.status !== "cancelled") {
                            // Mark all remaining files as failed
                            const remainingFiles = filePaths.slice(i + 1);
                            const remainingFailedFiles = remainingFiles.map(path => ({
                                file: path.split('/').pop() || path,
                                error: "Transfer cancelled by user"
                            }));
                            
                            currentFailedFiles.push(...remainingFailedFiles);
                            break; // Exit the loop
                        }
                        return;
                    } 
                }

                // Success
                batchUpdateTransfer(transfer.id, {
                    progress: 100,
                    status: "completed",
                    endTime: Date.now()
                });

                setTimeout(() => {
                    // Create fake file content cache for refresh function
                    const fakeFileContents = filePaths.map(filePath => ({
                        path: filePath,
                        sourceCloudType,
                        sourceAccountId,
                    })) as FileContent[];
                    refreshSourceAndTargetBoxes(fakeFileContents, targetCloudType, targetAccountId);
                }, 100);

            } catch (error) {
                console.error("transfer cancelled 2");
                const errorMessage = error instanceof Error ? error.message : "Transfer failed";
            
                const allFiles = filePaths.map(path => path.split('/').pop() || path);
                const failedFiles = allFiles
                    .filter(fileName => !currentCompletedFiles.includes(fileName))
                    .map(fileName => ({ file: fileName, error: errorMessage }));
                
                batchUpdateTransfer(transfer.id, {
                    status: "cancelled",
                    cancelledMessage: errorMessage,
                    endTime: Date.now(),
                    completedFiles: currentCompletedFiles,
                    failedFiles: [...currentFailedFiles, ...failedFiles]
                });

                removeTransferringFiles(transfer.id);

                setTimeout(() => {
                    const fakeFileContents = filePaths.map(filePath => ({
                        path: filePath,
                        sourceCloudType,
                        sourceAccountId,
                    })) as FileContent[];
                    refreshSourceAndTargetBoxes(fakeFileContents, targetCloudType, targetAccountId);
                }, 100);
            }
        } catch (error) {
            // This catches errors before transfer creation (like user cancellation)
        }
    }

    const handleRetryTransfer = useCallback((transferId: string) => {
        const transfer = getTransfer(transferId);
        if (!transfer) return;

        // Reset transfer state for retry
        batchUpdateTransfer(transferId, {
            status: "fetching",
            startTime: Date.now(),
        });

        try {
            //TODO: Implement retry logic based on transfer type
            // For now, we just reset the state - the actual retry implementation
            console.log(`Retry functionality not yet implemented for transfer ${transferId}`);
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Retry failed";
            batchUpdateTransfer(transfer.id, {
                status: "cancelled",
                cancelledMessage: errorMessage,
                endTime: Date.now(),
            });
        }
    }, []);

    return {
        transferQueue,
        fileContentsCacheRef,
        showUploadDialog,
        setShowUploadDialog,
        uploadDialogResolve,
        setUploadDialogResolve,
        
        // Transfer management functions
        createTransfer,
        updateTransfer,
        batchUpdateTransfer,
        removeTransfer,
        getTransfer,
        handleCancelTransfer,
        handleCloseTransfer,
        handleRetryTransfer,
        
        // Transfer operations
        tempPostFile,
        tempGetFile,
        handleBoxFileTransfer,
        
        // Dialog functions
        showUploadConfirmation,
        handleUploadDialogConfirm,
        handleUploadDialogCancel,
    };
};
