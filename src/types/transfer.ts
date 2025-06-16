export interface TransferItem {
  id: string;
  itemCount: number;
  currentItem: string;
  progress: number;
  error: string | null;
  isCompleted: boolean;
  startTime: number;
  keepOriginal: boolean;
  sourceDescription: string;
  targetDescription: string;
  abortController: AbortController;
  isCancelling: boolean;
}

export interface TransferQueueState {
  transfers: TransferItem[];
  nextId: number;
}
