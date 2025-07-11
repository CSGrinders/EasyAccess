import { file } from "googleapis/build/src/apis/file";
import { CLOUD_HOME, CloudType } from "../../types/cloudType";
import { StoredAccounts } from "../cloud/cloudManager";
import mime from "mime-types";
import { progressCallbackData } from "../../types/transfer";
import { CloudStorage } from "../cloud/cloudStorage";
import path from "path";


export async function transferManager(transferInfo: any, progressCallback: (data: progressCallbackData) => void, abortSignal?: AbortSignal): Promise<void> {
    // This function will handle the transfer operations based on the provided transferInfo
    // It will determine the source and target cloud types and accounts, and perform the transfer accordingly

    const { transferId, fileName, sourcePath, sourceCloudType, sourceAccountId, targetCloudType, targetAccountId, targetPath } = transferInfo;

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
            } else {
                // Handle cloud to cloud transfer
                await transferCloudToCloud(transferId, fileName, sourceCloudType, sourceAccountId, targetCloudType, targetAccountId, sourcePath, targetPath, progressCallback, abortSignal);
            }
        }
        
    } catch (error) {
        console.error("Transfer failed:", error);
        throw new Error(`Transfer failed: ${error}`);
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
        progressCallback,
        abortSignal
    );
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
    progressCallback?: (data: progressCallbackData) => void,
    abortSignal?: AbortSignal
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
        await targetAccountInstance.createDirectory(newTargetFolderPath);

        // Notify progress for the directory creation
        if (progressCallback) {
            progressCallback({
                transferId,
                fileName: itemName,
                transfered: 1,
                total: 1,
                isDirectory: true,
                isFetching: false
            });
        }
        // Read the source directory and get all items
        const items = await sourceAccountInstance.readDir(sourcePath);
        
        console.log(`Transferring directory: ${sourcePath} to ${newTargetFolderPath}`);
        // Iterate through each item in the source directory
        for (const item of items) {
            if (abortSignal?.aborted) {
                console.warn(`Transfer aborted for ${itemName}`);
                console.log(`Stopping further processing of items in directory: ${sourcePath}`);
                // If the transfer is aborted, stop processing further items
                throw new Error(`User cancelled transfer`);
            }
            const sourceItemPath = path.join(sourcePath, item.name);
            
            // Recursively transfer each item
            await transferItemCloudToCloud(
                transferId,
                item.name,
                sourceAccountInstance,
                targetAccountInstance,
                sourceItemPath,
                newTargetFolderPath,
                progressCallback,
                abortSignal
            );
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
                console.log(`Uploading chunk of size: ${chunk.length} bytes at offset: ${chunkOffset}`);
                // upload the chunk to the target cloud storage with sessionId or upload URL
                // targetPath + itemName is the target file path in the target cloud storage
                // upload(sessionId, chunk, chunkOffset, fileSize, targetPath, itemName, progressCallback, abortSignal);
                await targetAccountInstance.uploadChunk(sessionId, chunk, chunkOffset, fileSize);
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
                    await targetAccountInstance.finishResumableUpload(sessionId, targetFilePath, fileSize);
                }
            }
        } catch (error: any) {
            if (progressCallback) {
                progressCallback({
                    transferId,
                    fileName: itemName,
                    transfered: 0,
                    total: 0, 
                    isDirectory: true,
                    isFetching: true,
                    errorItemDirectory: `Failed to process file ${itemName}: skipping to next file`
                });
            }
            await new Promise((resolve) => setTimeout(resolve, 1000)); // wait for 1 second before throwing error
            // skip to next file
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


