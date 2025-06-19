import React, { useState, useRef, useCallback } from 'react';
import { Buffer } from 'buffer';
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
    isContentLoading: React.RefObject<boolean>;
    showUploadDialog: boolean;
    setShowUploadDialog: React.Dispatch<React.SetStateAction<boolean>>;
    uploadDialogResolve: ((value: { confirmed: boolean; keepOriginal: boolean }) => void) | null;
    setUploadDialogResolve: React.Dispatch<React.SetStateAction<((value: { confirmed: boolean; keepOriginal: boolean }) => void) | null>>;
    
    // Transfer management functions
    createTransfer: (sourceDescription: string, targetDescription: string, keepOriginal: boolean, itemCount: number, fileList?: string[]) => TransferItem;
    updateTransfer: (transferId: string, updates: Partial<TransferItem>) => void;
    removeTransfer: (transferId: string) => void;
    getTransfer: (transferId: string) => TransferItem | undefined;
    handleCancelTransfer: (transferId: string) => void;
    handleCloseTransfer: (transferId: string) => void;
    handleRetryTransfer: (transferId: string) => void;
    
    // Transfer operations
    tempPostFile: (parentPath: string, cloudType?: CloudType, accountId?: string) => Promise<void>;
    tempGetFile: (filePaths: string[], cloudType?: CloudType, accountId?: string, showProgress?: boolean) => Promise<void>;
    tempDragDropTransfer: (filePaths: string[], sourceCloudType?: CloudType, sourceAccountId?: string, targetPath?: string, targetCloudType?: CloudType, targetAccountId?: string) => Promise<void>;
    
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
    
    const [showUploadDialog, setShowUploadDialog] = useState(false);
    const [uploadDialogResolve, setUploadDialogResolve] = useState<((value: { confirmed: boolean; keepOriginal: boolean }) => void) | null>(null);

    const isContentLoading = useRef(false);
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
    const createTransfer = (sourceDescription: string, targetDescription: string, keepOriginal: boolean, itemCount: number, fileList?: string[]): TransferItem => {
        // Use uuid to have unique IDs
        const transferId =  uuidv4();
        const newTransfer: TransferItem = {
            id: transferId,
            itemCount,
            currentItem: "Preparing transfer...",
            progress: 0,
            error: null,
            isCompleted: false,
            startTime: Date.now(),
            keepOriginal,
            sourceDescription,
            targetDescription,
            abortController: new AbortController(),
            isCancelling: false,
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

    const updateTransfer = (transferId: string, updates: Partial<TransferItem>) => {
        setTransferQueue(prev => ({
            ...prev,
            transfers: prev.transfers.map(transfer =>
                transfer.id === transferId ? { ...transfer, ...updates } : transfer
            )
        }));

        // Clean up transfer state when transfer completes or fails
        if (updates.isCompleted || updates.error) {
            setTimeout(() => {
                removeTransferringFiles(transferId);
            }, 500); // Small delay to ensure UI updates
        }
    };

    const removeTransfer = (transferId: string) => {
        // Remove from transfer state when transfer is removed
        removeTransferringFiles(transferId);
        
        setTransferQueue(prev => ({
            ...prev,
            transfers: prev.transfers.filter(transfer => transfer.id !== transferId)
        }));
    };

    const getTransfer = (transferId: string): TransferItem | undefined => {
        return transferQueue.transfers.find(transfer => transfer.id === transferId);
    };

    const handleCancelTransfer = (transferId: string) => {
        try {
            const transfer = getTransfer(transferId);
            if (transfer && !transfer.isCancelling) {
                updateTransfer(transferId, { isCancelling: true });
                transfer.abortController.abort();
                
                // Update the transfer to show it was cancelled
                setTimeout(() => {
                    updateTransfer(transferId, {
                        error: "Transfer cancelled by user",
                        isCancelling: false
                    });
                }, 100);
            }
        } catch (error) {
            const transfer = getTransfer(transferId);
            if (transfer) {
                updateTransfer(transferId, {
                    error: "Transfer cancelled",
                    isCancelling: false
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
    const deleteFileFromSource = async (fileContentCache: FileContent, keepOriginal: boolean = false) => {
        if (keepOriginal) {
            return; // No need to log when keeping original
        }

        const fileKey = `${fileContentCache.sourceCloudType || 'local'}:${fileContentCache.sourceAccountId || 'local'}:${fileContentCache.path}`;
        
        // Check if this file is already being deleted
        if (filesBeingTransferred.current.has(fileKey)) {
            return; // File already being deleted by another transfer
        }

        // Mark file as being deleted
        filesBeingTransferred.current.add(fileKey);

        try {
            // source from the local file system
            if (!fileContentCache.sourceCloudType || !fileContentCache.sourceAccountId) {
                await (window as any).fsApi.deleteFile(fileContentCache.path);
            } else {
                // source from the cloud file system
                await (window as any).cloudFsApi.deleteFile(fileContentCache.sourceCloudType, fileContentCache.sourceAccountId, fileContentCache.path);
            }
            
            // No longer refresh immediately - wait for transfer completion to refresh
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

    const tempPostFile = async (parentPath: string, cloudType?: CloudType, accountId?: string) => {
        let transfer: TransferItem | null = null;
        
        try {
            // Wait for download to complete if still in progress
            while (isContentLoading.current) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            const fileContentsCache = [...fileContentsCacheRef.current];
            fileContentsCacheRef.current = []; 
            
            if (!fileContentsCache?.length) {
                throw new Error("No file content to upload");
            }

            // Wait for user confirmation with the new dialog
            const confirmation = await showUploadConfirmation();
            if (!confirmation.confirmed) {
                return; // User cancelled - don't create transfer or throw error
            }

            // Create descriptions for the transfer
            const sourceDescription = fileContentsCache[0]?.sourceCloudType 
                ? `${fileContentsCache[0].sourceCloudType} Cloud`
                : "Local Storage";
            const targetDescription = cloudType 
                ? `${cloudType} Cloud`
                : "Local Storage";

            // Create new transfer
            transfer = createTransfer(
                sourceDescription,
                targetDescription,
                confirmation.keepOriginal,
                fileContentsCache.length,
                fileContentsCache.map(fc => fc.name) // Pass file names as the file list
            );

            // Mark files as being transferred in the UI
            const transferringFiles = fileContentsCache.map(fileContent => ({
                path: fileContent.path,
                name: fileContent.name,
                sourceCloudType: fileContent.sourceCloudType,
                sourceAccountId: fileContent.sourceAccountId,
                targetCloudType: cloudType,
                targetAccountId: accountId,
                transferId: transfer?.id || '',
                isMove: !confirmation.keepOriginal
            }));
            if (transfer) {
                addTransferringFiles(transferringFiles);
            }

            const totalFiles = fileContentsCache.length;
            let completedFiles = 0;
            const progressRange = 100;

            try {
                // Upload files based on destination type
                if (!cloudType || !accountId) {
                    // Local file system uploads
                    for (const fileContent of fileContentsCache) {
                        if (transfer.abortController.signal.aborted) {
                            throw new Error("Transfer cancelled by user");
                        }

                        updateTransfer(transfer.id, {
                            currentItem: `${confirmation.keepOriginal ? 'Copying' : 'Moving'} ${fileContent.name}`
                        });
                        
                        try {
                            // Ensure content is a Buffer
                            const contentBuffer = Buffer.isBuffer(fileContent.content) 
                                ? fileContent.content 
                                : Buffer.from(fileContent.content || []);
                                
                            await (window as any).fsApi.postFile(
                                fileContent.name,
                                parentPath,
                                contentBuffer
                            );
                            
                            // Track successful file completion
                            updateTransfer(transfer.id, {
                                completedFiles: [...(getTransfer(transfer.id)?.completedFiles || []), fileContent.name]
                            });
                            
                            // Try to delete from source, but don't fail the transfer if deletion fails
                            try {
                                await deleteFileFromSource(fileContent, confirmation.keepOriginal);
                            } catch (deleteError: any) {
                                // Continue with the transfer - the file was uploaded successfully
                            }
                            
                            completedFiles++;
                            updateTransfer(transfer.id, {
                                progress: (completedFiles / totalFiles) * progressRange
                            });
                        } catch (err) {
                            // Track failed file
                            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
                            updateTransfer(transfer.id, {
                                failedFiles: [...(getTransfer(transfer.id)?.failedFiles || []), { file: fileContent.name, error: errorMessage }]
                            });
                            throw new Error(`Failed to upload ${fileContent.name}: ${errorMessage}`);
                        }
                    }
                } else {
                    // Cloud file system uploads
                    for (const fileContent of fileContentsCache) {
                        if (transfer.abortController.signal.aborted) {
                            throw new Error("Transfer cancelled by user");
                        }

                        updateTransfer(transfer.id, {
                            currentItem: `${confirmation.keepOriginal ? 'Copying' : 'Moving'} ${fileContent.name}`
                        });
                        
                        try {
                            // Ensure content is a Buffer
                            const contentBuffer = Buffer.isBuffer(fileContent.content) 
                                ? fileContent.content 
                                : Buffer.from(fileContent.content || []);
                                
                            await (window as any).cloudFsApi.postFile(
                                cloudType,
                                accountId,
                                fileContent.name,
                                parentPath,
                                contentBuffer
                            );
                            
                            // Track successful file completion
                            updateTransfer(transfer.id, {
                                completedFiles: [...(getTransfer(transfer.id)?.completedFiles || []), fileContent.name]
                            });
                            
                            // Try to delete from source, but don't fail the transfer if deletion fails
                            try {
                                await deleteFileFromSource(fileContent, confirmation.keepOriginal);
                            } catch (deleteError: any) {
                                // Continue with the transfer - the file was uploaded successfully
                            }
                            
                            completedFiles++;
                            updateTransfer(transfer.id, {
                                progress: (completedFiles / totalFiles) * progressRange
                            });
                        } catch (err) {
                            // Track failed file
                            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
                            updateTransfer(transfer.id, {
                                failedFiles: [...(getTransfer(transfer.id)?.failedFiles || []), { file: fileContent.name, error: errorMessage }]
                            });
                            throw new Error(`Failed to upload ${fileContent.name}: ${errorMessage}`);
                        }
                    }
                }

                // Success
                updateTransfer(transfer.id, {
                    isCompleted: true,
                    progress: 100,
                    endTime: Date.now()
                });

                // Refresh UI after successful transfer - delay to ensure all files are processed
                setTimeout(() => {
                    refreshSourceAndTargetBoxes(fileContentsCache, cloudType, accountId);
                }, 100);

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Upload failed";
                
                const displayError = errorMessage.includes("cancelled") 
                    ? "Transfer cancelled" 
                    : errorMessage;
                
                updateTransfer(transfer.id, {
                    error: displayError,
                    isCancelling: false
                });
                
                // Also refresh UI on error to remove transferring state
                setTimeout(() => {
                    refreshSourceAndTargetBoxes(fileContentsCache, cloudType, accountId);
                }, 100);
                
                // Don't throw the error - just update the transfer state
            }

        } catch (error) {
            // This catches errors before transfer creation (like user cancellation)
            if (error instanceof Error && !error.message.includes("cancelled")) {
                // For unexpected errors before transfer creation, create a failed transfer
                if (!transfer) {
                    const errorTransfer = createTransfer(
                        "Unknown Source",
                        "Unknown Target", 
                        false,
                        0,
                        []
                    );
                    updateTransfer(errorTransfer.id, {
                        error: error.message || "Transfer preparation failed",
                        isCancelling: false
                    });
                }
            }
        }
    }

    const tempGetFile = async (filePaths: string[], cloudType?: CloudType, accountId?: string, showProgress: boolean = false) => {
        let transfer: TransferItem | null = null;
        
        try {
            isContentLoading.current = true; 
            
            // Reset file cache
            fileContentsCacheRef.current = [];
            
            // Show progress if requested
            if (showProgress) {
                const sourceDescription = cloudType 
                    ? `${cloudType} Cloud`
                    : "Local Storage";
                    
                transfer = createTransfer(
                    sourceDescription,
                    "Preparing...",
                    false, // This is just downloading
                    filePaths.length,
                    filePaths.map(path => path.split('/').pop() || path) // Extract file names from paths
                );
                
                updateTransfer(transfer.id, {
                    currentItem: "Downloading files..."
                });
            }
            
            const totalFiles = filePaths.length;
            let downloadedFiles = 0;
            
            if (!cloudType || !accountId) {
                // local file system
                for (const filePath of filePaths) {
                    try {
                        const fileName = filePath.split('/').pop() || filePath;
                        
                        if (transfer) {
                            updateTransfer(transfer.id, {
                                currentItem: `Downloading ${fileName}`,
                                progress: (downloadedFiles / totalFiles) * 100
                            });
                        }
                        
                        const fileContent: FileContent = await (window as any).fsApi.getFile(filePath);
                        fileContentsCacheRef.current.push(fileContent); // Update the ref with the new file content
                        
                        downloadedFiles++;
                        
                        if (transfer) {
                            updateTransfer(transfer.id, {
                                progress: (downloadedFiles / totalFiles) * 100
                            });
                        }
                    } catch (err: any) {
                        if (transfer) {
                            updateTransfer(transfer.id, {
                                error: `Failed to read ${filePath}: ${err.message || 'Unknown error'}`,
                                isCancelling: false
                            });
                        }
                        throw new Error(`Failed to read ${filePath}: ${err.message || 'Unknown error'}`);
                    }
                }
            } else {
                for (const filePath of filePaths) {
                    try {
                        const fileName = filePath.split('/').pop() || filePath;
                        
                        if (transfer) {
                            updateTransfer(transfer.id, {
                                currentItem: `Downloading ${fileName}`,
                                progress: (downloadedFiles / totalFiles) * 100
                            });
                        }
                        
                        const fileContent: FileContent = await (window as any).cloudFsApi.getFile(cloudType, accountId, filePath);
                        fileContentsCacheRef.current.push(fileContent); // Update the ref with the new file content
                        
                        downloadedFiles++;
                        
                        if (transfer) {
                            updateTransfer(transfer.id, {
                                progress: (downloadedFiles / totalFiles) * 100
                            });
                        }
                    } catch (err: any) {
                        if (transfer) {
                            updateTransfer(transfer.id, {
                                error: `Failed to download ${filePath}: ${err.message || 'Unknown error'}`,
                                isCancelling: false
                            });
                        }
                        throw new Error(`Failed to download ${filePath}: ${err.message || 'Unknown error'}`);
                    }
                }
            }
            
            if (transfer) {
                updateTransfer(transfer.id, {
                    isCompleted: true,
                    progress: 100,
                    currentItem: `Downloaded ${totalFiles} file${totalFiles > 1 ? 's' : ''}`,
                    endTime: Date.now()
                });
                
                // Auto-remove download transfer after 2 seconds
                setTimeout(() => {
                    handleCloseTransfer(transfer!.id);
                }, 2000);
            }
            
        } catch (error: any) {
            throw error;
        } finally {
            isContentLoading.current = false;
        }
    }

    // New function for drag and drop workflow with confirmation first
    const tempDragDropTransfer = async (filePaths: string[], sourceCloudType?: CloudType, sourceAccountId?: string, targetPath?: string, targetCloudType?: CloudType, targetAccountId?: string) => {
        let transfer: TransferItem | null = null;
        
        try {
            // Get user confirmation first (before downloading)
            const confirmation = await showUploadConfirmation();
            if (!confirmation.confirmed) {
                return; // User cancelled - don't create transfer or throw error
            }

            // Create descriptions for the transfer - show source and destination
            const sourceDescription = sourceCloudType 
                ? `${sourceCloudType} Cloud`
                : "Local Storage";
            const targetDescription = targetCloudType 
                ? `${targetCloudType} Cloud`
                : "Local Storage";

            // Create single transfer that shows the complete operation
            transfer = createTransfer(
                sourceDescription,
                targetDescription,
                confirmation.keepOriginal,
                filePaths.length,
                filePaths.map(path => path.split('/').pop() || path) // Extract file names from paths
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

            try {
                // Process each file: download then upload (but only show upload progress)
                for (const filePath of filePaths) {
                    if (transfer.abortController.signal.aborted) {
                        throw new Error("Transfer cancelled by user");
                    }

                    const fileName = filePath.split('/').pop() || filePath;
                    
                    // Update status to show current file being processed
                    updateTransfer(transfer.id, {
                        currentItem: `${confirmation.keepOriginal ? 'Copying' : 'Moving'} ${fileName}`
                    });

                    // Download the file silently (without showing in transfer status)
                    isContentLoading.current = true;
                    try {
                        let fileContent: FileContent;
                        if (!sourceCloudType || !sourceAccountId) {
                            fileContent = await (window as any).fsApi.getFile(filePath);
                        } else {
                            fileContent = await (window as any).cloudFsApi.getFile(sourceCloudType, sourceAccountId, filePath);
                        }

                        // Upload the file immediately
                        const contentBuffer = Buffer.isBuffer(fileContent.content) 
                            ? fileContent.content 
                            : Buffer.from(fileContent.content || []);

                        if (!targetCloudType || !targetAccountId) {
                            await (window as any).fsApi.postFile(
                                fileContent.name,
                                targetPath || '',
                                contentBuffer
                            );
                        } else {
                            await (window as any).cloudFsApi.postFile(
                                targetCloudType,
                                targetAccountId,
                                fileContent.name,
                                targetPath || '',
                                contentBuffer
                            );
                        }

                        // Track successful file completion
                        updateTransfer(transfer.id, {
                            completedFiles: [...(getTransfer(transfer.id)?.completedFiles || []), fileContent.name]
                        });

                        // Delete from source if not keeping original
                        if (!confirmation.keepOriginal) {
                            try {
                                await deleteFileFromSource(fileContent, confirmation.keepOriginal);
                            } catch (deleteError: any) {
                                // Continue with the transfer - the file was uploaded successfully
                                // The error will be handled silently in deleteFileFromSource
                            }
                        }

                        processedFiles++;
                        updateTransfer(transfer.id, {
                            progress: (processedFiles / totalFiles) * 100
                        });

                    } catch (err: any) {
                        // Track failed file
                        const fileName = filePath.split('/').pop() || filePath;
                        const errorMessage = err.message || 'Unknown error';
                        updateTransfer(transfer.id, {
                            failedFiles: [...(getTransfer(transfer.id)?.failedFiles || []), { file: fileName, error: errorMessage }]
                        });
                        throw err;
                    } finally {
                        isContentLoading.current = false;
                    }
                }

                // Success
                updateTransfer(transfer.id, {
                    isCompleted: true,
                    progress: 100,
                    endTime: Date.now()
                });

                // Refresh UI after successful transfer - delay to ensure all files are processed
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
                const errorMessage = error instanceof Error ? error.message : "Transfer failed";
                
                const displayError = errorMessage.includes("cancelled") 
                    ? "Transfer cancelled" 
                    : errorMessage;
                
                updateTransfer(transfer.id, {
                    error: displayError,
                    isCancelling: false
                });

                // Also refresh UI on error to remove transferring state
                setTimeout(() => {
                    const fakeFileContents = filePaths.map(filePath => ({
                        path: filePath,
                        sourceCloudType,
                        sourceAccountId,
                    })) as FileContent[];
                    refreshSourceAndTargetBoxes(fakeFileContents, targetCloudType, targetAccountId);
                }, 100);
                
                // Don't throw the error - just update the transfer state
            }
        } catch (error) {
            // This catches errors before transfer creation (like user cancellation)
            if (error instanceof Error && !error.message.includes("cancelled")) {
                // For unexpected errors before transfer creation, create a failed transfer
                if (!transfer) {
                    const errorTransfer = createTransfer(
                        "Unknown Source",
                        "Unknown Target", 
                        false,
                        0,
                        []
                    );
                    updateTransfer(errorTransfer.id, {
                        error: error.message || "Transfer preparation failed",
                        isCancelling: false
                    });
                }
            }
        }
    }

    const handleRetryTransfer = useCallback(async (transferId: string) => {
        const transfer = transferQueue.transfers.find(t => t.id === transferId);
        if (!transfer) return;

        // Reset transfer state for retry
        setTransferQueue(prev => ({
            ...prev,
            transfers: prev.transfers.map(t => 
                t.id === transferId 
                    ? { 
                        ...t, 
                        error: null, 
                        progress: 0, 
                        isCompleted: false,
                        isCancelling: false,
                        currentItem: "Preparing retry...",
                        completedFiles: [],
                        failedFiles: [],
                        endTime: undefined,
                        abortController: new AbortController() // Create new abort controller for retry
                    }
                    : t
            )
        }));

        try {
            //TODO: Implement retry logic based on transfer type
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Retry failed";
            updateTransfer(transferId, {
                error: `Retry failed: ${errorMessage}`,
                isCancelling: false
            });
        }
    }, [transferQueue.transfers]);

    return {
        transferQueue,
        fileContentsCacheRef,
        isContentLoading,
        showUploadDialog,
        setShowUploadDialog,
        uploadDialogResolve,
        setUploadDialogResolve,
        
        // Transfer management functions
        createTransfer,
        updateTransfer,
        removeTransfer,
        getTransfer,
        handleCancelTransfer,
        handleCloseTransfer,
        handleRetryTransfer,
        
        // Transfer operations
        tempPostFile,
        tempGetFile,
        tempDragDropTransfer,
        
        // Dialog functions
        showUploadConfirmation,
        handleUploadDialogConfirm,
        handleUploadDialogCancel,
    };
};
