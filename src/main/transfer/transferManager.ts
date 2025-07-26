import { file } from "googleapis/build/src/apis/file";
import { CLOUD_HOME, CloudType } from "../../types/cloudType";
import { StoredAccounts } from "../cloud/cloudManager";
import mime from "mime-types";
import { progressCallbackData } from "../../types/transfer";
import { CloudStorage } from "../cloud/cloudStorage";
import fs from "fs/promises";
import path from "path";


// Semaphore class to limit concurrent operations
export class Semaphore {
    private maxConcurrent: number;
    private current: number;
    private queue: (() => void)[];
    constructor(maxConcurrent: number) {
        this.maxConcurrent = maxConcurrent;
        this.current = 0;
        this.queue = [];
    }
    
    async acquire() {
        return new Promise<void>((resolve) => {
            if (this.current < this.maxConcurrent) {
                this.current++;
                resolve();
            } else {
                this.queue.push(resolve);
            }
        });
    }
    
    release() {
        this.current--;
        if (this.queue.length > 0) {
            this.current++;
            const resolve = this.queue.shift();
            if (resolve) {
                resolve();
            }
        }
    }
}

// Progress callback scheduler using round-robin concept
class ProgressCallbackScheduler {
    private activeTransfers = new Map<string, { 
        lastData: progressCallbackData, 
        lastUpdate: number,
        isActive: boolean,
        priority: number,
        firstSeen: number,
        isError: boolean,
        errorDisplayTime?: number
    }>();
    private currentActiveTransfer: string | null = null;
    private displayDuration: number;
    private minDisplayTime: number;
    private errorDisplayDuration: number; 
    private lastSwitch = 0;
    private originalCallback: (data: progressCallbackData) => void;
    private stabilizationPeriod: number;
    
    constructor(originalCallback: (data: progressCallbackData) => void, displayDurationMs: number = 3000, minDisplayTimeMs: number = 1500) {
        this.originalCallback = originalCallback;
        this.displayDuration = displayDurationMs;
        this.minDisplayTime = minDisplayTimeMs;
        this.errorDisplayDuration = 5000; 
        this.stabilizationPeriod = 2000;
    }
    
    updateProgress(data: progressCallbackData) {
        const now = Date.now();
        const transferKey = `${data.transferId}-${data.sourcePath}-${data.fileName}`;
        
        // Check if this is an error
        const isError = !!data.errorItemDirectory;
        
        // Calculate priority based on transfer state
        let priority = this.calculatePriority(data);
        
        const existingTransfer = this.activeTransfers.get(transferKey);
        const firstSeen = existingTransfer?.firstSeen || now;
        
        // Update the transfer data
        this.activeTransfers.set(transferKey, {
            lastData: data,
            lastUpdate: now,
            isActive: true,
            priority,
            firstSeen,
            isError,
            errorDisplayTime: isError ? now : existingTransfer?.errorDisplayTime
        });
        
        this.cleanupFinishedTransfers(now);
        
        this.scheduleDisplay(now);
    }
    
    private calculatePriority(data: progressCallbackData): number {
        let priority = 1;
        
        // Errors get highest priority
        if (data.errorItemDirectory) priority += 10;
        
        // Base priority adjustments
        if (data.isDirectory) priority += 2;
        if (data.total > 100 * 1024 * 1024) priority += 1; // Large files
        
        // Progress priority
        const progressRatio = data.total > 0 ? data.transfered / data.total : 0;
        if (progressRatio > 0.8) priority += 2; // Nearly complete
        else if (progressRatio > 0.5) priority += 1; // Half complete
        
        // Stated priority
        if (data.isFetching) priority += 1; // Active operations
        
        return priority;
    }
    
    private cleanupFinishedTransfers(now: number) {
        const timeout = 15000;
        for (const [key, transfer] of this.activeTransfers.entries()) {
            let shouldRemove = false;
            
            // Remove transfers that haven't been updated in a while
            if (now - transfer.lastUpdate > timeout) {
                shouldRemove = true;
            }
            
            // Remove errors after they've been displayed for the error duration
            if (transfer.isError && transfer.errorDisplayTime && 
                (now - transfer.errorDisplayTime) > this.errorDisplayDuration) {
                shouldRemove = true;
            }
            
            if (shouldRemove) {
                this.activeTransfers.delete(key);
                if (this.currentActiveTransfer === key) {
                    this.currentActiveTransfer = null;
                }
            }
        }
    }
    
    private scheduleDisplay(now: number) {
        const activeTransferKeys = this.getEligibleTransfers(now);
        
        if (activeTransferKeys.length === 0) {
            return;
        }
        
        // If only one transfer, always show it
        if (activeTransferKeys.length === 1) {
            this.setCurrentTransfer(activeTransferKeys[0], now);
            this.sendCurrentProgress();
            return;
        }
        
        // Check if we should switch transfers
        const shouldSwitch = this.shouldSwitchTransfer(now, activeTransferKeys);
        
        if (shouldSwitch) {
            const nextTransfer = this.selectNextTransfer(activeTransferKeys);
            this.setCurrentTransfer(nextTransfer, now);
        }
        
        this.sendCurrentProgress();
    }
    
