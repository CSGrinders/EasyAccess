import { file } from "googleapis/build/src/apis/file";
import { CLOUD_HOME, CloudType } from "../../types/cloudType";
import { StoredAccounts } from "../cloud/cloudManager";
import mime from "mime-types";
import { progressCallbackData } from "../../types/transfer";


export async function transferManager(transferInfo: any, progressCallback: (data: progressCallbackData) => void, abortSignal?: AbortSignal): Promise<void> {
    // This function will handle the transfer operations based on the provided transferInfo
    // It will determine the source and target cloud types and accounts, and perform the transfer accordingly

    const { transferId, fileName, sourcePath, sourceCloudType, sourceAccountId, targetCloudType, targetAccountId, targetPath } = transferInfo;

    const isSourceLocal = !sourceCloudType || !sourceAccountId;

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
            await transferLocalToCloudUpload(transferId, fileName, sourcePath, targetCloudType, targetAccountId, targetPath, progressCallback, abortSignal);
        } else {

        }
        
    } catch (error) {
        console.error("Transfer failed:", error);
        throw new Error(`Transfer failed: ${error}`);
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


