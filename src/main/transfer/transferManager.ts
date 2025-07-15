import { file } from "googleapis/build/src/apis/file";
import { CLOUD_HOME, CloudType } from "../../types/cloudType";
import { StoredAccounts } from "../cloud/cloudManager";
import mime from "mime-types";
import { progressCallbackData } from "../../types/transfer";
import { CloudStorage } from "../cloud/cloudStorage";
import fs from "fs/promises";
import path from "path";

// Semaphore class to limit concurrent operations
class Semaphore {
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


export async function transferManager(transferInfo: any, progressCallback: (data: progressCallbackData) => void, abortSignal?: AbortSignal): Promise<void> {
    // This function will handle the transfer operations based on the provided transferInfo
    // It will determine the source and target cloud types and accounts, and perform the transfer accordingly

    const { transferId, fileName, sourcePath, sourceCloudType, sourceAccountId, targetCloudType, targetAccountId, targetPath, copy } = transferInfo;

    const isSourceLocal = !sourceCloudType || !sourceAccountId;

    const isTargetLocal = !targetCloudType || !targetAccountId;

    try {

        // if source is local, we will fetch the file from local filesystem and then upload using resumable upload
        if (isSourceLocal) {
            console.warn("Transferring from local filesystem to cloud storage...");
            progressCallback({
                transferId,
                fileName,
                transfered: 0,
                total: 0, 
                isDirectory: false,
                isFetching: true 
            });
            if (isTargetLocal) {
                // just rename the file in local filesystem

            } else {
                // Handle local to cloud transfer
                await transferLocalToCloudUpload(transferId, fileName, sourcePath, targetCloudType, targetAccountId, targetPath, progressCallback, abortSignal);
            }
        } else {
            console.warn("Transferring from local filesystem to cloud storage...");
            progressCallback({
                transferId,
                fileName,
                transfered: 0,
                total: 0, 
                isDirectory: false,
                isFetching: true 
            });
            if (isTargetLocal) {
                // Handle cloud to local transfer
                // download the file from cloud storage to local filesystem
                await transferCloudToLocal(transferId, fileName, sourcePath, sourceCloudType, sourceAccountId, targetPath, progressCallback, abortSignal);
            } else {
                // Handle cloud to cloud transfer
                await transferCloudToCloud(transferId, fileName, sourceCloudType, sourceAccountId, targetCloudType, targetAccountId, sourcePath, targetPath, copy, progressCallback, abortSignal);
            }
        }
        
    } catch (error) {
        console.error("Transfer failed:", error);
        throw new Error(`Transfer failed: ${error}`);
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
                await downloadItem(transferId, fileName, account, sourcePath, targetPath, abortSignal, progressCallback);
            }
        }
    }
}