    private getEligibleTransfers(now: number): string[] {
        return Array.from(this.activeTransfers.entries())
            .filter(([key, transfer]) => {
                // Always show errors immediately
                if (transfer.isError) {
                    // But only if they haven't exceeded their display time
                    if (transfer.errorDisplayTime && 
                        (now - transfer.errorDisplayTime) <= this.errorDisplayDuration) {
                        return true;
                    }
                    return false;
                }
                
                // For non-errors, apply stabilization period
                const isStabilized = (now - transfer.firstSeen) >= this.stabilizationPeriod;
                const isComplete = transfer.lastData.transfered === transfer.lastData.total && transfer.lastData.total > 0;
                
                return isStabilized || isComplete;
            })
            .sort((a, b) => {
                const transferA = a[1];
                const transferB = b[1];
                
                // Errors always come first
                if (transferA.isError && !transferB.isError) return -1;
                if (!transferA.isError && transferB.isError) return 1;
                
                // Sort by priority first, then by age
                if (transferA.priority !== transferB.priority) {
                    return transferB.priority - transferA.priority;
                }
                return transferA.firstSeen - transferB.firstSeen;
            })
            .map(([key]) => key);
    }
    
    private shouldSwitchTransfer(now: number, eligibleTransfers: string[]): boolean {
        // No current transfer
        if (!this.currentActiveTransfer) {
            return true;
        }
        
        // Current transfer no longer exists
        if (!this.activeTransfers.has(this.currentActiveTransfer)) {
            return true;
        }
        
        // Current transfer not in eligible list
        if (!eligibleTransfers.includes(this.currentActiveTransfer)) {
            return true;
        }
        
        const currentTransfer = this.activeTransfers.get(this.currentActiveTransfer)!;
        
        // If there's an error transfer available and current is not an error, switch immediately
        const hasErrorTransfer = eligibleTransfers.some(key => {
            const transfer = this.activeTransfers.get(key);
            return transfer?.isError;
        });
        
        if (hasErrorTransfer && !currentTransfer.isError) {
            return true;
        }
        
        // If current transfer is an error, keep showing it for the full error duration
        if (currentTransfer.isError) {
            if (currentTransfer.errorDisplayTime && 
                (now - currentTransfer.errorDisplayTime) >= this.errorDisplayDuration) {
                return true;
            }
            return false; // Keep showing error
        }
        
        // Respect minimum display time for regular transfers
        if ((now - this.lastSwitch) < this.minDisplayTime) {
            return false;
        }
        
        // Check if it's time to switch based on display duration
        if ((now - this.lastSwitch) >= this.displayDuration) {
            return true;
        }
        
        // Check if a much higher priority transfer is available
        const highestPriorityTransfer = this.activeTransfers.get(eligibleTransfers[0]);
        
        if (highestPriorityTransfer && 
            highestPriorityTransfer.priority > currentTransfer.priority + 2 &&
            (now - this.lastSwitch) >= this.minDisplayTime) {
            return true;
        }
        
        return false;
    }
    
    private selectNextTransfer(eligibleTransfers: string[]): string {
        // Always prioritize errors first
        const errorTransfer = eligibleTransfers.find(key => {
            const transfer = this.activeTransfers.get(key);
            return transfer?.isError;
        });
        
        if (errorTransfer) {
            return errorTransfer;
        }
        
        // If current transfer is still eligible and not an error, find the next one in round-robin
        if (this.currentActiveTransfer && eligibleTransfers.includes(this.currentActiveTransfer)) {
            const currentIndex = eligibleTransfers.indexOf(this.currentActiveTransfer);
            const nextIndex = (currentIndex + 1) % eligibleTransfers.length;
            return eligibleTransfers[nextIndex];
        }
        
        // Otherwise, return the highest priority transfer
        return eligibleTransfers[0];
    }
    
    private setCurrentTransfer(transferKey: string, now: number) {
        if (this.currentActiveTransfer !== transferKey) {
            this.currentActiveTransfer = transferKey;
            this.lastSwitch = now;
        }
    }
    
    private sendCurrentProgress() {
        if (this.currentActiveTransfer) {
            const activeTransfer = this.activeTransfers.get(this.currentActiveTransfer);
            if (activeTransfer) {
                this.originalCallback(activeTransfer.lastData);
            }
        }
    }
    
    // Force immediate callback 
    forceCallback(data: progressCallbackData) {
        this.originalCallback(data);
    }
    
    // Clean up when transfer is complete
    cleanup(transferId: string) {
        const keysToRemove = Array.from(this.activeTransfers.keys())
            .filter(key => key.startsWith(`${transferId}-`));
        
        for (const key of keysToRemove) {
            this.activeTransfers.delete(key);
            if (this.currentActiveTransfer === key) {
                this.currentActiveTransfer = null;
            }
        }
    }
}


