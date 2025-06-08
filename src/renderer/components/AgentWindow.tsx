import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, ArrowUp } from "lucide-react";
import { MCPStatus } from "@Types/permissions";

export default function AgentWindow({ show }: { show: boolean }) {
    const [query, setQuery] = useState('');
    const [response, setResponse] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mcpInfo, setMcpInfo] = useState<MCPStatus | null>(null);
    const [size, setSize] = useState({ width: 560, height: 320 }); 
    const [isResizing, setIsResizing] = useState(false);
    const resizeStartRef = useRef({ x: 0, y: 0 });
    const resizeStartSizeRef = useRef({ width: 560, height: 320 });
    const windowRef = useRef<HTMLDivElement>(null);

    const MIN_WIDTH = 320;
    const MIN_HEIGHT = 240;
    const ACTION_BAR_WIDTH = 80; 

    const loadMCPStatus = async () => {
        try {
            const status = await window.mcpApi.getStatus();
            console.log('MCP Status:', status);
            setMcpInfo(status);
        } catch (error) {
            console.error('Error loading MCP status:', error);
        }
    };


    useEffect(() => {
        if (show) {
            loadMCPStatus();
        }
    }, [show]);

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

    // Resize handlers
    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        setIsResizing(true);
        resizeStartRef.current = { x: e.clientX, y: e.clientY };
        resizeStartSizeRef.current = { ...size };
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'nw-resize';
    }, [size]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isResizing) return;

        const dx = resizeStartRef.current.x - e.clientX; 
        const dy = resizeStartRef.current.y - e.clientY; 

        // Calculate maximum width based on current window position and ActionBar constraint
        const windowRect = windowRef.current?.getBoundingClientRect();
        const maxWidth = windowRect ? window.innerWidth - ACTION_BAR_WIDTH : window.innerWidth - ACTION_BAR_WIDTH;

        const newWidth = Math.max(MIN_WIDTH, Math.min(maxWidth, resizeStartSizeRef.current.width + dx));
        const newHeight = Math.max(MIN_HEIGHT, resizeStartSizeRef.current.height + dy);

        setSize({ width: newWidth, height: newHeight });
    }, [isResizing]);

    const handleMouseUp = useCallback(() => {
        if (isResizing) {
            setIsResizing(false);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        }
    }, [isResizing]);

    // Global mouse event listeners for resize
    useEffect(() => {
        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.addEventListener('mouseleave', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('mouseleave', handleMouseUp);
        };
    }, [isResizing, handleMouseMove, handleMouseUp]);

    return (
        <div
            ref={windowRef}
            className={`${
                show ? "block" : "hidden"
            } absolute bottom-35 right-0 z-50 backdrop-blur-none border-blue-400/20 dark:border-blue-400/20 border-blue-500/30 shadow-2xl overflow-hidden rounded-t-xl ${
                isResizing ? 'ring-2 ring-blue-400/50' : ''
            }`}
            style={{
                width: show ? `${size.width}px` : '0px',
                height: show ? `${size.height}px` : '0px',
                transition: isResizing ? 'none' : 'all 0.3s ease-out',
                opacity: isResizing ? 0.9 : 1
            }}
        >
            <div className="h-full flex flex-col max-w-full">
                <div className="flex-1 overflow-hidden">
                    <div className="h-full p-4 pb-2">
                        <div className="h-full bg-white/80 dark:bg-black/30 rounded-lg border border-blue-500/20 dark:border-blue-400/20 p-3 overflow-y-auto backdrop-blur-sm">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-2 h-2 bg-blue-500 dark:bg-blue-400 rounded-full animate-pulse"></div>
                                {mcpInfo && mcpInfo.isEnabled ? (
                                    <span className="text-green-600 dark:text-green-300 text-sm font-medium">Agent Ready</span>
                                ) : (
                                    <span className="text-red-600 dark:text-red-300 text-sm font-medium">Agent Disabled</span>
                                )}
                            </div>

                            {error && (
                                <div className="mb-3 text-xs text-red-700 dark:text-red-300 bg-red-100/80 dark:bg-red-900/20 border border-red-300/50 dark:border-red-500/10 rounded px-3 py-2">
                                    {error}
                                </div>
                            )}

                            <div className="text-gray-800 dark:text-gray-100 text-sm font-mono leading-relaxed">
                                {mcpInfo && mcpInfo.isEnabled ? (
                                isLoading ? (
                                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                                        <Loader2 className="animate-spin w-4 h-4" />
                                        <span>Processing query...</span>
                                    </div>
                                ) : response ? (
                                    <pre className="whitespace-pre-wrap break-words">{response}</pre>
                                ) : (
                                    <span className="text-gray-600 dark:text-gray-500 italic">Agent will answer here...</span>
                                )) : (
                                <>
                                    <span className="text-gray-600 dark:text-gray-500 italic">Agent is disabled due to insufficient permissions.</span>
                                </>)}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Input Area */}
                <div className="flex-shrink-0 p-4 pt-2">
                    <div className="relative">
                        <div className="flex gap-2 bg-white/70 dark:bg-black/30 rounded-lg border border-blue-500/30 dark:border-blue-400/30 p-2 backdrop-blur-sm">
                            <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Talk to your helpful agent!"
                                className="flex-1 bg-transparent text-gray-800 dark:text-white border-none placeholder-gray-500 dark:placeholder-gray-400 focus:ring-1 focus:ring-blue-500/40 dark:focus:ring-blue-400/40 text-sm"
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
                                className="bg-blue-500/90 hover:bg-blue-600/90 dark:bg-blue-500/80 dark:hover:bg-blue-400/80 text-white font-medium px-3 transition-all duration-200 disabled:opacity-50"
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

                <div
                    onMouseDown={handleResizeStart}
                    className="absolute left-0 top-0 w-6 h-6 cursor-nw-resize bg-transparent hover:bg-blue-500/10 z-10 rounded-br-lg transition-colors duration-200"
                    style={{
                        touchAction: 'none',
                    }}
                >
                    <div className="absolute inset-1 opacity-0 hover:opacity-100 transition-opacity duration-200">
                        <div className="w-full h-full border-l-2 border-t-2 border-blue-500/60 rounded-tl-sm"></div>
                    </div>
                </div>
            </div>
        </div>
    );
}
