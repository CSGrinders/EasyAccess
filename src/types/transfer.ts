/**
 * Type definitions for file transfer operations and queue management
 * Handles transfer state, progress tracking, and error handling
 */

import { CloudType } from "./cloudType";

/**
 * Represents a single file transfer operation with progress tracking and error handling
 */
export interface TransferItem {
  /** Unique identifier for the transfer operation */
  id: string;
  /** Name of the currently processing item */
  currentItem?: string;
  /** Transfer progress as a percentage (0-100) */
  progress?: number;
  /** Get the transfer status */
  status: "completed" | "fetching" | "cancelled" | "uploading" | "downloading" | "moving" | "copying" | "error";
  /** Error message if the transfer failed, null if successful */
  cancelledMessage?: string;
  /** Timestamp when the transfer operation started */
  startTime: number;
  /** Timestamp when the transfer operation completed */
  endTime?: number;
  /** Whether to keep the original files after transfer */
  keepOriginal: boolean;
  /** StorageName of the source location */
  sourceStorageType: CloudType
  /* Accountid of the source location if it is a cloud */
  sourceAccountId: string;
  /**  Storage Name of the target location */
  targetStorageType: CloudType;
  /* Accountid of the target location if it is a cloud */
  targetAccountId: string;
  /** Total number of items to be transferred */
  itemCount: number;
  /** List of all files included in the transfer operation */
  fileList?: string[];
  /** List of files that have been successfully transferred */
  completedFiles?: string[];
  /** List of files that failed to transfer with their error messages */
  failedFiles?: { file: string; error: string }[];
}

/**
 * State container for managing the transfer queue and generating unique IDs
 */
export interface TransferQueueState {
  /** Array of all transfer operations in the queue */
  transfers: TransferItem[];
  /** Counter for generating unique transfer IDs */
  nextId: number;
}
