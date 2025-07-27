import { ArrowUp, Loader2, X, Command, CornerDownLeft } from "lucide-react";
import React, { useState, useRef, useCallback, useEffect, memo } from "react";
import { Button } from "../ui/button";
import { RendererIpcCommandDispatcher } from "@/services/AgentControlService";
import { supabase } from "@/supbaseClient";
import { FaGoogle } from "react-icons/fa";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import ToolResult from "./ToolResult";
import { FcGoogle } from "react-icons/fc";

const AGENT_AUTH_REDIRECT_URL = process.env.AGENT_AUTH_REDIRECT_URL;

const AgentAction = memo(function AgentAction() {
    const [isResizing, setIsResizing] = useState(false);
    const [isMoving, setIsMoving] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const messagesRef = useRef<HTMLDivElement>(null);
    const wholeRef = useRef<HTMLDivElement>(null);
    const [query, setQuery] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const positionRef = useRef({ x: 0, y: 0 });

    const [showErrorDialog, setShowErrorDialog] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [errorDescription, setErrorDescription] = useState("");

    const [showToolCalls, setShowToolCalls] = useState(false);
    const [agentWorkingMessages, setAgentWorkingMessages] = useState<string[]>([]);
    const [response, setResponse] = useState("");
    const [userQuery, setUserQuery] = useState("");

    const [showClarificationDialog, setShowClarificationDialog] = useState(false);
    const [question, setQuestion] = useState("");

    const headerRef = useRef<HTMLDivElement>(null);
    const queueRef = useRef<string[]>([]);
    const isTyping = useRef(false);

    const MAX_HEIGHT = 450; // Maximum height of the container
    const MIN_HEIGHT = 200; // Minimum height of the container

    const MAX_QUERY_LENGTH = 400;

    const [session, setSession] = useState<any | null>(null);

    const agentWorkVisibilityRef = useRef<boolean>(false);

    const waitForResponseRef = useRef<boolean>(false);
    const questionRef = useRef<HTMLDivElement>(null);

    const MONTHLY_REQUEST_LIMIT = 50; // Monthly request limit for the user

    // Add keyboard movement handler
    const handleKeyDown = useCallback((e: KeyboardEvent) => {

        const isCmdOrCtrl = e.ctrlKey || e.metaKey;
        console.log("Key pressed:", e.key);

        if (!isCmdOrCtrl) return;

        switch (e.key) {
            case 'Enter':
                toggleVisibility();
                break;
        }

        if (!containerRef.current) return;

        const MOVE_AMOUNT = 60; // pixels to move per keypress

        switch (e.key) {
            case 'ArrowLeft':
                positionRef.current.x -= MOVE_AMOUNT;
                break;
            case 'ArrowRight':
                positionRef.current.x += MOVE_AMOUNT;
                break;
            default:
                return;
        }

        containerRef.current.style.transform =
            `translate(${positionRef.current.x}px, 0px)`;
        e.preventDefault();

    }, []);

    const toggleVisibility = useCallback(() => {
        console.log("Toggling visibility of agent response box");
        // reset the position of agent work box
        if (wholeRef.current) {
            wholeRef.current.style.display = wholeRef.current.style.display === 'none' ? 'block' : 'none';
        }
    }, []);


    const setAgentWorkVisibility = useCallback((show: boolean) => {
        agentWorkVisibilityRef.current = show;
        console.log("Toggling visibility of agent work box");
        if (containerRef.current) {
            containerRef.current.style.display = show ? 'block' : 'none';
        }
    }, []);

    // Add keyboard event listener
    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleKeyDown]);

    const handleAgentToolCallingMessage = useCallback(async (message: string) => {
        console.log("Handling agent tool calling message:", message);
        // queueRef.current.push("\n• " + message + "\n");
        setAgentWorkingMessages((prev) => [...prev, message]);
        queueRef.current.push("\n");
        processQueue();
    }, []);

    const handleTextDeltaMessage = useCallback(async (delta: string) => {
        queueRef.current.push(delta);
        processQueue();
    }, []);

    const processQueue = useCallback(async () => {
        if (isTyping.current) return;
        setAgentWorkVisibility(true);
        isTyping.current = true;

        while (queueRef.current.length > 0) {
            const currentDelta = queueRef.current.shift()!;
            if (currentDelta.startsWith("\n<tool_result>")) {
                // Handle tool result messages
                const toolResult = currentDelta;
                setResponse((prev) => prev + toolResult);
                continue;
            }
            await processDelta(currentDelta);
        }

        setIsLoading(false);
        console.log(response);
        isTyping.current = false;
    }, []);

    const processDelta = useCallback(async (delta: string) => {
        // Type out the delta character by character with smoother timing
        for (let i = 0; i < delta.length; i++) {
            await new Promise((resolve) => setTimeout(resolve, Math.random() * 15 + 5)); // Variable typing speed for more natural feel
            setResponse((prev) => prev + delta[i]);
        }
    }, []);

    const handleAgentWorkStop = useCallback(() => {
        console.log("Handling agent work stop");
        setIsLoading(false);
        setAgentWorkVisibility(false);
        setResponse('');
        setUserQuery('');
        queueRef.current = [];
        isTyping.current = false;
        showErrorPopup('Agent stopped working', 'Server is not responding. Please try again later.');
    }, []);

    const showErrorPopup = useCallback((title: string, message: string) => {
        setErrorMessage(title);
        setErrorDescription(message);
        setShowErrorDialog(true);
    }, [errorMessage, errorDescription]);

    const waitForResponseResolveRef = useRef<(response: string) => void | null>(null);

    const waitForResponse = useCallback(() => {
        return new Promise<string>((resolve) => {
            waitForResponseRef.current = true;
            console.log("Waiting for response...");
            if (questionRef.current) {
                questionRef.current.style.display = 'block';
            }
            setQuery(''); // Clear the query input
            // Store the resolve function in a ref
            waitForResponseResolveRef.current = resolve;
        });
    }, []);

    const resolveWaitForResponse = useCallback((response: string) => {
        waitForResponseRef.current = false;
        setQuery(''); // Clear the query input
        console.log("Response received, resolving wait...");
        if (questionRef.current) {
            questionRef.current.style.display = 'none';
        }
        // Resolve the Promise with the user's response
        if (waitForResponseResolveRef.current) {
            waitForResponseResolveRef.current(response);
            waitForResponseResolveRef.current = null; // Clear the ref
        }
    }, []);

    const handleRequestClarification = useCallback(async (question: string) => {
        console.log("Handling request clarification:", question);
        queueRef.current.push("\n• " + question + "\n");
        const response = await waitForResponse();
        console.log("User response:", response);
        return response;
    }, [waitForResponse]);

    const handleGracefulSessionClose = useCallback(async () => {
        console.log("Handling graceful session close");
        // Perform any cleanup or finalization tasks here
        while (isTyping.current) {
            await new Promise((res) => setTimeout(res, 2000));
        }

        setIsLoading(false);
    }, []);

    const handleToolResultMessage = useCallback(async (message: string) => {
        console.log("Handling tool result message:", message);
        queueRef.current.push("\n<tool_result>" + message + "</tool_result>\n");
        processQueue();
    }, []);

    function parseMixedResponse(response: string) {
        const regex = /<tool_result>([\s\S]*?)<\/tool_result>/g;
        const result: { type: "agent" | "tool"; content: string }[] = [];

        let lastIndex = 0;
        let match;

        while ((match = regex.exec(response)) !== null) {
            const start = match.index;
            const end = regex.lastIndex;

            // Agent part before this tool result
            if (start > lastIndex) {
            result.push({
                type: "agent",
                content: response.slice(lastIndex, start).trim()
            });
            }

            // Tool result
            result.push({
                type: "tool",
                content: match[1].trim()
            });

            lastIndex = end;
        }

        // Final agent message after last tool result
        if (lastIndex < response.length) {
            result.push({
            type: "agent",
            content: response.slice(lastIndex).trim()
            });
        }

        return result;
    }
    const parsed = parseMixedResponse(response);

    useEffect(() => {
        // Update container height based on content
        if (messagesRef.current && containerRef.current && headerRef.current) {
            messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
        }
    }, [response]);

    useEffect(() => {
        const dispatcher = RendererIpcCommandDispatcher.getInstance();

        dispatcher.register('sendTextDeltaMessage', handleTextDeltaMessage);
        dispatcher.register('agentWorkStop', handleAgentWorkStop);
        dispatcher.register('requestClarification', handleRequestClarification);
        dispatcher.register('gracefulClose', handleGracefulSessionClose);
        dispatcher.register('toolResultMessage', handleToolResultMessage);

        return () => {
            dispatcher.unregister('sendTextDeltaMessage');
            dispatcher.unregister('agentWorkStop');
            dispatcher.unregister('requestClarification');
            dispatcher.unregister('gracefulClose');
            dispatcher.unregister('toolResultMessage');
        };
    }, [handleAgentToolCallingMessage, handleTextDeltaMessage]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (!containerRef.current) return;
        setIsResizing(true);
        e.preventDefault();
    }, []);

    const handleMouseDownMoveBox = useCallback((e: React.MouseEvent) => {
        console.log("Starting move");
        setIsMoving(true);
        dragStartRef.current = {
            x: e.clientX - positionRef.current.x,
            y: e.clientY - positionRef.current.y
        };
        e.preventDefault();
    }, []);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!containerRef.current) return;

        if (isMoving) {
            const newX = e.clientX - dragStartRef.current.x;
            positionRef.current.x = newX;
            containerRef.current.style.transform = `translate(${newX}px, 0px)`;
        } else if (isResizing) {
            const rect = containerRef.current.getBoundingClientRect();
            const newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, e.clientY - rect.top));
            containerRef.current.style.height = `${newHeight}px`;
        }
    }, [isResizing, isMoving]);

    const handleMouseUp = useCallback(() => {
        setIsResizing(false);
        setIsMoving(false);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // If the query is too long, show an error message
        if (query.length > MAX_QUERY_LENGTH) {
            console.warn("Query is too long:", query.length);
            showErrorPopup("Query Too Long", `Your query exceeds the maximum length of ${MAX_QUERY_LENGTH} characters. Please shorten your query.`);
            return;
        }

        if (waitForResponseRef.current) {
            console.log("Response received, resolving wait...");
            resolveWaitForResponse(query);
            return;
        }

        // check if the user is under the request limit
        // user limit check is also done in the server side, but we want to prevent the user from making requests if they are over the limit
        const canProceed = await checkUserLimit(session?.user);
        if (!canProceed) {
            console.warn("User request limit reached");
            // TODO : Show a message to the user
            showErrorPopup("User Request Limit Reached", "You have reached the maximum number of requests allowed. Please try again later.");
            return;
        }
        console.log("User request limit check passed");

        // reset agent work visibility
        setAgentWorkVisibility(false);
        setAgentWorkVisibility(true);

        if (!query.trim()) return;

        setAgentWorkingMessages([]);
        setResponse('');
        setIsLoading(true);
        setUserQuery(query);

        try {
            const result = await (window as any).mcpApi.processQuery(query, session?.access_token);
            setQuery('');

        } catch (err: any) {
            // handle error
            console.error("Error processing query:", err);
            setIsLoading(false);
        }
    };

    const handleClose = useCallback(() => {
        setAgentWorkVisibility(false);
        setResponse('');
        setUserQuery('');
    }, []);

    // Add event listeners for mouse move and up
    useEffect(() => {
        if (isResizing || isMoving) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, isMoving, handleMouseMove, handleMouseUp]);


    useEffect(() => {
        console.log("Initializing Supabase session");
        questionRef.current!.style.display = 'none';
        supabase.auth.getSession().then(({ data }: { data: { session: import('@supabase/supabase-js').Session | null } }) => {
            setSession(data.session);
        });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event: string, session: import('@supabase/supabase-js').Session | null) => {
            setSession(session);
        });

        const setupAuthListener = async () => {
            await (window as any).electronAPI.onAgentAuthToken(
                async ({ accessToken, refreshToken }: { accessToken: string; refreshToken: string }) => {
                    try {
                        const { data, error } = await supabase.auth.setSession({
                            access_token: accessToken,
                            refresh_token: refreshToken,
                        });

                        if (error) {
                            console.error('Error setting session:', error);
                            return;
                        }

                        console.log('Session set successfully:', data);
                        // Handle successful authentication (e.g., redirect to dashboard)
                        
                    } catch (error) {
                        console.error('Error in auth callback:', error);
                    }
                }
            );
        };

        setupAuthListener();

        return () => {
            subscription.unsubscribe(); 
            (window as any).electronAPI.removeAgentAuthTokenListener();
        };
    }, []);

    const signOut = useCallback(async () => {
        console.log("Signing out from Supabase");
        console.log("Supabase auth:", supabase.auth);
        if (!supabase.auth) {
            console.error("Supabase auth is not initialized");
            return;
        }
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error("Error signing out:", error);
        } else {
            console.log("Signed out successfully");
            setSession(null);
            setAgentWorkVisibility(false);
            setResponse('');
            setUserQuery('');
            queueRef.current = [];
            isTyping.current = false;
            setShowErrorDialog(false);
            setErrorMessage('');
            setErrorDescription('');
            if (questionRef.current) {
                questionRef.current.style.display = 'none';
            }
        }
    }, []);

    const signUp = async (e: React.FormEvent) => {
        e.preventDefault();
        console.log("Signing up with Google");
        console.log("window.location.origin:", window.location.origin);
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: AGENT_AUTH_REDIRECT_URL,
                queryParams: {
                    access_type: "offline",
                    prompt: "consent",
                },
                skipBrowserRedirect: true,
            }
        });

        if (error) {
            console.error("Error signing up:", error);
            return;
        }
        console.log("Sign up data:", data);
        // start auth callback server to listen for the redirect
        (window as any).electronAPI.startAuthServer()
        
        // File has a URL (common for cloud files) - open in browser/default app
        const response = await (window as any).electronAPI.openExternalUrl(data.url);
    };

    async function checkUserLimit(user: any) {
        // Need to make sure that the user email is unique to each user to avoid conflicts
        const { data: userRequestsTrack, error: userRequestsError } = await supabase.from('userRequestTrack').select('*')
            .eq('user_email', user.email)
            .limit(1);

        if (userRequestsError) {
            console.error("Error fetching user requests:", userRequestsError);
            return false;
        }
        // last_request_date YYYY-MM-DD format
        console.log("User request track:", userRequestsTrack);
        const lastRequestDate = userRequestsTrack.length > 0 ? userRequestsTrack[0].last_request_date : null;
        const parsedDate: number | null = lastRequestDate ? new Date(lastRequestDate).getTime() : null;

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const lastRequestMonth = parsedDate ? new Date(parsedDate).getMonth() : null;
        const lastYear = parsedDate ? new Date(parsedDate).getFullYear() : null;

        const isNewMonth = currentMonth !== lastRequestMonth || currentYear !== lastYear;

        if (userRequestsTrack.length === 0 || isNewMonth || userRequestsTrack[0].requests < MONTHLY_REQUEST_LIMIT) {
            console.log("User request track not found or request limit not reached");
            // Insert or update the user request track
            return true;
        } else {
            console.log("User request limit reached or not found, returning error");
            return false;
        }
    }

    useEffect(() => {
        setAgentWorkVisibility(false);
    }, []);

    return (
        <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none" ref={wholeRef}>
            <div
                ref={containerRef}
                className="agentResponse text-gray-900 dark:text-white absolute top-1 z-50 w-full max-w-4xl pointer-events-auto glass-effect"
                style={{
                    maxHeight: `${MAX_HEIGHT}px`,
                    minHeight: `${MIN_HEIGHT}px`,
                    borderRadius: '16px',
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
            >
                <div
                    onMouseDown={handleMouseDownMoveBox}
                    className="absolute top-0 w-full h-8 bg-gradient-to-b from-white/5 to-transparent z-10 cursor-move transition-all duration-300 flex items-center justify-center rounded-t-2xl group hover:from-white/10"
                    style={{
                        touchAction: 'none',
                        userSelect: 'none',
                    }}
                >
                    <div className="w-12 h-1.5 bg-white/20 rounded-full transition-all duration-300 group-hover:bg-white/40 group-hover:w-16" />
                </div>
                <div className="flex flex-col h-full">
                    {/* Header - Fixed height */}
                    <div ref={headerRef} className="flex-shrink-0 mt-6">
                        <div className="flex items-center justify-between mb-3 mx-4">
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-400 to-purple-500 animate-pulse"></div>
                                <p className="text-lg font-medium text-white/90 tracking-wide">
                                    {isLoading ? (
                                        <span className="flex items-center gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Processing...
                                        </span>
                                    ) : "Agent Response"}
                                </p>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleClose}
                                    className="p-2 hover:bg-white/10 rounded-lg transition-all duration-200 group"
                                >
                                    <X className="w-4 h-4 text-white/70 group-hover:text-red-400 transition-colors" />
                                </button>
                            </div>
                        </div>
                        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                    </div>
                    
                    {/* Content - Flexible height with scrolling */}
                    <div className="flex-1 flex flex-col min-h-0 relative px-4 py-3">
                        <div 
                            className="flex-1 overflow-y-auto pr-2 scrollbar-hide"
                            ref={messagesRef}
                            style={{
                                minHeight: `${MIN_HEIGHT - 100}px`,
                                maxHeight: `${MAX_HEIGHT - 100}px`,
                            }}
                        >
                            {userQuery && (
                                <div className="flex justify-end pl-1 pr-3 my-2">
                                    <div className="bg-blue-500/20 rounded-lg px-3 py-2 border border-blue-500/30">
                                        <p className="text-sm text-blue-200/80">{userQuery}</p>
                                    </div>
                                </div>
                            )}
                            
                            <div className="pb-2">
                                <div className="space-y-4">
                                    {parsed.map((part, index) =>
                                    part.type === "tool" ? (
                                        <ToolResult key={index} content={part.content} />
                                    ) : (
                                        <div key={index} className="animate-in fade-in-0 slide-in-from-left-2 duration-300">
                                            <p className="text-sm leading-relaxed whitespace-pre-wrap text-white/90 selection:bg-white/20">
                                                {part.content}
                                            </p>
                                        </div>
                                    )
                                    )}
                                    {isLoading && (
                                        <div className="flex items-center gap-2 text-white/60">
                                            <div className="w-1 h-4 bg-white/60 animate-pulse rounded"></div>
                                            <span className="text-xs">Thinking...</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {isLoading && (
                            <div className="absolute bottom-2 right-2 p-2">
                                <Loader2 className="animate-spin w-4 h-4 text-white/80" />
                            </div>
                        )}
                    </div>
                    {/* Resize handle */}
                    {/* <div
                        onMouseDown={handleMouseDown}
                        className="absolute bottom-0 w-full h-4 cursor-s-resize bg-transparent z-10 transition-colors duration-200 flex items-center justify-center rounded-b-[32px] flex-shrink-0"
                        style={{
                            touchAction: 'none',
                            userSelect: 'none',
                        }}
                    >
                        <div className="w-8 h-1 bg-white/30 rounded-full" />
                    </div> */}
                </div>
            </div>
            <div className="absolute pointer-events-auto bottom-12 left-1/2 transform -translate-x-1/2 w-[75%] max-w-[800px]">
                <span ref={questionRef}
                    className={`text-center text-xs text-gray-500 mb-4`}
                >
                    waiting for your response on agent question...
                </span>
                <div className="bg-white/80 dark:bg-stone-950/30 rounded-xl border border-gray-200/50 dark:border-gray-700/50 backdrop-blur-xl shadow-lg p-2 transition-all duration-300 hover:shadow-xl">
                    <form onSubmit={handleSubmit} className="relative">
                        <div className="flex items-center gap-3 p-1 bg-gray-50/50 dark:bg-gray-800/50 rounded-xl border border-gray-200/50 dark:border-gray-700/50 focus-within:border-blue-500/50 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all duration-200">

                            {/* Input Field */}
                            <div className="flex-1 relative">
                                <input
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Talk to your helpful agent!"
                                    className="w-full bg-transparent border-0 placeholder:text-gray-400 dark:placeholder:text-gray-500 text-gray-900 dark:text-gray-100 px-4 py-3 text-sm focus:outline-none focus:ring-0"
                                    disabled={isLoading || !session}
                                    autoComplete="off"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                                            e.preventDefault();
                                            handleSubmit(e);
                                        }
                                    }}
                                />

                                {/* Character count or status indicator */}
                                {query.length > 0 && (
                                    <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500">
                                        {query.length}
                                    </div>
                                )}
                            </div>

                            {/* Submit Button */}
                            <Button
                                type="submit"
                                disabled={isLoading || !query.trim()}
                                size="sm"
                                className="enhanced-button relative overflow-hidden bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-medium p-3 rounded-lg transition-all duration-200 transform active:scale-95 disabled:scale-100 disabled:opacity-50 group"
                            >
                                {isLoading ? (
                                    <Loader2 className="animate-spin w-5 h-5" />
                                ) : (
                                    <ArrowUp className="w-5 h-5 transform group-hover:translate-y-[-2px] transition-transform duration-200" />
                                )}
                                <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                            </Button>
                        </div>

                        {/* Status indicators */}
                        <div className="flex items-center justify-between mt-3 text-xs text-gray-500 dark:text-white">
                            <div className="flex items-center gap-2">
                                {session ? (
                                    <>
                                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                        <span>Connected</span>
                                        <button
                                            onClick={signOut}
                                            type="button"
                                            className="ml-1 text-xs text-gray-500 dark:text-gray-400 hover:underline"
                                        >
                                            Sign Out
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                                        <span>Sign in to continue</span>
                                        <button
                                            onClick={signUp}
                                            className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs px-1 py-0.5 rounded flex items-center gap-1 border border-gray-300"
                                        >
                                            <FcGoogle size={16} />
                                            Sign in with Google
                                        </button>
                                    </>
                                )}
                            </div>

                            <div className="flex items-center gap-5">
                                <div className="flex items-center gap-1">
                                    <span>Send</span>
                                    <div className="flex items-center p-1 bg-gray-100 dark:bg-gray-600 rounded">
                                        <CornerDownLeft className="w-3 h-3"/>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <span>Show/Hide</span>
                                    <div className="flex items-center p-1 bg-gray-100 dark:bg-gray-600 rounded">
                                        <Command className="w-3 h-3"/>
                                    </div>
                                    <div className="flex items-center p-1 bg-gray-100 dark:bg-gray-600 rounded">
                                        <CornerDownLeft className="w-3 h-3"/>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
            </div>

            {/* prompt for error message */}
            <Dialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
                <DialogContent className="max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                            {errorMessage}
                        </DialogTitle>
                        <DialogDescription className="text-slate-600 dark:text-slate-400">
                            {errorDescription}
                        </DialogDescription>
                    </DialogHeader>
                </DialogContent>
            </Dialog>
        </div>
    );
});

export default AgentAction;