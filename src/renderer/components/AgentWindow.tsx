import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, ArrowUp } from "lucide-react";

export default function AgentWindow({ show }: { show: boolean }) {
    const [query, setQuery] = useState('');
    const [response, setResponse] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const result = await (window as any).mcpApi.processQuery(query);
            setResponse(result);
            setQuery(''); // Clear input after successful submission
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to process query');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div
            className={`${
                show ? "w-2/5" : "w-0"
            } absolute h-80 bottom-35 right-0 z-50 backdrop-blur-none  border-blue-400/20 shadow-2xl transition-all duration-300 ease-out overflow-hidden rounded-t-xl`}
        >
            <div className="h-full flex flex-col max-w-full">
                {/* Response Area */}
                <div className="flex-1 overflow-hidden">
                    <div className="h-full p-4 pb-2">
                        <div className="h-full bg-black/30 rounded-lg border border-blue-400/20 p-3 overflow-y-auto backdrop-blur-sm">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                                <span className="text-blue-300 text-sm font-medium">Agent Ready</span>
                            </div>

                            {error && (
                                <div className="mb-3 text-xs text-red-300 bg-red-900/20 border border-red-500/10 rounded px-3 py-2">
                                    {error}
                                </div>
                            )}

                            <div className="text-gray-100 text-sm font-mono leading-relaxed">
                                {isLoading ? (
                                    <div className="flex items-center gap-2 text-blue-400">
                                        <Loader2 className="animate-spin w-4 h-4" />
                                        <span>Processing query...</span>
                                    </div>
                                ) : response ? (
                                    <pre className="whitespace-pre-wrap break-words">{response}</pre>
                                ) : (
                                    <span className="text-gray-500 italic">Agent will answer here...</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Input Area */}
                <div className="flex-shrink-0 p-4 pt-2">
                    <div className="relative">
                        <div className="flex gap-2 bg-black/30 rounded-lg border border-blue-400/30 p-2 backdrop-blur-sm">
                            <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Talk to your helpful agent!"
                                className="flex-1 bg-transparent text-white border-none placeholder-gray-400 focus:ring-1 focus:ring-blue-400/40 text-sm"
                                disabled={isLoading}
                                autoComplete="off"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSubmit(e);
                                    }
                                }}
                            />
                            <Button
                                onClick={handleSubmit}
                                disabled={isLoading || !query.trim()}
                                size="sm"
                                className="bg-blue-500/80 hover:bg-blue-400/80 text-black font-medium px-3 transition-all duration-200 disabled:opacity-50"
                            >
                                {isLoading ? (
                                    <Loader2 className="animate-spin w-4 h-4" />
                                ) : (
                                    <ArrowUp className="w-4 h-4" />
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
