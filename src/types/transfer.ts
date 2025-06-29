/**
 * Type definitions for file transfer operations and queue management
 * Handles transfer state, progress tracking, and error handling
 */

/**
 * Represents a single file transfer operation with progress tracking and error handling
 */
export interface TransferItem {
  /** Unique identifier for the transfer operation */
  id: string;
  /** Total number of items to be transferred */
  itemCount: number;
  /** Name of the currently processing item */
  currentItem: string;
  /** Transfer progress as a percentage (0-100) */
  progress: number;
  /** Error message if the transfer failed, null if successful */
  error: string | null;
  /** Whether the transfer has completed (successfully or with errors) */
  isCompleted: boolean;
  /** Timestamp when the transfer operation started */
  startTime: number;
  /** Whether to keep the original files after transfer */
  keepOriginal: boolean;
  /** Human-readable description of the source location */
  sourceDescription: string;
  /** Human-readable description of the target location */
  targetDescription: string;
  /** Controller for aborting the transfer operation */
  abortController: AbortController;
  /** Whether the transfer is currently being cancelled */
  isCancelling: boolean;
  /** Whether the transfer is currently downloading files */
  isDownloading?: boolean;
  /** Whether the transfer is currently uploading files */
  isUploading?: boolean;
  /** List of all files included in the transfer operation */
  fileList?: string[];
  /** List of files that have been successfully transferred */
  completedFiles?: string[];
  /** List of files that failed to transfer with their error messages */
  failedFiles?: { file: string; error: string }[];
  /** Timestamp when the transfer operation completed */
  endTime?: number;
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