export async function transferManager(transferInfo: any, progressCallback: (data: progressCallbackData) => void, abortSignal?: AbortSignal): Promise<void> {
    // This function will handle the transfer operations based on the provided transferInfo
    // It will determine the source and target cloud types and accounts, and perform the transfer accordingly

    const { transferId, fileName, sourcePath, sourceCloudType, sourceAccountId, targetCloudType, targetAccountId, targetPath, copy } = transferInfo;

    const isSourceLocal = !sourceCloudType || !sourceAccountId;

    const isTargetLocal = !targetCloudType || !targetAccountId;

    // Create a progress callback scheduler for this transfer
    const scheduler = new ProgressCallbackScheduler(progressCallback, 3000);
    
    // Wrapper function that decides whether to use scheduler or direct callback
    const wrappedProgressCallback = (data: progressCallbackData) => {
        if (data.errorItemDirectory || 
            data.isFetching || 
            (data.transfered === data.total && data.total > 0) ||
            (data.isDirectory && data.transfered === 0 && data.total === 0)) {
            scheduler.forceCallback(data);
        } else {
            // Use scheduler for regular progress updates during file transfers
            scheduler.updateProgress(data);
        }
    };

    try {

        // if source is local, we will fetch the file from local filesystem and then upload using resumable upload
        if (isSourceLocal) {
            console.warn("Transferring from local filesystem to cloud storage...");
            wrappedProgressCallback({
                transferId,
                fileName,
                sourcePath,
                transfered: 0,
                total: 0, 
                isDirectory: false,
                isFetching: true 
            });
            if (isTargetLocal) {
                // just rename the file in local filesystem

            } else {
                // Handle local to cloud transfer
                await transferLocalToCloudUpload(transferId, fileName, sourcePath, targetCloudType, targetAccountId, targetPath, wrappedProgressCallback, abortSignal);
            }
        } else {
            console.warn("Transferring from local filesystem to cloud storage...");
            wrappedProgressCallback({
                transferId,
                fileName,
                sourcePath,
                transfered: 0,
                total: 0, 
                isDirectory: false,
                isFetching: true 
            });
            if (isTargetLocal) {
                // Handle cloud to local transfer
                // download the file from cloud storage to local filesystem
                await transferCloudToLocal(transferId, fileName, sourcePath, sourceCloudType, sourceAccountId, targetPath, wrappedProgressCallback, abortSignal);
            } else {
                // Handle cloud to cloud transfer
                await transferCloudToCloud(transferId, fileName, sourceCloudType, sourceAccountId, targetCloudType, targetAccountId, sourcePath, targetPath, copy, wrappedProgressCallback, abortSignal);
            }
        }
        
    } catch (error) {
        console.error("Transfer failed:", error);
        throw new Error(`Transfer failed: ${error}`);
    } finally {
        // Clean up scheduler when transfer is complete
        scheduler.cleanup(transferId);
    }
}

async function transferCloudToLocal(
    transferId: string,
    fileName: string,
    sourcePath: string,
    sourceCloudType: CloudType,
    sourceAccountId: string,
    targetPath: string,
    progressCallback?: (data: progressCallbackData) => void,
    abortSignal?: AbortSignal
): Promise<void> {
    console.log(`Transferring file from cloud to local: ${fileName} from ${sourceCloudType} account ${sourceAccountId} at path ${sourcePath} to local path ${targetPath}`);
    // Implement the logic for transferring from cloud to local
    sourcePath = sourcePath.replace(CLOUD_HOME, ""); 
    const accounts = StoredAccounts.get(sourceCloudType);
    if (accounts) {
        for (const account of accounts) {
            if (account.getAccountId() === sourceAccountId) {
                const type = mime.lookup(fileName) || 'application/octet-stream'; // default to binary if no mime type found
                // Handle local to cloud upload
                await downloadItemFromCloud(transferId, fileName, account, sourcePath, targetPath, abortSignal, progressCallback, false);
            }
        }
    }
}

