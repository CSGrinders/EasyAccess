import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, AlertTriangle } from "lucide-react";

interface UploadConfirmationDialogProps {
    isOpen: boolean;
    onConfirm: (keepOriginal: boolean) => void;
    onCancel: () => void;
    fileCount?: number;
}

export const UploadConfirmationDialog = ({isOpen, onConfirm, onCancel, fileCount = 1}: UploadConfirmationDialogProps) => {
    const [keepOriginal, setKeepOriginal] = useState(false);

    const handleConfirm = () => {
        onConfirm(keepOriginal);
        setKeepOriginal(false); 
    };

    const handleCancel = () => {
        onCancel();
        setKeepOriginal(false); 
    };

    return (
        <Dialog open={isOpen} onOpenChange={() => handleCancel()}>
            <DialogContent className="max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl">
                <DialogHeader>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg">
                            <Upload className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <DialogTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                            Confirm File Upload
                        </DialogTitle>
                    </div>
                    <DialogDescription className="text-slate-600 dark:text-slate-400 text-left">
                        {fileCount === 1 
                            ? "Are you sure you want to upload this file?" 
                            : `Are you sure you want to upload these ${fileCount} files?`
                        }
                    </DialogDescription>
                </DialogHeader>
                
                <div className="py-4">
                    <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-amber-800 dark:text-amber-200">
                            <p className="font-medium mb-1">Important:</p>
                            <p>By default, the original files will be deleted from the source location after upload.</p>
                        </div>
                    </div>
                    
                    <div className="mt-4">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={keepOriginal}
                                onChange={(e) => setKeepOriginal(e.target.checked)}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                Keep original {fileCount === 1 ? 'file' : 'files'} in source location
                            </span>
                        </label>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 ml-7">
                            {keepOriginal 
                                ? "Files will be copied to the destination" 
                                : "Files will be moved to the destination"
                            }
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={handleCancel}
                        className="text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-600"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        {keepOriginal ? 'Copy' : 'Move'} {fileCount === 1 ? 'File' : 'Files'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
