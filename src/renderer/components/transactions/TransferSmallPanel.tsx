/**
 * TransferManager Component
 * 
 * Manages a queue of file transfers and displays their status
 */

import { useState, useEffect, useMemo } from 'react';
import { X, AlertCircle, Loader2, CheckCircle, Clock, ChevronDown, ChevronUp, Package, Maximize2, RefreshCw, CloudDownload, CloudUpload, ArrowLeftRight} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { TransferItem } from '@Types/transfer';

interface TransferManagerProps {
  transfers: TransferItem[];
  onCancelTransfer: (transferId: string) => void;
  onCloseTransfer: (transferId: string) => void;
  onRetryTransfer?: (transferId: string) => void;
  onOpenDetailView?: () => void;
  isHidden?: boolean;
  isTransferPanelOpen?: boolean; // New prop to prevent auto-removal when panel is open
}

export function TransferManager({
  transfers,
  onCancelTransfer,
  onCloseTransfer,
  onRetryTransfer,
  onOpenDetailView,
  isHidden = false,
  isTransferPanelOpen = false,
}: TransferManagerProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [estimatedTimes, setEstimatedTimes] = useState<{ [key: string]: string }>({});
  const [autoHideTimer, setAutoHideTimer] = useState<NodeJS.Timeout | null>(null);
  const [locallyHiddenTransfers, setLocallyHiddenTransfers] = useState<Set<string>>(new Set());

  // Memoize the categorized transfers to prevent infinite re-renders
  const categorizedTransfers = useMemo(() => {
    const active: TransferItem[] = [];
    const completed: TransferItem[] = [];
    const errored: TransferItem[] = [];

    // Filter out locally hidden transfers
    const visibleTransfers = transfers.filter(transfer => !locallyHiddenTransfers.has(transfer.id));

    visibleTransfers.forEach(transfer => {
      if (transfer.status == "cancelled") {
        errored.push(transfer);
      } else if (transfer.status == "completed") {
        completed.push(transfer);
      } else {
        active.push(transfer);
      }
    });

    return { active, completed, errored };
  }, [transfers, locallyHiddenTransfers]);

  const { active: activeTransfers, completed: completedTransfers, errored: errorTransfers } = categorizedTransfers;

  // Local handler for closing transfers in the manager (doesn't affect main transfer queue)
  const handleLocalCloseTransfer = (transferId: string) => {
    setLocallyHiddenTransfers(prev => new Set([...prev, transferId]));
  };

  // Clear locally hidden transfers when transfers are actually removed from the main queue
  useEffect(() => {
    const currentTransferIds = new Set(transfers.map(t => t.id));
    setLocallyHiddenTransfers(prev => {
      const filtered = new Set([...prev].filter(id => currentTransferIds.has(id)));
      return filtered.size !== prev.size ? filtered : prev;
    });
  }, [transfers]);

  // Calculate estimated times for active transfers
  useEffect(() => {
    const newEstimatedTimes: { [key: string]: string } = {};

    activeTransfers.forEach(transfer => {
      if (transfer.startTime && (transfer.progress ?? 0) > 0) {
        const elapsed = Date.now() - transfer.startTime;
        const rate = (transfer.progress ?? 0) / elapsed;
        const remaining = (100 - (transfer.progress ?? 0)) / rate;

        if (remaining > 0 && remaining < Infinity) {
          const seconds = Math.ceil(remaining / 1000);
          if (seconds < 60) {
            newEstimatedTimes[transfer.id] = `~${seconds}s remaining`;
          } else {
            const minutes = Math.ceil(seconds / 60);
            newEstimatedTimes[transfer.id] = `~${minutes}m remaining`;
          }
        }
      }
    });

    setEstimatedTimes(newEstimatedTimes);
  }, [activeTransfers]);

  // Auto-hide completed transfers after delay (but not when transfer panel is open)
  useEffect(() => {
    if (isTransferPanelOpen) {
      if (autoHideTimer) {
        clearTimeout(autoHideTimer);
        setAutoHideTimer(null);
      }
      return;
    }

    if (activeTransfers.length === 0 && completedTransfers.length > 0 && errorTransfers.length === 0) {
      // Clear any existing timer
      if (autoHideTimer) {
        clearTimeout(autoHideTimer);
      }
      
      // Set new timer to auto-hide completed transfers locally after 10 seconds
      const timer = setTimeout(() => {
        // Hide completed transfers locally in the manager instead of removing from main queue
        const currentCompletedIds = completedTransfers.map(t => t.id);
        setLocallyHiddenTransfers(prev => {
          const newHidden = new Set([...prev]);
          currentCompletedIds.forEach(transferId => {
            const currentTransfer = transfers.find(t => t.id === transferId);
            if (currentTransfer && currentTransfer.status == "completed") {
              newHidden.add(transferId);
            }
          });
          return newHidden;
        });
      }, 10000); // Increased to 10 seconds for better user experience
      
      setAutoHideTimer(timer);
    } else {
      // Clear timer if there are active transfers or errors
      if (autoHideTimer) {
        clearTimeout(autoHideTimer);
        setAutoHideTimer(null);
      }
    }
    
    return () => {
      if (autoHideTimer) {
        clearTimeout(autoHideTimer);
      }
    };
  }, [activeTransfers.length, completedTransfers.length, errorTransfers.length, transfers, onCloseTransfer, isTransferPanelOpen]);

  // Auto-collapse when no active transfers
  useEffect(() => {
    if (activeTransfers.length === 0 && completedTransfers.length === 0 && errorTransfers.length === 0) {
      setIsCollapsed(false);
    }
  }, [activeTransfers.length, completedTransfers.length, errorTransfers.length]);

  // Check if there are any visible transfers (after filtering out locally hidden ones)
  const visibleTransfersCount = activeTransfers.length + completedTransfers.length + errorTransfers.length;
  if (transfers.length === 0 || isHidden || visibleTransfersCount === 0) return null;

  const renderTransferItem = (transfer: TransferItem) => {
    const getStatusIcon = () => {
      if (transfer.status === "cancelled") return <AlertCircle className="h-7 w-7 text-red-500 animate-pulse" />;
      if (transfer.status === "completed") return <CheckCircle className="h-7 w-7 text-green-500 animate-pulse" />;
      if (transfer.status === "downloading") return <CloudDownload className="h-7 w-7 text-blue-500 animate-bounce" />;
      if (transfer.status === "uploading") return <CloudUpload className="h-7 w-7 text-orange-500 animate-bounce" />;
      if (transfer.status === "moving") return <ArrowLeftRight className="h-7 w-7 text-indigo-500 animate-pulse" />;
      if (transfer.status === "copying") return <ArrowLeftRight className="h-7 w-7 text-teal-500 animate-pulse" />;
      return <Loader2 className="h-7 w-7 text-purple-500 animate-spin" />;
    };

    const getStatusText = () => {
      if (transfer.status === "cancelled") {
        if (transfer.failedFiles && transfer.failedFiles.length > 1) {
          return `Partial (${transfer.completedFiles?.length}/${transfer.itemCount})`;
        }
        return "Failed";
      }
      if (transfer.status === "completed") return "Completed";
      
      return `${Math.round(transfer.progress ?? 0)}%`;
    };    
    
    const getProgressText = () => {
      if (transfer.status === "completed") {
        return `Completed ${transfer.completedFiles?.length} of ${transfer.itemCount} items`;
      }
      const truncatedName = transfer.currentItem && transfer.currentItem.length > 25 
        ? `...${transfer.currentItem.slice(-22)}`
        : transfer.currentItem;
      return truncatedName;
    };

    return (
      <div key={transfer.id} className={cn(
        "border-l-4 pl-3 py-2 space-y-1",
        transfer.status === "cancelled" ? "border-red-500 bg-red-50/50 dark:bg-red-900/10" :
        transfer.status === "completed" ? "border-green-500 bg-green-50/50 dark:bg-green-900/10" :
        transfer.status === "downloading" ? "border-blue-500 bg-blue-50/50 dark:bg-blue-900/10" :
        transfer.status === "uploading" ? "border-orange-500 bg-orange-50/50 dark:bg-orange-900/10" :
        transfer.status === "moving" ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10" :
        transfer.status === "copying" ? "border-teal-500 bg-teal-50/50 dark:bg-teal-900/10" :
        "border-purple-500 bg-purple-50/50 dark:bg-purple-900/10" //fetching
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {getStatusIcon()}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                <span className="truncate">{transfer.sourceStorageType}</span>
                <span>→</span>
                <span className="truncate">{transfer.targetStorageType}</span>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300 truncate">
                {getProgressText()}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 ml-2">
            <span className={cn(
              "text-xs font-medium px-2 py-1 rounded-full",
              transfer.status === "cancelled" ? "text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/30" :
              transfer.status === "completed" ? "text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/30" :
              transfer.status === "downloading" ? "text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/30" :
              transfer.status === "uploading" ? "text-orange-700 bg-orange-100 dark:text-orange-300 dark:bg-orange-900/30" :
              transfer.status === "moving" ? "text-indigo-700 bg-indigo-100 dark:text-indigo-300 dark:bg-indigo-900/30" : //PENDING color
              transfer.status === "copying" ? "text-teal-700 bg-teal-100 dark:text-teal300 dark:bg-teal-900/30" :
              "text-purple-700 bg-purple-100 dark:text-purple-300 dark:bg-purple-900/30"
            )}>
              {getStatusText()}
            </span>
            
            {transfer.status === "cancelled" || transfer.status === "completed" ? (
              <div className="flex items-center gap-1">
                {transfer.status === "cancelled"&& onRetryTransfer && (
                  <Button
                    onClick={() => onRetryTransfer(transfer.id)}
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-slate-100 dark:hover:bg-slate-700"
                    title="Retry transfer"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                )}
                <Button
                  onClick={() => handleLocalCloseTransfer(transfer.id)}
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-slate-100 dark:hover:bg-slate-700"
                  title="Hide from manager"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => onCancelTransfer(transfer.id)}
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {(transfer.status !== "completed" && (transfer.progress ?? 0) >= 0 && (
          <div className="space-y-1">
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
              <div 
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300 ease-out",
                  transfer.status === "cancelled" ? 
                    "bg-gradient-to-r from-red-500 to-red-600" : 
                  transfer.status === "uploading" ?
                    "bg-gradient-to-r from-orange-400 to-orange-500" : 
                  transfer.status === "downloading" ?
                    "bg-gradient-to-r from-blue-400 to-blue-500" :  
                  transfer.status === "moving" ?
                    "bg-gradient-to-r from-indigo-400 to-indigo-500" :
                  transfer.status === "copying" ?
                    "bg-gradient-to-r from-teal-400 to-teal-500" :
                    "bg-gradient-to-r from-purple-500 to-purple-600" //Fetching
                )}
                style={{ width: `${Math.min(100, Math.max(0, transfer.progress ?? 0))}%` }}
              />
            </div>
            {transfer.cancelledMessage && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {transfer.cancelledMessage}
                </p>)}
            <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
              <div className={cn("flex", transfer.isCurrentDirectory ? "flex-col" : "items-center gap-2")}>
                {transfer.isCurrentDirectory && (
                  <span>
                    Item from directory: {transfer.directoryName}
                  </span>
                )}
                {transfer.itemCount > 1 && transfer.status !== "cancelled" && (
                  <span>
                    Completed {transfer.completedFiles?.length} of {transfer.itemCount} Items
                  </span>
                )}
                {estimatedTimes[transfer.id] && transfer.status !== "cancelled" && (
                  <>
                    {transfer.itemCount > 1 && !transfer.isCurrentDirectory && <span>•</span>}
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{estimatedTimes[transfer.id]}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const totalTransfers = transfers.length;
  const hasActiveTransfers = activeTransfers.length > 0;

  return (
    <div className={cn(
      "select-none fixed bottom-32 right-0 bg-white/95 dark:bg-slate-800/95 border-l border-t border-b border-slate-200 dark:border-slate-700",
      "rounded-l-xl shadow-xl backdrop-blur-sm overflow-hidden",
      "animate-in fade-in-0 slide-in-from-right-3 duration-300",
      "min-w-[350px] max-w-[450px]",
      "backdrop-saturate-150"
    )}
    style={{ zIndex: 99999 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-700 cursor-pointer bg-blue-50 dark:bg-blue-900/20"  
      onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-3">
          <Package className="h-5 w-5 text-blue-500"/>
          <div>
            <h3 className="font-semibold text-sm text-blue-700 dark:text-blue-300">
              File Transfers
            </h3>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Expand to detail view button */}
          {onOpenDetailView && totalTransfers > 0 && (
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetailView();
              }}
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-700"
              title="Open detailed view"
            >
              <Maximize2 className="h-3 w-3 mr-1" />
              Details
            </Button>
          )}
          
          {totalTransfers > 1 && (
            <Button
              onClick={(e) => {
                e.stopPropagation();
                // Hide completed and failed transfers locally instead of removing from main queue
                const transfersToHide = transfers
                  .filter(transfer => transfer.status === "completed" || transfer.status === "cancelled")
                  .map(transfer => transfer.id);
                
                setLocallyHiddenTransfers(prev => {
                  const newHidden = new Set([...prev, ...transfersToHide]);
                  return newHidden;
                });
              }}
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-700"
              title="Hide completed and failed transfers"
            >
              Clear All
            </Button>
          )}
          {isCollapsed ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </div>
      </div>

      {/* Transfer List */}
      {!isCollapsed && (
        <div className="max-h-80 overflow-y-auto p-3 space-y-2">
          {/* Render all transfers in a single list to avoid key conflicts */}
          {[...activeTransfers, ...errorTransfers.slice().reverse(), ...completedTransfers.slice().reverse()].map(transfer => 
            renderTransferItem(transfer)
          )}
        </div>
      )}

      {/* Progress indicator */}
      {hasActiveTransfers && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 opacity-80 overflow-hidden">
          <div className="h-full w-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
        </div>
      )}
    </div>
  );
}