async function downloadItemFromCloud(
    transferId: string,
    itemName: string,
    sourceAccountInstance: CloudStorage,
    sourcePath: string,
    targetPath: string,
    abortSignal?: AbortSignal,
    progressCallback?: (data: progressCallbackData) => void,
    isParentDirectory?: boolean
): Promise<void> {
    // Check if the source item is a directory
    const isDirectory = await sourceAccountInstance.isDirectory(sourcePath);
    console.error("isDirectory", isDirectory);

    if (abortSignal?.aborted) {
        console.warn(`Download cancelled before starting for ${itemName}`);
        throw new Error('Download cancelled by user');
    }
    // TODO: maybe there is way to check if directory or file without making a request to the cloud storage?

    if (isDirectory) {

        // Notify progress for the initial state
        if (progressCallback) {
            progressCallback({
                transferId,
                fileName: itemName,
                sourcePath,
                transfered: 0,
                total: 0,
                isDirectory: true,
                isFetching: true
            });
        }

        // If it's a directory, create a directory in the target cloud storage
        const newTargetFolderPath = path.join(targetPath, itemName);
        fs.mkdir(newTargetFolderPath, { recursive: true });

        const items = await sourceAccountInstance.readDir(sourcePath);



        // Create semaphore with desired concurrency limit
        const semaphore = new Semaphore(1); // Max 3 concurrent transfers

        const transferPromises = items.map(async (item) => {
            // Acquire semaphore to limit concurrent transfers
            await semaphore.acquire();

            if (abortSignal?.aborted) {
                console.warn(`Transfer aborted for ${itemName}`);
                console.log(`Stopping further processing of items in directory: ${sourcePath}`);
                // If the transfer is aborted, stop processing further items
                throw new Error(`User cancelled transfer`);
            }

            const sourceItemPath = path.join(sourcePath, item.name);
            
            try {
                // Recursively transfer each item
                // when transferring each item, we will call the downloadItem function again
                // without progressCallback to avoid keeping track of progress for each item

                progressCallback?.({
                    transferId,
                    fileName: item.name,
                    sourcePath,
                    transfered: 0,
                    total: 0, 
                    isDirectory: true,
                    isFetching: true 
                 });

                await downloadItemFromCloud(
                    transferId,
                    item.name,
                    sourceAccountInstance,
                    sourceItemPath,
                    newTargetFolderPath,
                    abortSignal,
                    progressCallback,
                    isDirectory
                );

            } catch (error: any) {
                if (abortSignal?.aborted || 
                    error?.error?.code === 'itemNotFound' || 
                    error?.code === 'itemNotFound' ||
                    error?.message?.includes('cancelled') ||
                    error?.message?.includes('aborted') ||
                    error?.name === 'AbortError') {
                    console.log('Transfer cancelled by user');
                    throw new Error('Transfer cancelled by user');
                    }
                
                console.error(`Failed to process directory ${item.name}:`, error);
                // Extract error message
                const parts = error instanceof Error ? error.message.split(':') : ["Transfer failed"];
                let errorMessage = parts[parts.length - 1].trim() + ". Continueing with next file...";
                if (errorMessage.toLowerCase().includes('permission')) {
                    errorMessage = "You don't have permission to access this file or folder.";
                } else if (errorMessage.toLowerCase().includes('quota')) {
                    errorMessage = "Google Drive storage quota exceeded.";
                } else if (errorMessage.toLowerCase().includes('network')) {
                    errorMessage = "Network error. Please check your internet connection.";
                } else if (errorMessage.toLowerCase().includes('not found')) {
                    errorMessage = "The file or folder was not found.";
                } else if (errorMessage.toLowerCase().includes('timeout')) {
                    errorMessage = "The operation timed out. Please try again.";
                } else if (errorMessage === "" || errorMessage === "Transfer failed") {
                    errorMessage = "An unknown error occurred during transfer.";
                }
                progressCallback?.({
                    transferId,
                    fileName: item.name,
                    sourcePath,
                    transfered: 0,
                    total: 0, 
                    isDirectory: true,
                    isFetching: true,
                    errorItemDirectory: `Failed to process directory ${item.name}: ${errorMessage}`
                });

                // Wait 5 seconds before continuing with the next item
                await new Promise(resolve => setTimeout(resolve, 5000));
                console.log(`Continuing with next item after error: ${errorMessage}`);

            } finally {
                // Always release semaphore
                semaphore.release();
            }
        });

        // Wait for all transfers to complete
        await Promise.all(transferPromises);
        

        console.log(`All items in directory ${sourcePath} processed successfully.`);
    } else {
        progressCallback?.({
            transferId,
            fileName: itemName,
            sourcePath,
            transfered: 0,
            total: 0, 
            isDirectory: isParentDirectory,
            isFetching: true 
          });
        // if it's a file
        console.log(`Transferring file: ${sourcePath} to ${targetPath}`);

        const fileSize = await sourceAccountInstance.getItemInfo(sourcePath).then(info => info.size || 0);
        console.log(`File size: ${fileSize} bytes`);
        
        let CHUNK_SIZE: number;

        if (fileSize < 10 * 1024 * 1024) { // < 10MB
            CHUNK_SIZE = 512 * 1024; // 512KB
        } else if (fileSize < 100 * 1024 * 1024) { // < 100MB
            CHUNK_SIZE = 2 * 1024 * 1024; // 2MB
        } else if (fileSize < 1024 * 1024 * 1024) { // < 1GB
            CHUNK_SIZE = 8 * 1024 * 1024; // 8MB
        } else { // > 1GB
            CHUNK_SIZE = 32 * 1024 * 1024; // 32MB
        }
        
        // Notify progress for the initial state
        if (progressCallback) {
            progressCallback({
                transferId,
                fileName: itemName,
                sourcePath,
                transfered: 0,
                total: fileSize,
                isDirectory: isParentDirectory,
                isFetching: true
            });
        }


        const maxQueueSize = 10 * CHUNK_SIZE; // 10 chunks, adjust as needed

        // create a read stream from the source cloud storage
        // actually maxQueueSize is not used in the current implementation as chunk is read synchronously
        const fileStream = await sourceAccountInstance.downloadInChunks(sourcePath, fileSize, CHUNK_SIZE, maxQueueSize, abortSignal);
        // create a upload session in the target cloud storage
        const type = mime.lookup(itemName) || 'application/octet-stream'; // default to binary if no mime type found
        // assume it returns a sessionId or upload URL
        let chunkOffset = 0;

        const targetFilePath = path.join(targetPath, itemName);
        const reader = fileStream.getReader();
        try {
            while (true) {
                if (abortSignal?.aborted) {
                    console.warn(`Download cancelled for ${itemName}`);
                    await reader.cancel();
                    throw new Error('Download cancelled by user');
                }

                const { done, value: chunk } = await reader.read();
                if (done) {
                    console.log(`All chunks read for file: ${itemName}`);
                    break;
                }

                if (abortSignal?.aborted) {
                    console.warn(`Transfer aborted for ${itemName}`);
                    // If the transfer is aborted, cancel the file stream
                    fileStream.cancel();
                    throw new Error(`User cancelled transfer`);
                }
                console.log(`Uploading chunk of size: ${chunk.length} bytes at offset: ${chunkOffset}`);
                // upload the chunk to the target cloud storage with sessionId or upload URL
                // targetPath + itemName is the target file path in the target cloud storage
                // upload(sessionId, chunk, chunkOffset, fileSize, targetPath, itemName, progressCallback, abortSignal);
                fs.writeFile(targetFilePath, chunk, { flag: 'a' }); // append chunk to the file
                chunkOffset += chunk.length;

                // Call the progress callback if provided
                if (progressCallback) {
                    progressCallback({
                        transferId,
                        fileName: itemName,
                        sourcePath,
                        transfered: chunkOffset,
                        total: fileSize,
                        isDirectory: isParentDirectory,
                        isFetching: false
                    });
                }

                if (chunkOffset >= fileSize) {
                    console.log(`File ${itemName} transferred successfully to ${targetPath}/${itemName}`);
                }
            }
        } catch (error: any) {
            if (abortSignal?.aborted || 
              error?.error?.code === 'itemNotFound' || 
              error?.code === 'itemNotFound' ||
              error?.message?.includes('cancelled') ||
              error?.message?.includes('aborted') ||
              error?.name === 'AbortError') {
              console.log('Transfer cancelled by user');
              throw new Error('Transfer cancelled by user');
            }
            console.error(`Failed to process file ${itemName}:`, error);
            // Extract error message
            const parts = error instanceof Error ? error.message.split(':') : ["Transfer failed"];
            let errorMessage = parts[parts.length - 1].trim() + ". Continueing with next file...";
            if (errorMessage.toLowerCase().includes('permission')) {
                errorMessage = "You don't have permission to access this file or folder.";
            } else if (errorMessage.toLowerCase().includes('quota')) {
                errorMessage = "Google Drive storage quota exceeded.";
            } else if (errorMessage.toLowerCase().includes('network')) {
                errorMessage = "Network error. Please check your internet connection.";
            } else if (errorMessage.toLowerCase().includes('not found')) {
                errorMessage = "The file or folder was not found.";
            } else if (errorMessage.toLowerCase().includes('timeout')) {
                errorMessage = "The operation timed out. Please try again.";
            } else if (errorMessage === "" || errorMessage === "Transfer failed") {
                errorMessage = "An unknown error occurred during transfer.";
            }
            progressCallback?.({
                transferId,
                fileName: itemName,
                sourcePath,
                transfered: 0,
                total: 0, 
                isDirectory: isParentDirectory,
                isFetching: true,
                errorItemDirectory: `Failed to process file ${itemName}: ${errorMessage}`
                })

                // Wait 5 seconds before continuing with the next item
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        console.log(`All chunks uploaded for file: ${itemName}`);
    }
}

async function transferCloudToCloud(
    transferId: string,
    itemName: string,
    sourceCloudType: CloudType,
    sourceAccountId: string,
    targetCloudType: CloudType,
    targetAccountId: string,
    sourcePath: string,
    targetPath: string,
    copy: boolean,
    progressCallback?: (data: progressCallbackData) => void,
    abortSignal?: AbortSignal
): Promise<void> {
    targetPath = targetPath.replace(CLOUD_HOME, ""); 
    sourcePath = sourcePath.replace(CLOUD_HOME, "");
    let sourceStorageInstance: CloudStorage | undefined;
    let targetStorageInstance: CloudStorage | undefined;
    const targetAccounts = StoredAccounts.get(targetCloudType);
    if (targetAccounts) {
        for (const account of targetAccounts) {
            if (account.getAccountId() === targetAccountId) {
                targetStorageInstance = account;
            }
        }
    }
    
    const sourceAccounts = StoredAccounts.get(sourceCloudType);
    if (sourceAccounts) {
        for (const account of sourceAccounts) {
            if (account.getAccountId() === sourceAccountId) {
                sourceStorageInstance = account;
            }
        }
    }

    if (!sourceStorageInstance || !targetStorageInstance) {
        throw new Error(`Source or target account not found for transfer: ${transferId}`);
    }

    if (sourceStorageInstance.getAccountId() === targetStorageInstance.getAccountId() && sourceCloudType === targetCloudType) {
        // move file within the same cloud storage account
        console.warn("Moving file within the same cloud storage account...");
        await transferItemWithinSameAccount(
            transferId,
            itemName,
            sourceStorageInstance,
            sourcePath,
            targetPath,
            copy,
            progressCallback,
            abortSignal
        );
        return;
    }
    // move file from source cloud storage to target cloud storage
    await transferItemCloudToCloud(
        transferId,
        itemName,
        sourceStorageInstance,
        targetStorageInstance,
        sourcePath,
        targetPath,
        abortSignal,
        progressCallback
    );
}

async function transferItemWithinSameAccount(
    transferId: string,
    itemName: string,
    accountInstance: CloudStorage,
    sourcePath: string,
    targetPath: string,
    copy: boolean,
    progressCallback?: (data: progressCallbackData) => void,
    abortSignal?: AbortSignal
): Promise<void> {
    // This function will handle the transfer of an item within the same cloud storage account
    // It will move the item from sourcePath to targetPath
    if (abortSignal?.aborted) {
      console.log('Transfer cancelled by user during finalization');
      throw new Error('Transfer cancelled by user');
    }
    
    if (progressCallback) {
        progressCallback({
            transferId,
            fileName: itemName,
            sourcePath,
            transfered: 0,
            total: 0, 
            isDirectory: false,
            isFetching: true
        });
    }
    await accountInstance.moveOrCopyItem(transferId, sourcePath, targetPath, itemName, copy, progressCallback, abortSignal);
}

/*
    This function is called when cloud to cloud different cloud storage accounts are used.
    If item is a directory, it will recursively transfer all files and directories within it.
*/
async function transferItemCloudToCloud(
    transferId: string,
    itemName: string,
    sourceAccountInstance: CloudStorage,
    targetAccountInstance: CloudStorage,
    sourcePath: string,
    targetPath: string,
    abortSignal?: AbortSignal,
    progressCallback?: (data: progressCallbackData) => void,
    isParentDirectory?: boolean
): Promise<void> {
    
    // Check if the source item is a directory
    const isDirectory = await sourceAccountInstance.isDirectory(sourcePath);
    if (progressCallback) {
        progressCallback({
            transferId,
            fileName: itemName,
            sourcePath,
            transfered: 0,
            total: 0, 
            isDirectory: isDirectory,
            isFetching: true
        });
    }
    // TODO: maybe there is way to check if directory or file without making a request to the cloud storage?
    
    const RETRY_LIMIT = 5;
    if (isDirectory) {
        // Notify progress for the initial state
        if (progressCallback) {
            progressCallback({
                transferId,
                fileName: itemName,
                sourcePath,
                transfered: 0,
                total: 0,
                isDirectory: true,
                isFetching: true
            });
        }
        // If it's a directory, create a directory in the target cloud storage
        const newTargetFolderPath = path.join(targetPath, itemName);

        // create directory in the target cloud storage
        // retry logic for the case of directory creation failure due to limitations or network issues
        let createDirectoryTryCount = 0;
        while (createDirectoryTryCount < RETRY_LIMIT) {
            try {
                await targetAccountInstance.createDirectory(newTargetFolderPath);
                break; // Exit loop if successful
            } catch (error: any) {
                console.log("YeeeeeeeYeeeeeeeYeeeeeeeYeeeeeeeYeeeeeeeYeeeeeeeYeeeeeee")
                const message = error?.message || '';
                const status = error?.status || '';
                console.log(`Creating directory ${newTargetFolderPath} failed with status: ${status}`);
                const shouldRetry =
                    status === 429 || // Too Many Requests
                    status === 403 || // Forbidden (quota exceeded)
                    status === 500 || // Internal Server Error
                    status == 503; // Service Unavailable

                if (shouldRetry) {
                    console.warn(`Retrying to create directory ${newTargetFolderPath} due to error: ${status}`);
                    // Wait exponentially before retrying
                    await new Promise(resolve => setTimeout(resolve, 4000 * Math.pow(2, createDirectoryTryCount)));
                    createDirectoryTryCount++;
                    if (createDirectoryTryCount >= RETRY_LIMIT) {
                        console.log(`Retry limit reached for creating directory ${newTargetFolderPath}: ${message}`);
                        throw new Error(`Failed to create directory ${newTargetFolderPath} after ${RETRY_LIMIT} attempts`);
                    }
                } else {
                    throw new Error(`Failed to create directory ${newTargetFolderPath}: ${error.message || 'Unknown error'}`);
                }
            }
        }
        // Read the source directory and get all items
        const items = await sourceAccountInstance.readDir(sourcePath);


        // Create semaphore with desired concurrency limit
        const semaphore = new Semaphore(3); // Max 3 concurrent transfers

        const transferPromises = items.map(async (item) => {
            // Acquire semaphore to limit concurrent transfers
            await semaphore.acquire();

            if (abortSignal?.aborted) {
                console.warn(`Transfer aborted for ${itemName}`);
                console.log(`Stopping further processing of items in directory: ${sourcePath}`);
                // If the transfer is aborted, stop processing further items
                throw new Error(`User cancelled transfer`);
            }

            const sourceItemPath = path.join(sourcePath, item.name);
            
            try {
                // Recursively transfer each item
                // when transferring each item, we will call the transferItemCloudToCloud function again 
                // without progressCallback to avoid keeping track of progress for each item
                progressCallback?.({
                    transferId,
                    fileName: item.name,
                    sourcePath,
                    transfered: 0,
                    total: 0, 
                    isDirectory: false,
                    isFetching: true 
                 });
                
                await transferItemCloudToCloud(
                    transferId,
                    item.name,
                    sourceAccountInstance,
                    targetAccountInstance,
                    sourceItemPath,
                    newTargetFolderPath,
                    abortSignal,
                    progressCallback,
                    isDirectory
                );
            } catch (error: any) {
                if (abortSignal?.aborted || 
                    error?.error?.code === 'itemNotFound' || 
                    error?.code === 'itemNotFound' ||
                    error?.message?.includes('cancelled') ||
                    error?.message?.includes('aborted') ||
                    error?.name === 'AbortError') {
                    console.log('Transfer cancelled by user');
                    throw new Error('Transfer cancelled by user');
                }
                
                console.error(`Failed to process directory ${item.name}:`, error);
                // Extract error message
                const parts = error instanceof Error ? error.message.split(':') : ["Transfer failed"];
                let errorMessage = parts[parts.length - 1].trim() + ". Continueing with next file...";
                if (errorMessage.toLowerCase().includes('permission')) {
                    errorMessage = "You don't have permission to access this file or folder.";
                } else if (errorMessage.toLowerCase().includes('quota')) {
                    errorMessage = "Google Drive storage quota exceeded.";
                } else if (errorMessage.toLowerCase().includes('network')) {
                    errorMessage = "Network error. Please check your internet connection.";
                } else if (errorMessage.toLowerCase().includes('not found')) {
                    errorMessage = "The file or folder was not found.";
                } else if (errorMessage.toLowerCase().includes('timeout')) {
                    errorMessage = "The operation timed out. Please try again.";
                } else if (errorMessage === "" || errorMessage === "Transfer failed") {
                    errorMessage = "An unknown error occurred during transfer.";
                }
                progressCallback?.({
                    transferId,
                    fileName: item.name,
                    sourcePath,
                    transfered: 0,
                    total: 0, 
                    isDirectory: true,
                    isFetching: true,
                    errorItemDirectory: `Failed to process directory ${item.name}: ${errorMessage}`
                });

                // Wait 5 seconds before continuing with the next item
                await new Promise(resolve => setTimeout(resolve, 5000));
                console.log(`Continuing with next item after error: ${errorMessage}`);

            } finally {
                // Always release semaphore, even if operation fails
                semaphore.release();
            }
        });

        // Wait for all transfers to complete
        await Promise.all(transferPromises);
        
        console.log(`Directory ${itemName} transferred successfully to ${newTargetFolderPath}`);
    } else {
        progressCallback?.({
            transferId,
            fileName: itemName,
            sourcePath,
            transfered: 0,
            total: 0, 
            isDirectory: isParentDirectory,
            isFetching: true 
        });
        // if it's a file
        console.log(`Transferring file: ${sourcePath} to ${targetPath}`);

        const fileSize = await sourceAccountInstance.getItemInfo(sourcePath).then(info => info.size || 0);
        console.log(`File size: ${fileSize} bytes`);
        
        let CHUNK_SIZE: number;

        if (fileSize < 10 * 1024 * 1024) { // < 10MB
            CHUNK_SIZE = 512 * 1024; // 512KB
        } else if (fileSize < 100 * 1024 * 1024) { // < 100MB
            CHUNK_SIZE = 2 * 1024 * 1024; // 2MB
        } else if (fileSize < 1024 * 1024 * 1024) { // < 1GB
            CHUNK_SIZE = 8 * 1024 * 1024; // 8MB
        } else { // > 1GB
            CHUNK_SIZE = 32 * 1024 * 1024; // 32MB
        }
        // Notify progress for the initial state
        if (progressCallback) {
            progressCallback({
                transferId,
                fileName: itemName,
                sourcePath,
                transfered: 0,
                total: fileSize,
                isDirectory: isParentDirectory,
                isFetching: true
            });
        }

        const maxQueueSize = 10 * CHUNK_SIZE; // 10 chunks, adjust as needed

        // create a read stream from the source cloud storage
        // actually maxQueueSize is not used in the current implementation as chunk is read synchronously
        const fileStream = await sourceAccountInstance.downloadInChunks(sourcePath, fileSize, CHUNK_SIZE, maxQueueSize, abortSignal);
        // create a upload session in the target cloud storage
        const type = mime.lookup(itemName) || 'application/octet-stream'; // default to binary if no mime type found
        const sessionId = await targetAccountInstance.initiateResumableUpload(itemName, type, targetPath);
        console.log(`Resumable upload session initiated: ${sessionId}`);
        // assume it returns a sessionId or upload URL
        let chunkOffset = 0;
        
        if (abortSignal?.aborted) {
                console.warn(`Transfer aborted for ${itemName}`);
                console.log(`Stopping further processing of items in directory: ${sourcePath}`);
                // If the transfer is aborted, stop processing further items
                throw new Error(`User cancelled transfer`);
        }

        const targetFilePath = path.join(targetPath, itemName);
        const reader = fileStream.getReader();
        try {
            while (true) {
                if (abortSignal?.aborted) {
                    console.warn(`Download cancelled for ${itemName}`);
                    await reader.cancel();
                    throw new Error('Download cancelled by user');
                }
                const { done, value: chunk } = await reader.read();
                
                if (done) {
                    console.log(`All chunks read for file: ${itemName}`);
                    break;
                }
                
                if (abortSignal?.aborted) {
                    console.warn(`Transfer aborted for ${itemName}`);
                    // If the transfer is aborted, cancel the file stream
                    fileStream.cancel();
                    throw new Error(`User cancelled transfer`);
                }
                // console.log(`Uploading chunk of size: ${chunk.length} bytes at offset: ${chunkOffset}`);

                // upload the chunk to the target cloud storage with sessionId or upload URL
                // targetPath + itemName is the target file path in the target cloud storage
                // upload(sessionId, chunk, chunkOffset, fileSize, targetPath, itemName, progressCallback, abortSignal);
                // retry logic for the case of upload chunk failure due to limitations or network issues
                let uploadTryCount = 0;
                while (uploadTryCount < RETRY_LIMIT) {
                    if (abortSignal?.aborted) {
                        console.log('Transfer cancelled by user');
                        throw new Error('Transfer cancelled by user');
                    }
                    try {
                        await targetAccountInstance.cloudToCloudUploadChunk(transferId, itemName, sourcePath, sessionId, chunk, chunkOffset, fileSize, progressCallback, isDirectory, abortSignal);
                        break; // exit loop on success
                    } catch (error: any) {
                        const message = error?.message || '';
                        const status = error?.status || '';
                        console.log(`Uploading chunk for file ${itemName} failed with status: ${status}`);
                        const shouldRetry =
                            status === 429 || // Too Many Requests
                            status === 403 || // Forbidden (quota exceeded)
                            status === 500 || // Internal Server Error
                            status == 503; // Service Unavailable
                        if (shouldRetry) {
                            console.warn(`Retrying upload chunk for file ${itemName} due to error: ${status}`);
                            uploadTryCount++;
                            if (uploadTryCount >= RETRY_LIMIT) {
                                throw new Error(`Failed to upload chunk for file ${itemName} after ${RETRY_LIMIT} attempts`);
                            }
                            await new Promise(resolve => setTimeout(resolve, 4000 * Math.pow(2, uploadTryCount)));
                        } else {
                            throw new Error(`Failed to upload chunk for file ${itemName}: ${error.message || 'Unknown error'}`);
                        }
                    }
                }
                chunkOffset += chunk.length;

                if (abortSignal?.aborted) {
                    console.warn(`Transfer aborted for ${itemName}`);
                    console.log(`Stopping further processing of items in directory: ${sourcePath}`);
                    // If the transfer is aborted, stop processing further items
                    throw new Error(`User cancelled transfer`);
                }
                // Call the progress callback if provided
                if (progressCallback) {
                    progressCallback({
                        transferId,
                        fileName: itemName,
                        sourcePath,
                        transfered: chunkOffset,
                        total: fileSize,
                        isDirectory: isParentDirectory,
                        isFetching: false
                    });
                }

                if (chunkOffset >= fileSize) {
                    console.log(`File ${itemName} transferred successfully to ${targetPath}/${itemName}`);
                    let uploadTryCount = 0;
                    // Finalize the upload session
                    // Dropbox requires finalizing the upload session after all chunks are uploaded
                    // retry logic for the case of upload session finalization failure due to limitations or network issues
                    while (uploadTryCount < RETRY_LIMIT) {
                        try {
                            // only for dropbox...
                            await targetAccountInstance.finishResumableUpload(transferId, itemName, sourcePath, sessionId, targetFilePath, fileSize, progressCallback, isDirectory, abortSignal);
                            console.log(`File ${itemName} uploaded successfully to ${targetFilePath}`);
                            break; // exit loop on success
                        } catch (error: any) {
                            throw error;
                        }
                    }
                }
            }
        } catch (error: any) {
            if (abortSignal?.aborted || 
              error?.error?.code === 'itemNotFound' || 
              error?.code === 'itemNotFound' ||
              error?.message?.includes('cancelled') ||
              error?.message?.includes('aborted') ||
              error?.name === 'AbortError') {
              console.log('Transfer cancelled by user');
              throw new Error('Transfer cancelled by user');
            }
            console.error(`Failed to process file ${itemName}:`, error);
            // Extract error message
            const parts = error instanceof Error ? error.message.split(':') : ["Transfer failed"];
            let errorMessage = parts[parts.length - 1].trim() + ". Continueing with next file...";
            if (errorMessage.toLowerCase().includes('permission')) {
                errorMessage = "You don't have permission to access this file or folder.";
            } else if (errorMessage.toLowerCase().includes('quota')) {
                errorMessage = "Google Drive storage quota exceeded.";
            } else if (errorMessage.toLowerCase().includes('network')) {
                errorMessage = "Network error. Please check your internet connection.";
            } else if (errorMessage.toLowerCase().includes('not found')) {
                errorMessage = "The file or folder was not found.";
            } else if (errorMessage.toLowerCase().includes('timeout')) {
                errorMessage = "The operation timed out. Please try again.";
            } else if (errorMessage === "" || errorMessage === "Transfer failed") {
                errorMessage = "An unknown error occurred during transfer.";
            }
            progressCallback?.({
                transferId,
                fileName: itemName,
                sourcePath,
                transfered: 0,
                total: 0, 
                isDirectory: isParentDirectory,
                isFetching: true,
                errorItemDirectory: `Failed to process file ${itemName}: ${errorMessage}`
                })

                // Wait 5 seconds before continuing with the next item
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        console.log(`All chunks uploaded for file: ${itemName}`);
    }
}

async function transferLocalToCloudUpload(
    transferId: string,
    fileName: string,
    sourcePath: string,
    targetCloudType: CloudType,
    targetAccountId: string,
    targetPath: string,
    progressCallback?: (data: progressCallbackData) => void,
    abortSignal?: AbortSignal
): Promise<void> {
    // This function will handle the upload of a file from local filesystem to cloud storage
    try {     
        targetPath = targetPath.replace(CLOUD_HOME, ""); 
        const accounts = StoredAccounts.get(targetCloudType);
            if (accounts) {
                for (const account of accounts) {
                    if (account.getAccountId() === targetAccountId) {
                        const type = mime.lookup(fileName) || 'application/octet-stream'; // default to binary if no mime type found
                        // Handle local to cloud upload
                        const fileInfo = {transferId, fileName, sourcePath, type, targetCloudType, targetAccountId, targetPath};
                        await account.transferLocalToCloud(fileInfo, progressCallback, abortSignal);
                        
                    }
                }
            }
    } catch (error: any) {
        console.error(`Error posting file to ${CloudType}:`, error);
            
        // Handle specific error cases
        if (error.message?.includes('unauthorized') || error.message?.includes('access_denied') || error.message?.includes('Authentication failed')) {
            throw new Error('Authentication expired. Please reconnect your account.');
        } else if (error.message?.includes('network') || error.message?.includes('timeout') || error.message?.includes('ENOTFOUND')) {
            throw new Error('Network connection failed. Please check your internet connection.');
        } else if (error.message?.includes('quota') || error.message?.includes('storage full') || error.message?.includes('insufficient storage')) {
            throw new Error('Storage quota exceeded. Please free up space or upgrade your account.');
        } else if (error.message?.includes('too large') || error.message?.includes('size limit') || error.message?.includes('file size')) {
            throw new Error('File is too large for upload. Please reduce file size.');
        } else if (error.message?.includes('permission') || error.message?.includes('forbidden')) {
            throw new Error('Permission denied. You may not have write access to this location.');
        } else if (error.message?.includes('exists') || error.message?.includes('conflict')) {
            throw new Error('A file with this name already exists.');
        } else {
            throw new Error(`Failed to upload file: ${error.message || 'Unknown error'}`);
        }
    }
}


