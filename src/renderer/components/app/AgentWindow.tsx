/**
 * AgentWindow Compoenent 
 * 
 * A resizable chat interface for MCP (Model Context Protocol) agent interactions
 * Features: Real-time status indicator, query processing, error handling, and manual resize functionality
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowUp } from "lucide-react";
import { MCPStatus } from "@Types/permissions";

export default function AgentWindow({ show }: { show: boolean }) {
    
    const [query, setQuery] = useState('');
    const [testToolName, setTestToolName] = useState('');
    const [testToolArgs, setTestToolArgs] = useState('');

    /** The agent's response to the user's question */
    const [response, setResponse] = useState('');

    /** Whether we're currently waiting for the agent to respond */
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /** Information about whether the MCP agent is on based on permissions */
    const [mcpInfo, setMcpInfo] = useState<MCPStatus | null>(null);
    
    /** Window resize state and refs */
    const [size, setSize] = useState({ width: 560, height: 320 }); // Current size of the window
    const [isResizing, setIsResizing] = useState(false); // Whether the user is currently dragging to resize the window
    const resizeStartRef = useRef({ x: 0, y: 0 }); // Stores where the mouse was when resize started
    const resizeStartSizeRef = useRef({ width: 560, height: 320 }); // Stores what size the window was when resize started
    const windowRef = useRef<HTMLDivElement>(null); // Reference to the main window HTML element
    const responseRef = useRef<HTMLDivElement>(null); // Reference to the response display area

    /** Window size constraints and layout constants */
    const MIN_WIDTH = 320;
    const MIN_HEIGHT = 240;
    const ACTION_BAR_WIDTH = 80; 

    useEffect(() => {
        const handleReloadAgentMessage = (event: Electron.IpcRendererEvent, text: string) => {
            console.log('Received message from MCP:', text);
            setResponse(text);
        };

        window.mcpApi.onReloadAgentMessage(handleReloadAgentMessage);
        console.log('AgentWindow: Listening for MCP messages');
        return () => {
            window.mcpApi.removeReloadAgentMessageListener();
        };
    }, []);

    useEffect(() => {
        if (responseRef.current) {
            responseRef.current.scrollTop = responseRef.current.scrollHeight;
        }
    }, [response]);

    /** 
     * Gets the current status of the MCP agent from the main process
     * This tells us if the agent is ready to answer questions or if there's a problem
     */
    const loadMCPStatus = async () => {
        try {
            // Ask the main process for the agent's status
            const status = await window.mcpApi.getStatus();
            console.log('MCP Status:', status);
            // Store the status so we can show it to the user
            setMcpInfo(status);
        } catch (error) {
            // If something goes wrong, log it
            console.error('Error loading MCP status:', error);
        }
    };

    /** 
     * When the window becomes visible, check the agent status
     * This runs automatically when the 'show' prop changes to true
     */
    useEffect(() => {
        if (show) {
            loadMCPStatus();
        }
    }, [show]);

    /** 
     * Handles what happens when the user submits their question
     * This function manages the entire process of sending a query and getting a response
     */
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Show loading spinner and clear any previous errors
        setIsLoading(true);
        setError(null);

        try {
            // Send the user's question to the agent and wait for response
            const result = await (window as any).mcpApi.processQuery(query);

            // Show the agent's response and clear the input field
            setResponse(result);
            setQuery('');
        } catch (err) {
            // If something goes wrong, show an error message to the user
            setError(err instanceof Error ? err.message : 'Failed to process query');
        } finally {
            setIsLoading(false);
        }
    };

    /** 
     * Handles what happens when the user submits their question
     * This function manages the entire process of sending a query and getting a response
     */
    const handleTestSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Show loading spinner and clear any previous errors
        setIsLoading(true);
        setError(null);

        try {
            console.log('Test Tool Name:', testToolName);
            console.log('Test Tool Args:', testToolArgs);
            // Send the user's question to the agent and wait for response
            const result = await (window as any).mcpApi.processQueryTest(testToolName, testToolArgs);

            console.log('Test Result:', result);
            // Show the agent's response and clear the input field
            setResponse("happy path");
            setTestToolName('');
            setTestToolArgs('');
        } catch (err) {
            // If something goes wrong, show an error message to the user
            setError(err instanceof Error ? err.message : 'Failed to process query');
        } finally {
            setIsLoading(false);
        }
    };

    /** 
     * Starts the resize operation when user clicks and drags the resize handle
     * Records where the mouse started and what size the window was
     */
    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Mark that we're now resizing
        setIsResizing(true);

        // Remember where the mouse was when resize started
        resizeStartRef.current = { x: e.clientX, y: e.clientY }; 

        // Remember what size the window was when resize started
        resizeStartSizeRef.current = { ...size };
        
        // Prevent text selection and change cursor while resizing
        document.body.style.userSelect = 'none'; // No text selection
        document.body.style.cursor = 'nw-resize'; // Show resize cursor
    }, [size]);

    /** 
     * Updates the window size as the user drags the mouse
     * Calculates new dimensions and enforces size limits
     */
    const handleMouseMove = useCallback((e: MouseEvent) => {
        // Only do something if we're actually resizing
        if (!isResizing) return;

        // Calculate how far the mouse has moved since resize started
        const dx = resizeStartRef.current.x - e.clientX; 
        const dy = resizeStartRef.current.y - e.clientY; 


        // Get the current window position to calculate maximum allowed width, without exceding the action bar
        const windowRect = windowRef.current?.getBoundingClientRect();
        const maxWidth = windowRect ? window.innerWidth - ACTION_BAR_WIDTH : window.innerWidth - ACTION_BAR_WIDTH;

         // Calculate new size, but don't go below minimum or above maximum
        const newWidth = Math.max(MIN_WIDTH, Math.min(maxWidth, resizeStartSizeRef.current.width + dx));
        const newHeight = Math.max(MIN_HEIGHT, resizeStartSizeRef.current.height + dy);

        setSize({ width: newWidth, height: newHeight });
    }, [isResizing]);

    /** 
     * Finishes the resize operation when user releases the mouse button
     * Restores normal cursor and text selection behavior
     */
    const handleMouseUp = useCallback(() => {
        if (isResizing) {
            // Mark that we're no longer resizing
            setIsResizing(false);

            // Restore normal text selection and cursor
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        }
    }, [isResizing]);

    /** 
     * Sets up global mouse event listeners during resize operation
     * This lets us track mouse movement even when it leaves the window
     */
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
            {/* Main container for the agent window */}
            <div className="h-full flex flex-col max-w-full">

                {/* TOP SECTION: Message display area where agent responses appear */}
                <div className="flex-1 overflow-hidden">
                    <div className="h-full p-4 pb-2">
                        <div ref={responseRef} className="h-full bg-white/80 dark:bg-black/30 rounded-lg border border-blue-500/20 dark:border-blue-400/20 p-3 overflow-y-auto backdrop-blur-sm">
                            
                            {/* Agent status indicator - shows if agent is working */}
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-2 h-2 bg-blue-500 dark:bg-blue-400 rounded-full animate-pulse"></div>

                                {/* Status text that changes based on agent availability */}
                                {mcpInfo && mcpInfo.isEnabled ? (
                                    <span className="text-green-600 dark:text-green-300 text-sm font-medium">Agent Ready</span>
                                ) : (
                                    <span className="text-red-600 dark:text-red-300 text-sm font-medium">Agent Disabled</span>
                                )}
                            </div>

                            {/* Error message display */}
                            {error && (
                                <div className="mb-3 text-xs text-red-700 dark:text-red-300 bg-red-100/80 dark:bg-red-900/20 border border-red-300/50 dark:border-red-500/10 rounded px-3 py-2">
                                    {error}
                                </div>
                            )}

                            {/* Main content area - shows different things based on agent state */}
                            <div className="text-gray-800 dark:text-gray-100 text-sm font-mono leading-relaxed">
                                {mcpInfo && mcpInfo.isEnabled ? (
                                isLoading && !response ? (
                                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                                        <Loader2 className="animate-spin w-4 h-4" />
                                        <span>Processing query...</span>
                                    </div>
                                ) : response ? ( 
                                    // Show the agent's response
                                    <pre className="whitespace-pre-wrap break-words">{response}</pre>
                                ) : (
                                    // No response yet, show placeholder text
                                    <span className="text-gray-600 dark:text-gray-500 italic">Agent will answer here...</span>
                                )) : (
                                <>
                                    // Agent is disabled, explain why
                                    <span className="text-gray-600 dark:text-gray-500 italic">Agent is disabled due to insufficient permissions.</span>
                                </>)}
                            </div>
                        </div>
                    </div>
                </div>

                {/* BOTTOM SECTION: Input area where user types questions */}
                <div className="flex-shrink-0 p-4 pt-2">
                    <div className="relative">
                        <div className="flex gap-2 bg-white/70 dark:bg-black/30 rounded-lg border border-blue-500/30 dark:border-blue-400/30 p-2 backdrop-blur-sm">
                            
                            {/* Text input where user types their questions */}
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

                            {/* Submit button */}
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

                        <div className="flex gap-2 bg-white/70 h-30 dark:bg-black/30 rounded-lg border border-blue-500/30 dark:border-blue-400/30 p-2 backdrop-blur-sm">
                            
                            <Input
                                value={testToolName}
                                onChange={(e) => setTestToolName(e.target.value)}
                                placeholder="Tool name"
                                className="flex-1 bg-transparent text-gray-800 h-10 px-3 py-2 leading-tight dark:text-white border-none placeholder-gray-500 dark:placeholder-gray-400 focus:ring-1 focus:ring-blue-500/40 dark:focus:ring-blue-400/40 text-sm"
                                disabled={isLoading}
                                autoComplete="off"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleTestSubmit(e);
                                    }
                                }}
                            />

                            <Input
                                value={testToolArgs}
                                onChange={(e) => setTestToolArgs(e.target.value)}
                                placeholder='Tool args, e.g., {"path": "/"}'
                                className="flex-1 bg-transparent text-gray-800 h-10 px-3 py-2 leading-tight dark:text-white border-none placeholder-gray-500 dark:placeholder-gray-400 focus:ring-1 focus:ring-blue-500/40 dark:focus:ring-blue-400/40 text-sm"
                                disabled={isLoading}
                                autoComplete="off"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleTestSubmit(e);
                                    }
                                }}
                            />


                            {/* Submit button */}
                            <Button
                                onClick={handleTestSubmit}
                                disabled={isLoading || !testToolName.trim() || !testToolArgs.trim()}
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

                {/* RESIZE HANDLE: Small invisible area in TOP-LEFT corner for resizing */}
                <div
                    onMouseDown={handleResizeStart}
                    className="absolute left-0 top-0 w-6 h-6 cursor-nw-resize bg-transparent hover:bg-blue-500/10 z-10 rounded-br-lg transition-colors duration-200"
                    style={{
                        touchAction: 'none',
                    }}
                >
                    {/* Visual indicator that appears when hovering over resize handle */}
                    <div className="absolute inset-1 opacity-0 hover:opacity-100 transition-opacity duration-200">
                        <div className="w-full h-full border-l-2 border-t-2 border-blue-500/60 rounded-tl-sm"></div>
                    </div>
                </div>
            </div>
        </div>
    );
}