async function downloadItem(
    transferId: string,
    itemName: string,
    sourceAccountInstance: CloudStorage,
    sourcePath: string,
    targetPath: string,
    abortSignal?: AbortSignal,
    progressCallback?: (data: progressCallbackData) => void
): Promise<void> {
    // Check if the source item is a directory
    const isDirectory = await sourceAccountInstance.isDirectory(sourcePath);
    
    // TODO: maybe there is way to check if directory or file without making a request to the cloud storage?

    if (isDirectory) {
        // Notify progress for the initial state
        if (progressCallback) {
            progressCallback({
                transferId,
                fileName: itemName,
                transfered: 0,
                total: 1,
                isDirectory: true,
                isFetching: true
            });
        }
        // If it's a directory, create a directory in the target cloud storage
        const newTargetFolderPath = path.join(targetPath, itemName);
        fs.mkdir(newTargetFolderPath, { recursive: true });

        const items = await sourceAccountInstance.readDir(sourcePath);

        const total_items = items.length;
        let processed_items = 0;

        // Call the progress callback if provided
        if (progressCallback) {
            progressCallback({
                transferId,
                fileName: itemName,
                transfered: processed_items,
                total: total_items,
                isDirectory: true,
                isFetching: true
            });
        }


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
                // when transferring each item, we will call the downloadItem function again
                // without progressCallback to avoid keeping track of progress for each item
                const response = await downloadItem(
                    transferId,
                    item.name,
                    sourceAccountInstance,
                    sourceItemPath,
                    newTargetFolderPath,
                    abortSignal
                );
                processed_items++;
                // Call the progress callback if provided
                if (progressCallback) {
                    progressCallback({
                        transferId,
                        fileName: itemName,
                        transfered: processed_items,
                        total: total_items,
                        isDirectory: true,
                        isFetching: false
                    });
                }

                return { success: true, itemName: item.name };
            } catch (error) {
                processed_items++;
                if (progressCallback) {
                    progressCallback({
                        transferId,
                        fileName: itemName,
                        transfered: processed_items,
                        total: total_items,
                        isDirectory: false,
                        isFetching: false,
                        errorItemDirectory: `Failed to process file ${item.name}: skipping to next file`
                    });
                } else {
                    // this is a folder under directory being transferred..
                    throw new Error(`Failed to process folder ${item.name}: skipping to next folder`);
                }

                return { success: false, itemName: item.name };
            } finally {
                // Always release semaphore
                semaphore.release();
            }
        });

        // Wait for all transfers to complete
        const result = await Promise.all(transferPromises);
        
        // Final progress callback - directory transfer complete
        if (progressCallback) {
            const successCount = result.filter(r => r.success === true).length;
            const failCount = result.filter(r => r.success === false).length;

            const failedNames = result.filter(r => r.success === false).map(r => r.itemName).join(', ');

            progressCallback({
                transferId,
                fileName: itemName,
                transfered: total_items,
                total: total_items,
                isDirectory: true,
                isFetching: false,
            });
            console.log(`Directory transfer complete: ${itemName}`);
            console.log(`Successfully transferred ${successCount} items, failed to transfer ${failCount} items.`);
            if (failCount > 0) {
                progressCallback({
                    transferId,
                    fileName: itemName,
                    transfered: successCount,
                    total: total_items,
                    isDirectory: true,
                    isFetching: false,
                    errorItemDirectory: `Failed to process ${failCount} items: ${failedNames}`
                });
            }
        }

        console.log(`Directory ${itemName} transferred successfully to ${newTargetFolderPath}`);
    } else {
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
                transfered: 0,
                total: fileSize,
                isDirectory: false,
                isFetching: true
            });
        }

        const maxQueueSize = 10 * CHUNK_SIZE; // 10 chunks, adjust as needed

        // create a read stream from the source cloud storage
        // actually maxQueueSize is not used in the current implementation as chunk is read synchronously
        const fileStream = await sourceAccountInstance.createReadStream(sourcePath, fileSize, CHUNK_SIZE, maxQueueSize);
        // create a upload session in the target cloud storage
        const type = mime.lookup(itemName) || 'application/octet-stream'; // default to binary if no mime type found
        // assume it returns a sessionId or upload URL
        let chunkOffset = 0;

        const targetFilePath = path.join(targetPath, itemName);
        const reader = fileStream.getReader();
        try {
            while (true) {
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
                        transfered: chunkOffset,
                        total: fileSize,
                        isDirectory: false,
                        isFetching: false
                    });
                }

                if (chunkOffset >= fileSize) {
                    console.log(`File ${itemName} transferred successfully to ${targetPath}/${itemName}`);
                }
            }
        } catch (error: any) {
            if (progressCallback) {
                // skip to next file
                progressCallback({
                    transferId,
                    fileName: itemName,
                    transfered: 0,
                    total: 0, 
                    isDirectory: true,
                    isFetching: true,
                    errorItemDirectory: `Failed to process file ${itemName}: skipping to next file`
                });
                await new Promise((resolve) => setTimeout(resolve, 1000)); // wait for 1 second before throwing error
            } else {
                // this is a file under directory being transferred..
                throw new Error(`Failed to process file ${itemName}: skipping to next file`);
            }
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
        // TODO: Implement move logic
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
    if (progressCallback) {
        progressCallback({
            transferId,
            fileName: itemName,
            transfered: 0,
            total: 1, // total is 1 for directory creation
            isDirectory: true,
            isFetching: true
        });
    }
    await accountInstance.moveOrCopyItem(sourcePath, targetPath, itemName, copy, progressCallback, abortSignal);

    if (progressCallback) {
        progressCallback({
            transferId,
            fileName: itemName,
            transfered: 1,
            total: 1, // total is 1 for directory creation
            isDirectory: true,
            isFetching: false
        });
    }
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
    progressCallback?: (data: progressCallbackData) => void
): Promise<void> {
    // Check if the source item is a directory
    const isDirectory = await sourceAccountInstance.isDirectory(sourcePath);
    
    // TODO: maybe there is way to check if directory or file without making a request to the cloud storage?
    
    const RETRY_LIMIT = 5;
    if (isDirectory) {
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

        const total_items = items.length;
        let processed_items = 0;

        // Call the progress callback if provided
        if (progressCallback) {
            progressCallback({
                transferId,
                fileName: itemName,
                transfered: processed_items,
                total: total_items,
                isDirectory: true,
                isFetching: true
            });
        }


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
                const response = await transferItemCloudToCloud(
                    transferId,
                    item.name,
                    sourceAccountInstance,
                    targetAccountInstance,
                    sourceItemPath,
                    newTargetFolderPath,
                    abortSignal
                );
                processed_items++;
                // Call the progress callback if provided
                if (progressCallback) {
                    console.log(`YEYEYEYEYEYEYEYYEYEYEYEYEYEYEYEYEYEYEYEYEYEYEYEYEYEYEYEYEYEYEYEYEYEYEYEYEYEYEYEYEYEYEY ${processed_items}`)
                    progressCallback({
                        transferId,
                        fileName: itemName,
                        transfered: processed_items,
                        total: total_items,
                        isDirectory: true,
                        isFetching: false
                    });
                }

                return { success: true, itemName: item.name };
            } catch (error) {
                processed_items++;
                // if the current folder is the one transferrred, and this item is under that folder
                if (progressCallback) {
                    progressCallback({
                        transferId,
                        fileName: itemName,
                        transfered: processed_items,
                        total: total_items,
                        isDirectory: false,
                        isFetching: false,
                        errorItemDirectory: `${item.name}`
                    });
                } else {
                    // this is a folder under directory being transferred..
                    throw new Error(`Failed to process folder ${item.name}: skipping to next folder`);
                }

                return { success: false, itemName: item.name };
            } finally {
                // Always release semaphore, even if operation fails
                semaphore.release();
            }
        });

        // Wait for all transfers to complete
        const result = await Promise.all(transferPromises);

        // all uploads are done, some might have failed.

        // Final progress callback - directory transfer complete
        if (progressCallback) {
            const successCount = result.filter(r => r.success === true).length;
            const failCount = result.filter(r => r.success === false).length;

            const failedNames = result.filter(r => r.success === false).map(r => r.itemName).join(', ');

            progressCallback({
                transferId,
                fileName: itemName,
                transfered: total_items,
                total: total_items,
                isDirectory: true,
                isFetching: false,
            });
            console.log(`Directory transfer complete: ${itemName}`);
            console.log(`Successfully transferred ${successCount} items, failed to transfer ${failCount} items.`);
            if (failCount > 0) {
                progressCallback({
                    transferId,
                    fileName: itemName,
                    transfered: total_items,
                    total: total_items,
                    isDirectory: true,
                    isFetching: false,
                    errorItemDirectory: `Failed to process ${failCount} items: ${failedNames}`
                });
                // TODO somethign needs to be changed that the progressCallback should display the failed items.
                // Transfer Service does not delete if it includes failed items, but does not display that there is failed items.
            }
        }
        
        console.log(`Directory ${itemName} transferred successfully to ${newTargetFolderPath}`);
    } else {
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
                transfered: 0,
                total: fileSize,
                isDirectory: false,
                isFetching: true
            });
        }

        const maxQueueSize = 10 * CHUNK_SIZE; // 10 chunks, adjust as needed

        // create a read stream from the source cloud storage
        // actually maxQueueSize is not used in the current implementation as chunk is read synchronously
        const fileStream = await sourceAccountInstance.createReadStream(sourcePath, fileSize, CHUNK_SIZE, maxQueueSize);
        // create a upload session in the target cloud storage
        const type = mime.lookup(itemName) || 'application/octet-stream'; // default to binary if no mime type found
        const sessionId = await targetAccountInstance.initiateResumableUpload(itemName, type, targetPath);
        console.log(`Resumable upload session initiated: ${sessionId}`);
        // assume it returns a sessionId or upload URL
        let chunkOffset = 0;
        


        const targetFilePath = path.join(targetPath, itemName);
        const reader = fileStream.getReader();
        try {
            while (true) {
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
                    try {
                        await targetAccountInstance.uploadChunk(sessionId, chunk, chunkOffset, fileSize);
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

                // Call the progress callback if provided
                if (progressCallback) {
                    progressCallback({
                        transferId,
                        fileName: itemName,
                        transfered: chunkOffset,
                        total: fileSize,
                        isDirectory: false,
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
                            await targetAccountInstance.finishResumableUpload(sessionId, targetFilePath, fileSize);
                            console.log(`File ${itemName} uploaded successfully to ${targetFilePath}`);
                            break; // exit loop on success
                        } catch (error: any) {
                            const message = error?.message || '';
                            const status = error?.status || '';
                            console.log(`Finalizing upload for file ${itemName} failed with status: ${status}`);
                            const shouldRetry =
                                status === 429 || // Too Many Requests
                                status === 403 || // Forbidden (quota exceeded)
                                status === 500 || // Internal Server Error
                                status == 503; // Service Unavailable
                            if (shouldRetry) {
                                uploadTryCount++;
                                console.warn(`Retrying finalize upload for file ${itemName} due to error: ${status}`);
                                if (uploadTryCount >= RETRY_LIMIT) {
                                    throw new Error(`Failed to finalize upload for file ${itemName} after ${RETRY_LIMIT} attempts`);
                                }
                                await new Promise(resolve => setTimeout(resolve, 4000 * Math.pow(2, uploadTryCount)));
                            } else {
                                throw new Error(`Failed to finalize upload for file ${itemName}: ${error.message || 'Unknown error'}`);
                            }
                        }
                    }
                }
            }
        } catch (error: any) {
            console.error(`Error uploading file ${itemName}:`, error);
            if (progressCallback) {
                // skip to next file
                progressCallback({
                    transferId,
                    fileName: itemName,
                    transfered: 0,
                    total: 0, 
                    isDirectory: true,
                    isFetching: true,
                    errorItemDirectory: `Failed to process file ${itemName}: skipping to next file`
                });
                await new Promise((resolve) => setTimeout(resolve, 1000)); // wait for 1 second before throwing error
            } else {
                // this is a file moved under directory transfer..
                console.log(`Under the folder transfer, this file failed: ${itemName}`);
                throw new Error(`Failed to process file ${itemName}: skipping to next file`);
            }
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


