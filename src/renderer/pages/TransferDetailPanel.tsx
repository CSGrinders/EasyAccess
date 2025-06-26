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
      if (transfer.error) {
        failed.push(transfer);
      } else if (transfer.isCompleted) {
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
    if (transfer.error) return <AlertCircle className="h-5 w-5 text-red-500" />;
    if (transfer.isCompleted) return <CheckCircle className="h-5 w-5 text-green-500" />;
    return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
  };

  const getTransferTypeIcon = (transfer: TransferItem) => {
    if (transfer.sourceDescription.includes('Cloud') && transfer.targetDescription.includes('Cloud')) {
      return <ArrowRight className="h-4 w-4 text-slate-500" />;
    } else if (transfer.sourceDescription.includes('Cloud')) {
      return <Download className="h-4 w-4 text-blue-500" />;
    } else if (transfer.targetDescription.includes('Cloud')) {
      return <Upload className="h-4 w-4 text-green-500" />;
    }
    return <FolderOpen className="h-4 w-4 text-slate-500" />;
  };

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
                Monitor and manage your file transfers
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
                    if (transfer.isCompleted || transfer.error) {
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
          transfer.error && "border-red-200 dark:border-red-800 bg-gradient-to-br from-red-50/50 to-white dark:from-red-900/10 dark:to-slate-800",
          transfer.isCompleted && "border-green-200 dark:border-green-800 bg-gradient-to-br from-green-50/50 to-white dark:from-green-900/10 dark:to-slate-800",
          !transfer.error && !transfer.isCompleted && "border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50/50 to-white dark:from-blue-900/10 dark:to-slate-800"
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {getStatusIcon(transfer)}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                {getTransferTypeIcon(transfer)}
                <span className={cn(
                  "text-sm font-medium",
                  transfer.error ? "text-red-700 dark:text-red-300" :
                  transfer.isCompleted ? "text-green-700 dark:text-green-300" :
                  "text-blue-700 dark:text-blue-300"
                )}>
                  {transfer.keepOriginal ? 'Copy' : 'Move'} {transfer.itemCount} file{transfer.itemCount > 1 ? 's' : ''}
                  {/* Show file name for single file transfers */}
                  {transfer.itemCount === 1 && (() => {
                    // Try to get the file name from various sources
                    const fileName = transfer.fileList?.[0] || 
                                   transfer.completedFiles?.[0] || 
                                   transfer.failedFiles?.[0]?.file ||
                                   transfer.currentItem;
                    return fileName ? (
                      <span className="text-slate-600 dark:text-slate-400 font-normal">: {fileName}</span>
                    ) : null;
                  })()}
                </span>
              </div>
              
              <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">From:</span>
                  <span className="truncate">{transfer.sourceDescription}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">To:</span>
                  <span className="truncate">{transfer.targetDescription}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1 ml-2">
            {transfer.error && onRetryTransfer && (
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
            
            {!transfer.isCancelling && !transfer.isCompleted && !transfer.error ? (
              <Button
                onClick={() => onCancelTransfer(transfer.id)}
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 hover:bg-slate-100 dark:hover:bg-slate-700"
                title="Cancel transfer"
              >
                <X className="h-3 w-3" />
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
              <FileText className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                Files ({transfer.fileList.length})
              </span>
            </div>
            <div className="max-h-32 overflow-y-auto">
              <div className="grid grid-cols-1 gap-1">
                {transfer.fileList.map((file, index) => {
                  const isCompleted = transfer.completedFiles?.includes(file);
                  const isFailed = transfer.failedFiles?.some(f => f.file === file);
                  
                  return (
                    <div key={index} className="flex items-center gap-2 px-2 py-1 rounded">
                      {isCompleted && <div className="h-2 w-2 bg-green-500 rounded-full flex-shrink-0" />}
                      {isFailed && <div className="h-2 w-2 bg-red-500 rounded-full flex-shrink-0" />}
                      {!isCompleted && !isFailed && <div className="h-2 w-2 bg-slate-400 rounded-full flex-shrink-0" />}
                      <span className={cn(
                        "text-xs truncate font-medium",
                        isCompleted && "text-green-700 dark:text-green-300",
                        isFailed && "text-red-700 dark:text-red-300",
                        !isCompleted && !isFailed && "text-slate-600 dark:text-slate-400"
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
        {!transfer.error && !transfer.isCompleted && transfer.progress > 0 && (
          <div className="space-y-3">
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden shadow-inner">
              <div 
                className="bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 h-3 rounded-full transition-all duration-500 ease-out relative overflow-hidden"
                style={{ width: `${Math.min(100, Math.max(0, transfer.progress))}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"></div>
              </div>
            </div>
            <div className="flex justify-between items-center text-sm text-slate-600 dark:text-slate-400">
              <span className="font-medium">{Math.round(transfer.progress)}% complete</span>
              {transfer.itemCount > 1 && (
                <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full border border-slate-200 dark:border-slate-700">
                  {Math.round((transfer.progress / 100) * transfer.itemCount)} of {transfer.itemCount} files
                </span>
              )}
            </div>
          </div>
        )}

        {/* Simple Error Message */}
        {transfer.error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3">
            <p className="text-sm text-red-700 dark:text-red-300">{transfer.error}</p>
          </div>
        )}

        {/* Timing Information */}
        <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 pt-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 rounded-lg p-3 -m-1 mt-3">
          <div className="flex items-center gap-2">
            <Clock className="h-3 w-3" />
            <span className="font-medium">Started:</span>
            <span>{formatTime(transfer.startTime)}</span>
          </div>
          {(transfer.isCompleted || transfer.error) && (
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
