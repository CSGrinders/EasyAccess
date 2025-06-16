/**
 * TransferManager Component
 * 
 * Manages a queue of file transfers and displays their status
 */

import React, { useState, useEffect, useMemo } from 'react';
import { X, AlertCircle, Loader2, CheckCircle, Clock, ChevronDown, ChevronUp, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { TransferItem } from '@Types/transfer';

interface TransferManagerProps {
  transfers: TransferItem[];
  onCancelTransfer: (transferId: string) => void;
  onCloseTransfer: (transferId: string) => void;
}

export function TransferManager({
  transfers,
  onCancelTransfer,
  onCloseTransfer,
}: TransferManagerProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [estimatedTimes, setEstimatedTimes] = useState<{ [key: string]: string }>({});

  // Memoize the categorized transfers to prevent infinite re-renders
  const categorizedTransfers = useMemo(() => {
    const active: TransferItem[] = [];
    const completed: TransferItem[] = [];
    const errored: TransferItem[] = [];

    transfers.forEach(transfer => {
      if (transfer.error) {
        errored.push(transfer);
      } else if (transfer.isCompleted) {
        completed.push(transfer);
      } else {
        active.push(transfer);
      }
    });

    return { active, completed, errored };
  }, [transfers]);

  const { active: activeTransfers, completed: completedTransfers, errored: errorTransfers } = categorizedTransfers;

  // Calculate estimated times for active transfers
  useEffect(() => {
    const newEstimatedTimes: { [key: string]: string } = {};

    activeTransfers.forEach(transfer => {
      if (transfer.startTime && transfer.progress > 0) {
        const elapsed = Date.now() - transfer.startTime;
        const rate = transfer.progress / elapsed;
        const remaining = (100 - transfer.progress) / rate;

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

  // Auto-collapse when no active transfers
  useEffect(() => {
    if (activeTransfers.length === 0 && completedTransfers.length === 0 && errorTransfers.length === 0) {
      setIsCollapsed(false);
    }
  }, [activeTransfers.length, completedTransfers.length, errorTransfers.length]);

  if (transfers.length === 0) return null;

  const renderTransferItem = (transfer: TransferItem) => {
    const getStatusIcon = () => {
      if (transfer.error) return <AlertCircle className="h-4 w-4 text-red-500" />;
      if (transfer.isCompleted) return <CheckCircle className="h-4 w-4 text-green-500" />;
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    };

    const getStatusText = () => {
      if (transfer.error) return "Failed";
      if (transfer.isCompleted) return "Completed";
      if (transfer.isCancelling) return "Cancelling...";
      return `${Math.round(transfer.progress)}%`;
    };

    const getProgressText = () => {
      if (transfer.error) return transfer.error;
      if (transfer.isCompleted) return `${transfer.keepOriginal ? 'Copied' : 'Moved'} ${transfer.itemCount} file${transfer.itemCount > 1 ? 's' : ''} successfully`;
      
      const truncatedName = transfer.currentItem.length > 25 
        ? `...${transfer.currentItem.slice(-22)}` 
        : transfer.currentItem;
      return truncatedName || "Preparing...";
    };

    return (
      <div key={transfer.id} className={cn(
        "border-l-4 pl-3 py-2 space-y-1",
        transfer.error ? "border-red-500 bg-red-50/50 dark:bg-red-900/10" :
        transfer.isCompleted ? "border-green-500 bg-green-50/50 dark:bg-green-900/10" :
        "border-blue-500 bg-blue-50/50 dark:bg-blue-900/10"
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {getStatusIcon()}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                <span className="truncate">{transfer.sourceDescription}</span>
                <span>→</span>
                <span className="truncate">{transfer.targetDescription}</span>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300 truncate">
                {getProgressText()}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 ml-2">
            <span className={cn(
              "text-xs font-medium px-2 py-1 rounded-full",
              transfer.error ? "text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/30" :
              transfer.isCompleted ? "text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/30" :
              "text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/30"
            )}>
              {getStatusText()}
            </span>
            
            {transfer.error || transfer.isCompleted ? (
              <Button
                onClick={() => onCloseTransfer(transfer.id)}
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <X className="h-3 w-3" />
              </Button>
            ) : !transfer.isCancelling && (
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

        {!transfer.error && !transfer.isCompleted && transfer.progress > 0 && (
          <div className="space-y-1">
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-blue-500 to-blue-600 h-1.5 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${Math.min(100, Math.max(0, transfer.progress))}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-2">
                {transfer.itemCount > 1 && (
                  <span>{Math.round((transfer.progress / 100) * transfer.itemCount)} of {transfer.itemCount} files</span>
                )}
                {estimatedTimes[transfer.id] && (
                  <>
                    {transfer.itemCount > 1 && <span>•</span>}
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{estimatedTimes[transfer.id]}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const totalTransfers = transfers.length;
  const hasActiveTransfers = activeTransfers.length > 0;

  return (
    <div className={cn(
      "select-none fixed bottom-6 right-6 bg-white/95 dark:bg-slate-800/95 border border-slate-200 dark:border-slate-700",
      "rounded-xl shadow-xl backdrop-blur-sm overflow-hidden",
      "animate-in fade-in-0 slide-in-from-bottom-3 duration-300",
      "min-w-[350px] max-w-[450px]",
      "backdrop-saturate-150"
    )}
    style={{ zIndex: 99999 }}
    >
      {/* Header */}
      <div className={cn(
        "flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-700 cursor-pointer",
        hasActiveTransfers ? "bg-blue-50 dark:bg-blue-900/20" : 
        errorTransfers.length > 0 ? "bg-red-50 dark:bg-red-900/20" :
        "bg-green-50 dark:bg-green-900/20"
      )}
      onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-3">
          <Package className={cn(
            "h-5 w-5",
            hasActiveTransfers ? "text-blue-500" :
            errorTransfers.length > 0 ? "text-red-500" :
            "text-green-500"
          )} />
          <div>
            <h3 className={cn(
              "font-semibold text-sm",
              hasActiveTransfers ? "text-blue-700 dark:text-blue-300" :
              errorTransfers.length > 0 ? "text-red-700 dark:text-red-300" :
              "text-green-700 dark:text-green-300"
            )}>
              File Transfers ({totalTransfers})
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {hasActiveTransfers ? `${activeTransfers.length} active` :
               errorTransfers.length > 0 ? `${errorTransfers.length} failed` :
               `${completedTransfers.length} completed`}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {totalTransfers > 1 && (
            <Button
              onClick={(e) => {
                e.stopPropagation();
                transfers.forEach(transfer => {
                  if (transfer.isCompleted || transfer.error) {
                    onCloseTransfer(transfer.id);
                  }
                });
              }}
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-700"
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
          {[...activeTransfers, ...errorTransfers, ...completedTransfers].map(transfer => 
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
