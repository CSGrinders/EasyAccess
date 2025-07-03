/**
 * TransferDetailPanel Component
 * 
 * A full-screen panel showing comprehensive transfer information
 * Similar to SettingsPanel but for file transfers
 */

import React, { useState, useMemo } from 'react';
import { 
  X, 
  AlertCircle, 
  Loader2, 
  CheckCircle, 
  Clock, 
  Package,
  FileText,
  FolderOpen,
  Download,
  Upload,
  Trash2,
  RotateCcw,
  ArrowRight
, ArrowLeftRight,
  CloudDownload,
  CloudUpload
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TransferItem } from '@Types/transfer';

interface TransferDetailPanelProps {
  className?: string;
  transfers: TransferItem[];
  onCancelTransfer: (transferId: string) => void;
  onCloseTransfer: (transferId: string) => void;
  onRetryTransfer?: (transferId: string) => void;
}

export function TransferDetailPanel({
  className,
  transfers,
  onCancelTransfer,
  onCloseTransfer,
  onRetryTransfer,
}: TransferDetailPanelProps) {
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'active' | 'completed' | 'failed'>('all');

  // Categorize transfers
  const categorizedTransfers = useMemo(() => {
    const active: TransferItem[] = [];
    const completed: TransferItem[] = [];
    const failed: TransferItem[] = [];

    transfers.forEach(transfer => {
      if (transfer.status === "cancelled") {
        failed.push(transfer);
      } else if (transfer.status === "completed") {
        completed.push(transfer);
      } else {
        active.push(transfer);
      }
    });

    return { active, completed, failed, all: transfers };
  }, [transfers]);

  const getCurrentTransfers = () => {
    return categorizedTransfers[selectedCategory] || [];
  };

  const getStatusIcon = (transfer: TransferItem) => {
    if (transfer.status === "cancelled") return <AlertCircle className="h-7 w-7 text-red-500 animate-pulse" />;
    if (transfer.status === "completed") return <CheckCircle className="h-7 w-7 text-green-500 animate-pulse" />;
    if (transfer.status === "downloading") return <CloudDownload className="h-7 w-7 text-blue-500 animate-bounce" />;
    if (transfer.status === "uploading") return <CloudUpload className="h-7 w-7 text-orange-500 animate-bounce" />;
    if (transfer.status === "moving") return <ArrowLeftRight className="h-7 w-7 text-purple-500 animate-pulse" />;
    if (transfer.status === "copying") return <ArrowLeftRight className="h-7 w-7 text-purple-500 animate-pulse" />;
    return <Loader2 className="h-7 w-7 text-purple-500 animate-spin" />;
  };

  const getTransferOperationText = (transfer: TransferItem) => {
    if (transfer.status === "cancelled") return "Cancelled";
    if (transfer.status === "completed") return "Completed";
    if (transfer.status === "downloading") return "Downloading";
    if (transfer.status === "uploading") return "Uploading";
    if (transfer.status === "moving") return "Moving";
    if (transfer.status === "copying") return "Copying";
    return "Fetching";
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (startTime: number, endTime?: number) => {
    const end = endTime || Date.now();
    const duration = end - startTime;
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  return (
    <div className={`select-none flex flex-col h-full ${className}`}>
      <div className="flex-shrink-0 p-6 pb-4 space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Package className="h-8 w-8 text-blue-500" />
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Transfer Manager</h1>
              <p className="text-slate-600 dark:text-slate-400">
                Monitor and manage your transfers
              </p>
            </div>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="select-none flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 max-w-md">
          {[
            { key: 'all', label: 'All', count: categorizedTransfers.all.length },
            { key: 'active', label: 'Active', count: categorizedTransfers.active.length },
            { key: 'completed', label: 'Done', count: categorizedTransfers.completed.length },
            { key: 'failed', label: 'Failed', count: categorizedTransfers.failed.length },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setSelectedCategory(key as any)}
              className={cn(
                "flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors",
                selectedCategory === key
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              )}
            >
              {label} {count > 0 && `(${count})`}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto px-6">
        {/* Transfer List */}
        <div className="select-none space-y-4 pb-4">
          {getCurrentTransfers().length === 0 ? (
            <Card className="p-8 text-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <Package className="h-16 w-16 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">
                No {selectedCategory !== 'all' ? selectedCategory : ''} transfers
              </h3>
              <p className="text-slate-500 dark:text-slate-400">
                {selectedCategory === 'all' 
                  ? 'Transfer files between storage locations to see them here.'
                  : `No ${selectedCategory} transfers at the moment.`
                }
              </p>
            </Card>
          ) : (
            <div className="select-none grid gap-4">
              {getCurrentTransfers().map(transfer => renderTransferCard(transfer))}
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      {transfers.length > 0 && (
        <div className="flex-shrink-0 p-6 pt-4">
          <Card className="select-none p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-600 dark:text-slate-400">
                {transfers.length} total transfer{transfers.length !== 1 ? 's' : ''}
              </div>
              <Button
                onClick={() => {
                  transfers.forEach(transfer => {
                    if (transfer.status === "completed" || transfer.status === "cancelled") {
                      onCloseTransfer(transfer.id);
                    }
                  });
                }}
                variant="outline"
                size="sm"
              >
                Clear Completed & Failed
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );

  function renderTransferCard(transfer: TransferItem) {
    return (
      <div
        key={transfer.id}
        className={cn(
          "bg-white dark:bg-slate-800 border rounded-xl p-5 space-y-4 shadow-sm hover:shadow-md transition-all duration-200",
          transfer.status === "cancelled" && "border-red-200 dark:border-red-800 bg-gradient-to-br from-red-50/50 to-white dark:from-red-900/10 dark:to-slate-800",
          transfer.status === "completed" && "border-green-200 dark:border-green-800 bg-gradient-to-br from-green-50/50 to-white dark:from-green-900/10 dark:to-slate-800",
          transfer.status === "downloading" && "border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50/50 to-white dark:from-blue-900/10 dark:to-slate-800",
          transfer.status === "uploading" && "border-orange-200 dark:border-orange-800 bg-gradient-to-br from-orange-50/50 to-white dark:from-orange-900/10 dark:to-slate-800",
          transfer.status === "moving" && "border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50/50 to-white dark:from-purple-900/10 dark:to-slate-800", // TO CHOOSE
          transfer.status === "copying" && "border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50/50 to-white dark:from-purple-900/10 dark:to-slate-800 ", // TO CHOOSE
          transfer.status === "fetching" && "border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50/50 to-white dark:from-purple-900/10 dark:to-slate-800"
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {getStatusIcon(transfer)}
            <div className="min-w-0 flex-1">
                <span className={cn(
                  "text-sm font-medium",
                  transfer.status === "cancelled" ? "text-red-700 dark:text-red-300" :
                  transfer.status === "completed" ? "text-green-700 dark:text-green-300" :
                  transfer.status === "downloading" ? "text-blue-700 dark:text-blue-300" :
                  transfer.status === "uploading" ? "text-orange-700 dark:text-orange-300" :
                  transfer.status === "moving" ? "text-purple-700 dark:text-purple-300" :
                  transfer.status === "copying" ? "text-purple-700 dark:text-purple-300" :
                  transfer.status === "fetching" ? "text-purple-700 dark:text-purple-300" :
                  "text-blue-700 dark:text-blue-300"
                )}>
                  {getTransferOperationText(transfer)} {transfer.itemCount} Item{transfer.itemCount > 1 ? 's' : ''} {transfer.isCurrentDirectory && `from directory ${transfer.directoryName}`}
                  {/* Show file name for single file transfers */}
                  {transfer.itemCount === 1 && (() => {
                    // Try to get the file name from various sources
                      return <span className="text-slate-600 dark:text-slate-400 font-normal">: {transfer.currentItem}</span>
                  })()}
                </span>
              
              <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                <div className="flex flex-col">
                  <div className="flex flex-row items-center gap-2">
                    <span className="font-medium">To:</span>
                    <span className="truncate">{transfer.sourceStorageType}</span>
                    <span className={cn(
                      "text-sm font-medium",
                      transfer.status === "cancelled" ? "text-red-700 dark:text-red-300" :
                      transfer.status === "completed" ? "text-green-700 dark:text-green-300" :
                      transfer.status === "downloading" ? "text-blue-700 dark:text-blue-300" :
                      transfer.status === "uploading" ? "text-orange-700 dark:text-orange-300" :
                      transfer.status === "moving" ? "text-purple-700 dark:text-purple-300" :
                      transfer.status === "copying" ? "text-purple-700 dark:text-purple-300" :
                      transfer.status === "fetching" ? "text-purple-700 dark:text-purple-300" :
                      "text-blue-700 dark:text-blue-300"
                    )}>
                      {transfer.sourceAccountId}
                    </span>
                  </div>
                    {transfer.sourcePath && (
                      <span className="text-xs text-slate-600 dark:text-slate-400 pl-6">{`${transfer.sourcePath}`}</span>
                    )}
                </div>
                <div className="flex flex-col">
                  <div className="flex flex-row items-center gap-2">
                    <span className="font-medium">To:</span>
                    <span className="truncate">{transfer.targetStorageType}</span>
                    <span className={cn(
                      "text-sm font-medium",
                      transfer.status === "cancelled" ? "text-red-700 dark:text-red-300" :
                      transfer.status === "completed" ? "text-green-700 dark:text-green-300" :
                      transfer.status === "downloading" ? "text-blue-700 dark:text-blue-300" :
                      transfer.status === "uploading" ? "text-orange-700 dark:text-orange-300" :
                      transfer.status === "moving" ? "text-purple-700 dark:text-purple-300" :
                      transfer.status === "copying" ? "text-purple-700 dark:text-purple-300" :
                      transfer.status === "fetching" ? "text-purple-700 dark:text-purple-300" :
                      "text-blue-700 dark:text-blue-300"
                    )}>
                      {transfer.targetAccountId}
                    </span>
                  </div>
                    {transfer.targetPath && (
                      <span className="text-xs text-slate-600 dark:text-slate-400 pl-6">{`${transfer.targetPath}`}</span>
                    )}
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1 ml-2">
            {transfer.status === "cancelled" && onRetryTransfer && (
              <Button
                onClick={() => onRetryTransfer(transfer.id)}
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 hover:bg-slate-100 dark:hover:bg-slate-700"
                title="Retry transfer"
              >
                <RotateCcw className="h-3 w-3" />
              </Button>
            )}
            
            {transfer.status !== "cancelled" && transfer.status !== "completed" ? (
              <Button
                onClick={() => onCancelTransfer(transfer.id)}
                variant="ghost"
                size="sm"
                className="bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-800/30 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                title="Cancel transfer"
              >
                Cancel Trasnfer
              </Button>
            ) : (
              <Button
                onClick={() => onCloseTransfer(transfer.id)}
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 hover:bg-slate-100 dark:hover:bg-slate-700"
                title="Remove from list"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Simplified File List for Multi-file Transfers */}
        {transfer.itemCount > 1 && transfer.fileList && transfer.fileList.length > 0 && (
          <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-3">
              <FolderOpen className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                Items ({transfer.fileList.length})
              </span>
            </div>
            <div className="max-h-32 overflow-y-auto">
              <div className="grid grid-cols-1 gap-1">
                {transfer.fileList.map((file, index) => {
                  const isCompleted = transfer.completedFiles?.includes(file);
                  const isFailed = transfer.failedFiles?.some(f => f.file === file);
                  const isInProgress = !isCompleted && !isFailed && transfer.currentItem === file;
                  
                  return (
                    <div key={index} className="flex items-center gap-2 px-2 py-1 rounded">
                      {isCompleted && <div className="h-2 w-2 bg-green-500 rounded-full flex-shrink-0" />}
                      {isFailed && <div className="h-2 w-2 bg-red-500 rounded-full flex-shrink-0" />}
                      {isInProgress && <div className={
                        cn(
                          transfer.status === "downloading" ? "h-2 w-2 bg-blue-500 rounded-full flex-shrink-0 animate-pulse" :
                          transfer.status === "uploading" ? "h-2 w-2 bg-orange-500 rounded-full flex-shrink-0 animate-pulse" :
                          transfer.status === "moving" ? "h-2 w-2 bg-purple-500 rounded-full flex-shrink-0 animate-pulse" :
                          transfer.status === "copying" ? "h-2 w-2 bg-purple-500 rounded-full flex-shrink-0 animate-pulse" :
                          transfer.status === "fetching" ? "h-2 w-2 bg-purple-500 rounded-full flex-shrink-0 animate-pulse" :
                          "h-2 w-2 bg-blue-500 rounded-full flex-shrink-0")} />}
                      {!isCompleted && !isFailed && !isInProgress && <div className="h-2 w-2 bg-gray-700 dark:bg-gray-500 rounded-full flex-shrink-0" />}
                      <span className={cn(
                        "text-xs truncate font-medium text-slate-700 dark:text-slate-500",
                        isCompleted && "text-green-700 dark:text-green-300",
                        isFailed && "text-red-700 dark:text-red-300",
                        isInProgress && (transfer.status === "downloading" ? "text-blue-700 dark:text-blue-300" :
                          transfer.status === "uploading" ? "text-orange-700 dark:text-orange-300" :
                          transfer.status === "moving" ? "text-purple-700 dark:text-purple-300" :
                          transfer.status === "copying" ? "text-purple-700 dark:text-purple-300" :
                          transfer.status === "fetching" ? "text-purple-700 dark:text-purple-300" :
                          "text-blue-700 dark:text-blue-300") 
                      )}>
                        {file}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Progress Bar */}
        {transfer.status !== "completed" && (transfer.progress ?? 0) > 0 && (
          <div className="space-y-3">
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden shadow-inner">
              <div 
                className={cn(
                  transfer.status === "downloading" ? "bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 h-3 rounded-full transition-all duration-500 ease-out relative overflow-hidden" :
                  transfer.status === "uploading" ? "bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600 h-3 rounded-full transition-all duration-500 ease-out relative overflow-hidden" :  
                  transfer.status === "moving" ? "bg-gradient-to-r from-purple-400 via-purple-500 to-purple-600 h-3 rounded-full transition-all duration-500 ease-out relative overflow-hidden" :
                  transfer.status === "copying" ? "bg-gradient-to-r from-purple-400 via-purple-500 to-purple-600 h-3 rounded-full transition-all duration-500 ease-out relative overflow-hidden" :
                  transfer.status === "fetching" ? "bg-gradient-to-r from-purple-400 via-purple-500 to-purple-600 h-3 rounded-full transition-all duration-500 ease-out relative overflow-hidden" :
                  transfer.status === "cancelled" ? "bg-gradient-to-r from-red-400 via-red-500 to-red-600 h-3 rounded-full transition-all duration-500 ease-out relative overflow-hidden" : 
                "bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 h-3 rounded-full transition-all duration-500 ease-out relative overflow-hidden")}
                style={{ width: `${Math.min(100, Math.max(0, (transfer.progress ?? 0)))}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"></div>
              </div>
            </div>
            <div className={cn("flex justify-between items-center text-sm",
            transfer.status === "cancelled" ? "text-red-700 dark:text-red-300" :
            transfer.status === "downloading" ? "text-blue-700 dark:text-blue-300" :
            transfer.status === "uploading" ? "text-orange-700 dark:text-orange-300" :
            transfer.status === "moving" ? "text-purple-700 dark:text-purple-300" :
            transfer.status === "copying" ? "text-purple-700 dark:text-purple-300" :
            transfer.status === "fetching" ? "text-purple-700 dark:text-purple-300" : 
             "text-slate-600 dark:text-slate-400")}>
              <span className="font-medium">{Math.round((transfer.progress ?? 0))}% complete</span>
              {transfer.itemCount > 1 && (
                <span className={cn("text-xs px-2 py-1 rounded-full border", 
                  transfer.status === "cancelled" ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-red-700 dark:text-red-300" :
                  transfer.status === "downloading" ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 " :
                  transfer.status === "uploading" ? "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700 text-orange-700 dark:text-orange-300" :
                  transfer.status === "moving" ? "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700 text-purple-700 dark:text-purple-300" :
                  transfer.status === "copying" ? "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700 text-purple-700 dark:text-purple-300" :
                  transfer.status === "fetching" ? "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700 text-purple-700 dark:text-purple-300" : 
                  "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700")}>
                  {transfer.status !== "cancelled" ? "Completed" : "Partial Transfer"} {transfer.completedFiles?.length} of {transfer.itemCount} items
                </span>
              )}
            </div>
          </div>
        )}

        {/* Cancel Message */}
        {transfer.status == "cancelled" && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3">
            <p className="text-sm text-red-700 dark:text-red-300">{transfer.cancelledMessage}</p>
          </div>
        )}

        {/* Error Message */}
        {transfer.cancelledMessage && transfer.status !== "cancelled" && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3">
            <p className="text-sm text-red-700 dark:text-red-300">{transfer.cancelledMessage}</p>
          </div>
        )}

        {/* Timing Information */}
        <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 pt-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 rounded-lg p-3 -m-1 mt-3">
          <div className="flex items-center gap-2">
            <Clock className="h-3 w-3" />
            <span className="font-medium">Started:</span>
            <span>{formatTime(transfer.startTime)}</span>
          </div>
          {(transfer.status === "completed" || transfer.status === "cancelled") && (
            <div className="flex items-center gap-2">
              <span className="font-medium">Duration:</span>
              <span className="bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded text-xs">
                {formatDuration(transfer.startTime, transfer.endTime)}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }
}
