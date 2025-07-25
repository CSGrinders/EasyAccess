import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../ui/dialog";
import { useState } from "react";
import { Button } from "../ui/button";
import { DialogHeader, DialogFooter } from "../ui/dialog";
import { Input } from "../ui/input";

interface AgentClarificationDialogProps {
    open: boolean;
    setOpen: (open: boolean) => void;
    onSubmit: (response: string) => void;
    question: string;
}

export function AgentClarificationDialog({
    open,
    setOpen,
    onSubmit,
    question
}: AgentClarificationDialogProps) {
    const [localResponse, setLocalResponse] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(localResponse);
        setLocalResponse('');
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {/* The main content box of the popup */}
            <DialogContent className="sm:max-w-[500px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl max-h-[80vh] overflow-hidden">
                <DialogHeader>
                    <DialogTitle>Agent needs clarification</DialogTitle>
                    <DialogDescription>{question}</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="flex items-center gap-4">
                            <Input
                                type="text"
                                value={localResponse}
                                onChange={(e) => {
                                    setLocalResponse(e.target.value);
                                }}
                                className="col-span-3"
                                placeholder="Type your response..."
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit">Submit</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};