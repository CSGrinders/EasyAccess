

import React, { useState, useEffect } from 'react';
import { X, FileText, AlertCircle, Loader2, CheckCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface MovingItemStatusProps {
  isVisible?: boolean;
  itemCount?: number;
  currentItem?: string;
  progress?: number;
  error?: string | null;
  isCompleted?: boolean;
  onCancel?: () => void;
  onClose?: () => void;
  startTime?: number;
}

export function MovingItemStatus({
  isVisible = true,
  itemCount = 0,
  currentItem,
  progress = 0,
  error = null,
  isCompleted = false,
  onCancel,
  onClose,
  startTime
}: MovingItemStatusProps) {
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<string>("");

  useEffect(() => {
    if (!startTime || progress <= 0 || isCompleted || error) {
      setEstimatedTimeRemaining("");
      return;
    }

    const elapsed = Date.now() - startTime;
    const rate = progress / elapsed;
    const remaining = (100 - progress) / rate;

    if (remaining > 0 && remaining < Infinity) {
      const seconds = Math.ceil(remaining / 1000);
      if (seconds < 60) {
        setEstimatedTimeRemaining(`~${seconds}s remaining`);
      } else {
        const minutes = Math.ceil(seconds / 60);
        setEstimatedTimeRemaining(`~${minutes}m remaining`);
      }
    } else {
      setEstimatedTimeRemaining("");
    }
  }, [progress, startTime, isCompleted, error]);

  if (!isVisible) return null;

  const getStatusText = () => {
    if (error) return "Transfer failed";
    if (isCompleted) return "Transfer completed";
    if (itemCount === 1) return "Moving item";
    return `Moving ${itemCount} items`;
  };

  const getProgressText = () => {
    if (error) return error;
    if (isCompleted) return "All files transferred successfully";
    if (currentItem) {
      const truncatedName = currentItem.length > 30 
        ? `...${currentItem.slice(-27)}` 
        : currentItem;
      return `Processing: ${truncatedName}`;
    }
    if (itemCount === 1) return "Preparing file transfer...";
    return `Transferring files... (${Math.round(progress)}%)`;
  };

  const getStatusIcon = () => {
    if (error) return <AlertCircle className="h-5 w-5 text-red-500" />;
    if (isCompleted) return <CheckCircle className="h-5 w-5 text-green-500" />;
    return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
  };

  return (
    <div className={cn(
      "select-none fixed bottom-6 right-6 bg-white/95 dark:bg-slate-800/95 border border-slate-200 dark:border-slate-700",
      "rounded-xl shadow-xl backdrop-blur-sm overflow-hidden",
      "animate-in fade-in-0 slide-in-from-bottom-3 duration-300",
      "min-w-[320px] max-w-[400px]",
      "backdrop-saturate-150"
    )}
    style={{ zIndex: 99999 }}
    >
      <div className={cn(
        "flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700",
        error ? "bg-red-50 dark:bg-red-900/20" : 
        isCompleted ? "bg-green-50 dark:bg-green-900/20" : 
        "bg-blue-50 dark:bg-blue-900/20"
      )}>
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <div className="flex items-center gap-2">
            <h3 className={cn(
              "font-semibold text-sm",
              error ? "text-red-700 dark:text-red-300" :
              isCompleted ? "text-green-700 dark:text-green-300" :
              "text-blue-700 dark:text-blue-300"
            )}>
              {getStatusText()}
            </h3>
          </div>
        </div>
        
        {(isCompleted || error) && onClose && (
          <Button
            onClick={onClose}
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="p-4 space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          {getProgressText()}
        </p>

        {!error && !isCompleted && progress > 0 && (
          <div className="space-y-2">
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <span>{Math.round(progress)}% complete</span>
                {estimatedTimeRemaining && (
                  <>
                    <span>•</span>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{estimatedTimeRemaining}</span>
                    </div>
                  </>
                )}
              </div>
              {itemCount > 1 && (
                <span>{Math.round((progress / 100) * itemCount)} of {itemCount} files</span>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          {!error && !isCompleted && onCancel && (
            <Button
              onClick={onCancel}
              variant="outline"
              size="sm"
              className="flex-1 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              Cancel Transfer
            </Button>
          )}
          
          {error && onClose && (
            <Button
              onClick={onClose}
              variant="outline"
              size="sm"
              className="flex-1 text-red-600 dark:text-red-400 border-red-300 dark:border-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              Dismiss
            </Button>
          )}
          
          {isCompleted && onClose && (
            <Button
              onClick={onClose}
              variant="default"
              size="sm"
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              Done
            </Button>
          )}
        </div>
      </div>
      {!error && !isCompleted && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 opacity-80 overflow-hidden">
          <div className="h-full w-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
        </div>
      )}
    </div>
  );
}
