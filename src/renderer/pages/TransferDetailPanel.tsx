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
          "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-3",
          transfer.error && "border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-900/10",
          transfer.isCompleted && "border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-900/10"
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

        {/* Current Item */}
        {transfer.currentItem && !transfer.isCompleted && (
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded p-2">
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 mb-1">
              <FileText className="h-3 w-3" />
              <span>Current file:</span>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300 truncate">
              {transfer.currentItem}
            </p>
          </div>
        )}

        {/* File Lists for Multi-file Transfers */}
        {transfer.itemCount > 1 && (transfer.isCompleted || transfer.error) && (
          <div className="space-y-2">

            {/* All Files List (for reference) */}
            {transfer.fileList && transfer.fileList.length > 0 && (
              <details className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded">
                <summary className="p-2 cursor-pointer text-xs text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
                  View all files ({transfer.fileList.length})
                </summary>
                <div className="p-2 pt-0 max-h-32 overflow-y-auto space-y-1 border-t border-slate-200 dark:border-slate-700">
                  {transfer.fileList.map((file, index) => (
                    <div key={index} className="text-xs text-slate-600 dark:text-slate-400 truncate">
                      {file}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* Progress Bar */}
        {!transfer.error && !transfer.isCompleted && transfer.progress > 0 && (
          <div className="space-y-2">
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${Math.min(100, Math.max(0, transfer.progress))}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
              <span>{Math.round(transfer.progress)}% complete</span>
              {transfer.itemCount > 1 && (
                <span>{Math.round((transfer.progress / 100) * transfer.itemCount)} of {transfer.itemCount} files</span>
              )}
            </div>
          </div>
        )}

        {/* Error Message */}
        {transfer.error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2">
            <p className="text-sm text-red-700 dark:text-red-300">{transfer.error}</p>
          </div>
        )}

        {/* Timing Information */}
        <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>Started: {formatTime(transfer.startTime)}</span>
          </div>
          {(transfer.isCompleted || transfer.error) && (
            <span>Duration: {formatDuration(transfer.startTime, transfer.endTime)}</span>
          )}
        </div>
      </div>
    );
  }
}
