import React, { useState, useRef, useCallback } from 'react';
import { CloudType } from '@Types/cloudType';
import { FileContent } from '@Types/fileSystem';
import { progressCallbackData, TransferItem, TransferQueueState } from '@Types/transfer';
import { StorageBoxData } from '@Types/box';
import { useTransferState } from '@/contexts/TransferStateContext';
import { v4 as uuidv4 } from 'uuid';
import { batch } from 'googleapis/build/src/apis/batch';
import path from 'path';

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
    createTransfer: (sourceStorageType: CloudType, sourceAccountId: string, targetStorageType: CloudType, targetAccountId: string, sourcePath: string, targetPath: string, keepOriginal: boolean, itemCount: number, fileList?: string[]) => TransferItem;
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
        transfers: [],
        nextId: 1
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
    const createTransfer = (sourceStorageType: CloudType, sourceAccountId: string, targetStorageType: CloudType, targetAccountId: string, sourcePath: string, targetPath: string, keepOriginal: boolean, itemCount: number, fileList?: string[]): TransferItem => {
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
            sourcePath,
            targetPath,
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
                await (window as any).fsApi.deleteItem(fileInfo.sourcePath);
            } else {
                // source from the cloud file system
                await (window as any).cloudFsApi.deleteItem(fileInfo.sourceCloudType, fileInfo.sourceAccountId, fileInfo.sourcePath);
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
                path.dirname(filePaths[0] || ''),
                targetPath || '',
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
                    
                    // Update status to show current file being processed
                    batchUpdateTransfer(transfer.id, {
                        currentItem: `${fileName}`,
                        status: "fetching",
                        progress: (processedFiles / totalFiles) * 100
                    });

                    let progressListener: any = null;
                    // for the case of folder transfer, we need to track the progress of each item within the folder
                    // if folder transfer includes at least one file transfer failure, it will be true
                    let includeFailure = false;
                    try {
                        // progressListener to track download/upload progress
                        const isLocalToLocal = transfer.sourceStorageType === CloudType.Local && transfer.targetStorageType === CloudType.Local;  // Local to Local show moving ui
                        const isClodutoCloud = transfer.sourceStorageType !== CloudType.Local && transfer.targetStorageType !== CloudType.Local;  // Cloud to Cloud show moving ui
                        const isLocaltoCloud = transfer.sourceStorageType === CloudType.Local && transfer.targetStorageType !== CloudType.Local; // Local to Cloud show uploading ui
                        const isCloudToLocal = transfer.sourceStorageType !== CloudType.Local && transfer.targetStorageType === CloudType.Local; // Cloud to local show downloading ui
        
                        progressListener = (window as any).transferApi.onTransferProgress((data: progressCallbackData) => {
                            const latestTransfer = getTransfer(transfer.id);
                            if (latestTransfer?.status === "cancelled") {
                                return; // Don't update progress if cancelled
                            }

                            console.log("Progress update for transfer:", latestTransfer, "data:", data);
                           
                            // not sure... need to change..
                            if (transfer && data.transferId == transfer.id) {
                                if (data.errorItemDirectory) {
                                    // the transfer includes a failure
                                    currentFailedFiles.push({ file: data.fileName, error: data.errorItemDirectory });
                                    includeFailure = true;
                                    console.error(`Error in transfer for file ${data.fileName}:`, data.errorItemDirectory);
                                }
                                if (data.isFetching) {
                                    batchUpdateTransfer(transfer.id, {
                                        currentItem: data.fileName,
                                        status: "fetching",
                                        isCurrentDirectory: data.isDirectory,
                                        cancelledMessage: data.errorItemDirectory || "",
                                        directoryName: data.isDirectory ? fileName : "unknown",
                                        progress: (processedFiles / totalFiles) * 100
                                    }); 
                                } else {
                                    // Calculate file specific progress within overall transfer progress
                                    const fileProgress = (data.transfered / data.total) * (100 / totalFiles);
                                    const overallProgress = (processedFiles / totalFiles) * 100 + fileProgress;
                                    
                                    // Update transfer progress
                                    if (isLocalToLocal || isClodutoCloud) {
                                        batchUpdateTransfer(transfer.id, {
                                            currentItem: data.fileName,
                                            directoryName: data.isDirectory ? fileName : "unknown",
                                            isCurrentDirectory: data.isDirectory,
                                            status: transfer.keepOriginal ? "copying" : "moving",
                                            cancelledMessage: data.errorItemDirectory || "",
                                            progress: Math.min(overallProgress, 100)
                                        })
                                    } else if (isLocaltoCloud){
                                        batchUpdateTransfer(transfer.id, {
                                            currentItem: data.fileName,
                                            directoryName: data.isDirectory ? fileName : "unknown",
                                            isCurrentDirectory: data.isDirectory,
                                            status: transfer.keepOriginal ? "copying" : "uploading",
                                            cancelledMessage: data.errorItemDirectory || "",
                                            progress: Math.min(overallProgress, 100)
                                        });
                                    } else if (isCloudToLocal) {
                                        batchUpdateTransfer(transfer.id, {
                                            currentItem: data.fileName,
                                            directoryName: data.isDirectory ? fileName : "unknown",
                                            isCurrentDirectory: data.isDirectory,
                                            status: transfer.keepOriginal ? "copying" : "downloading",
                                            cancelledMessage: data.errorItemDirectory || "",
                                            progress: Math.min(overallProgress, 100)
                                        });
                                    }; 
                                }
                            }
                        });
                            
                        await new Promise(resolve => setTimeout(resolve, 10));
                    
                        // Cases: 
                        // 1. Local to Cloud
                        // 2. Cloud to local
                        // 3. Cloud to Cloud
                        const copy = confirmation.keepOriginal;
                        const transferWithinSameAccount = sourceCloudType === targetCloudType && sourceAccountId === targetAccountId;
                        
                        // Prepare information for transfer
                        const transferInfo = {
                            transferId: transfer?.id,
                            fileName,
                            sourcePath: filePath,
                            sourceCloudType,
                            sourceAccountId,
                            targetCloudType,
                            targetAccountId,
                            targetPath,
                            copy
                        };

                        
                        await (window as any).transferApi.transferManager(transferInfo);
                    

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

                            // delete from the source if not keeping original and not including failure
                            // transfer within the same account will automatically delete the source file if move
                            if (!includeFailure && !confirmation.keepOriginal && !transferWithinSameAccount) {
                                console.warn(`Deleting source file ${fileName} after transfer`);
                                deleteFileFromSource({
                                    sourceCloudType,
                                    sourceAccountId,
                                    sourcePath: filePath
                                }, confirmation.keepOriginal).catch(err => {
                                    console.warn(`Failed to delete source file ${fileName}:`, err);
                                });
                            }

                            processedFiles++;
                            batchUpdateTransfer(transfer.id, {
                                completedFiles: [...currentCompletedFiles],
                                progress: (processedFiles / totalFiles) * 100,
                            });
                        }
                    } catch (err: any) {
                        console.log(`Error processing file ${fileName}:`, err);
                        const latestTransfer = getTransfer(transfer.id);
                        if (latestTransfer?.status === "cancelled") {
                            throw err;
                        }

                        if ((latestTransfer?.itemCount ?? 0) <= 1) {
                            throw err;
                        }

                        // Extract error message
                        const parts = err instanceof Error ? err.message.split(':') : ["Transfer failed"];
                        const errorMessage = parts[parts.length - 1].trim() + ". Continueing with next file...";
                        
                        // Add to failed files
                        currentFailedFiles.push({
                            file: fileName,
                            error: errorMessage
                        });

                        // Clean up progress listener for failed file
                        if (progressListener) {
                            (window as any).transferApi.removeTransferProgressListener(progressListener);
                        }

                        // Immediately update transfer with failed file info
                        batchUpdateTransfer(transfer.id, {
                            failedFiles: [...currentFailedFiles],
                            progress: (processedFiles / totalFiles) * 100, // Don't increment processedFiles for failed files
                            cancelledMessage: errorMessage,
                        });
                        
                        // Wait for 5 seconds before continuing to the next file
                        await cancellableWait(5000, transfer.id, getTransfer);
                        processedFiles++;
                        batchUpdateTransfer(transfer.id, {cancelledMessage: ""})
                        continue;
                    } 
                }

                // I understand that currentFailedFiles include any failed files under the directory item that is being transferred
                // The error field of currentFailedFiles will be the name of the file that failed to be transferred.
                if (currentFailedFiles.length > 0) {
                    console.error("Transfer completed with errors:", currentFailedFiles);
                    batchUpdateTransfer(transfer.id, {
                        status: "completed",
                        endTime: Date.now(),
                        cancelledMessage: `Failed to transfer: ${currentFailedFiles.map(f => f.error).join(', ')}`,
                        completedFiles: currentCompletedFiles,
                        failedFiles: currentFailedFiles
                    });
                } else {
                    // Success
                    batchUpdateTransfer(transfer.id, {
                        progress: 100,
                        status: "completed",
                        endTime: Date.now()
                    });
                }

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
                const parts = error instanceof Error ? error.message.split(':') : ["Transfer failed"];
                const errorMessage = parts[parts.length - 1].trim();
            
                const allFiles = filePaths.map(path => path.split('/').pop() || path);
                const failedFiles = allFiles
                    .filter(fileName => !currentCompletedFiles.includes(fileName))
                    .map(fileName => ({ file: fileName, error: errorMessage }));
                
                batchUpdateTransfer(transfer.id, {
                    status: "cancelled",
                    endTime: Date.now(),
                    cancelledMessage: errorMessage,
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

    const cancellableWait = async (ms: number, transferId: string, getTransfer: (id: string) => TransferItem | undefined) => {
        const interval = 100;
        let waited = 0;
        while (waited < ms) {
            await new Promise(resolve => setTimeout(resolve, interval));
            const latestTransfer = getTransfer(transferId);
            if (latestTransfer?.status === "cancelled") {
                throw new Error("Transfer cancelled by user");
            }
            waited += interval;
        }
    };

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
