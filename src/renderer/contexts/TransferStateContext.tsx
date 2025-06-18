/**
 * TransferStateContext
 * 
 * Provides a centralized way to track files currently being transferred.
 * This allows the UI to show files in a disabled/transferring state 
 * instead of immediately refreshing file explorers.
 */

import React, { createContext, useContext, useState, useCallback, ReactNode, useRef } from 'react';
import { CloudType } from '@Types/cloudType';

/** Information about a file currently being transferred */
export interface TransferringFile {
    /** Full path of the file */
    path: string;
    /** Filename for display */
    name: string;
    /** Source cloud type (null for local files) */
    sourceCloudType?: CloudType | null;
    /** Source account ID (null for local files) */
    sourceAccountId?: string | null;
    /** Target cloud type (null for local files) */
    targetCloudType?: CloudType | null;
    /** Target account ID (null for local files) */
    targetAccountId?: string | null;
    /** Transfer ID for tracking */
    transferId: string;
    /** Whether this is a move operation (file should disappear from source) */
    isMove: boolean;
}

/** Context interface for managing transfer state */
export interface TransferStateContextType {
    /** Map of file keys to transfer info */
    transferringFiles: Map<string, TransferringFile>;
    
    /** Add files to the transferring state */
    addTransferringFiles: (files: TransferringFile[]) => void;
    
    /** Remove files from transferring state (when transfer completes/fails) */
    removeTransferringFiles: (transferId: string) => void;
    
    /** Check if a specific file is being transferred */
    isFileTransferring: (path: string, cloudType?: CloudType | null, accountId?: string | null) => boolean;
    
    /** Get transfer info for a specific file */
    getFileTransferInfo: (path: string, cloudType?: CloudType | null, accountId?: string | null) => TransferringFile | null;
    
    /** Get all files being transferred from a specific source */
    getTransferringFilesFromSource: (cloudType?: CloudType | null, accountId?: string | null) => TransferringFile[];
}

/** Create the context with null as default */
const TransferStateContext = createContext<TransferStateContextType | null>(null);

/** Hook for components to access transfer state */
export const useTransferState = () => {
    const context = useContext(TransferStateContext);
    if (!context) {
        throw new Error('useTransferState must be used within a TransferStateProvider');
    }
    return context;
};

interface TransferStateProviderProps {
    children: ReactNode;
}

export const TransferStateProvider = ({ children }: TransferStateProviderProps) => {
    
    /** Map to store files currently being transferred, keyed by unique file identifier */
    const [transferringFiles, setTransferringFiles] = useState<Map<string, TransferringFile>>(new Map());
    
    /** Generate a unique key for a file based on its path and source */
    const generateFileKey = useCallback((path: string, cloudType?: CloudType | null, accountId?: string | null): string => {
        const cloudKey = cloudType || 'local';
        const accountKey = accountId || 'local';
        return `${cloudKey}:${accountKey}:${path}`;
    }, []);
    
    /** Add files to the transferring state */
    const addTransferringFiles = useCallback((files: TransferringFile[]) => {
        setTransferringFiles(prev => {
            const newMap = new Map(prev);
            files.forEach(file => {
                const key = generateFileKey(file.path, file.sourceCloudType, file.sourceAccountId);
                newMap.set(key, file);
            });
            return newMap;
        });
    }, [generateFileKey]);
    
    /** Remove files from transferring state by transfer ID */
    const removeTransferringFiles = useCallback((transferId: string) => {
        setTransferringFiles(prev => {
            const newMap = new Map(prev);
            // Remove all files with the matching transfer ID
            for (const [key, file] of newMap.entries()) {
                if (file.transferId === transferId) {
                    newMap.delete(key);
                }
            }
            return newMap;
        });
    }, []);
    
    /** Check if a specific file is being transferred */
    const isFileTransferring = useCallback((path: string, cloudType?: CloudType | null, accountId?: string | null): boolean => {
        const key = generateFileKey(path, cloudType, accountId);
        return transferringFiles.has(key);
    }, [transferringFiles, generateFileKey]);
    
    /** Get transfer info for a specific file */
    const getFileTransferInfo = useCallback((path: string, cloudType?: CloudType | null, accountId?: string | null): TransferringFile | null => {
        const key = generateFileKey(path, cloudType, accountId);
        return transferringFiles.get(key) || null;
    }, [transferringFiles, generateFileKey]);
    
    /** Get all files being transferred from a specific source */
    const getTransferringFilesFromSource = useCallback((cloudType?: CloudType | null, accountId?: string | null): TransferringFile[] => {
        const result: TransferringFile[] = [];
        for (const file of transferringFiles.values()) {
            if (file.sourceCloudType === cloudType && file.sourceAccountId === accountId) {
                result.push(file);
            }
        }
        return result;
    }, [transferringFiles]);
    
    const contextValue: TransferStateContextType = {
        transferringFiles,
        addTransferringFiles,
        removeTransferringFiles,
        isFileTransferring,
        getFileTransferInfo,
        getTransferringFilesFromSource,
    };

    return (
        <TransferStateContext.Provider value={contextValue}>
            {children}
        </TransferStateContext.Provider>
    );
};
