import { ArrowUp, Loader2, X, Eye, EyeOff } from "lucide-react";
import React, { useState, useRef, useCallback, useEffect, memo } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { RendererIpcCommandDispatcher } from "@/services/AgentControlService";
import { supabase } from "@/supbaseClient";
import { FaGoogle } from "react-icons/fa";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";

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

    const MAX_HEIGHT = 500; // Maximum height of the container
    const MIN_HEIGHT = 200; // Minimum height of the container

    const [session, setSession] = useState<any | null>(null);

    const agentWorkVisibilityRef = useRef<boolean>(false);

    const waitForResponseRef = useRef<boolean>(false);
    const questionRef = useRef<HTMLDivElement>(null);

    // Add keyboard movement handler
    const handleKeyDown = useCallback((e: KeyboardEvent) => {

        const isCmdOrCtrl = e.ctrlKey || e.metaKey;
        console.log("Key pressed:", e.key);

        if (!isCmdOrCtrl) return;

        switch (e.key) {
            case 'Shift':
                setAgentWorkVisibility(!agentWorkVisibilityRef.current);
                break;
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
            await processDelta(currentDelta);
        }

        setIsLoading(false);
        isTyping.current = false;
    }, []);

    const processDelta = useCallback(async (delta: string) => {

        // Type out the delta character by character
        for (let i = 0; i < delta.length; i++) {
            await new Promise((resolve) => setTimeout(resolve, 5));
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

    useEffect(() => {
        // Update container height based on content
        if (messagesRef.current && containerRef.current && headerRef.current) {
            messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
        }
    }, [response]);

    useEffect(() => {
        const dispatcher = RendererIpcCommandDispatcher.getInstance();

        dispatcher.register('callingFunctionMessage', handleAgentToolCallingMessage);
        dispatcher.register('sendTextDeltaMessage', handleTextDeltaMessage);
        dispatcher.register('agentWorkStop', handleAgentWorkStop);
        dispatcher.register('requestClarification', handleRequestClarification);
        dispatcher.register('gracefulClose', handleGracefulSessionClose);

        return () => {
            dispatcher.unregister('callingFunctionMessage');
            dispatcher.unregister('sendTextDeltaMessage');
            dispatcher.unregister('agentWorkStop');
            dispatcher.unregister('requestClarification');
            dispatcher.unregister('gracefulClose');
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

        console.log("current session:", session);

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

    const toggleToolCalls = useCallback(() => {
        setShowToolCalls(prev => !prev);
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
            console.log("Supabase session:", data.session);
        });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event: string, session: import('@supabase/supabase-js').Session | null) => {
            setSession(session);
            console.log(session?.access_token);
            console.log("Auth state changed:", session);
        });

        return () => subscription.unsubscribe();
    }, []);

    const signUp = async (e: React.FormEvent) => {
        e.preventDefault();
        console.log("Signing up with Google");
        console.log("window.location.origin:", window.location.origin);
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: window.location.origin,
                skipBrowserRedirect: true,
            }
        });

        if (error) {
            console.error("Error signing up:", error);
            return;
        }
        console.log("Sign up data:", data);
        // Open the sign up URL in a new tab
        window.open(data.url, '_blank');
    };

    const tryUpdatingTable = async () => {
        const { data, error } = await supabase
            .from('userRequestTrack')
            .update({ requests: 10 })
            .eq('user_email', 'sohn5312@gmail.com');

        if (error) {
            console.error("Error updating table:", error);
            return;
        }
        console.log("Table updated successfully:", data);
    }


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
        if (userRequestsTrack.length === 0 || !parsedDate || parsedDate < Date.now() - 24 * 60 * 60 * 1000 || userRequestsTrack[0].requests < 5) {
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
                className="agentResponse absolute top-1 z-50 w-full max-w-300 pointer-events-auto transition-all duration-300 ease-in-out"
            >
                {/* Move handle */}
                <div
                    onMouseDown={handleMouseDownMoveBox}
                    className="absolute top-0 w-full h-6 bg-transparent hover:bg-blue-500/20 z-10 cursor-move transition-colors duration-200 flex items-center justify-center rounded-t-[32px]"
                    style={{
                        touchAction: 'none',
                        userSelect: 'none',
                    }}
                >
                    <div className="w-8 h-1 bg-white/30 rounded-full" />
                </div>

                <div ref={headerRef}>
                    <div className="flex items-center justify-between mb-2 mt-3 mx-5">
                        <p className="text-md font-normal text-black dark:text-white">
                            {isLoading ? "Working..." : "Agent Response"}
                        </p>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={toggleToolCalls}
                                className="flex flex-row gap-1 p-1 hover:bg-white/10 rounded border border-white/20 text-xs text-black dark:text-white transition-colors"
                            >
                                {showToolCalls ? (
                                    <Eye className="w-4 h-4" />
                                ) : (
                                    <EyeOff className="w-4 h-4" />
                                )}
                                Agent Actions
                            </button>
                            <button
                                onClick={handleClose}
                                className="p-1 hover:bg-white/10 rounded transition-colors"
                            >
                                <X className="text-black w-4 h-4 dark:text-white hover:text-red-500" />
                            </button>
                        </div>
                    </div>

                    <hr className="border-black/10 dark:border-white/10 w-full" />
                </div>
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        padding: '12px 16px',
                        minHeight: '200px',
                        width: '100%',
                        willChange: 'left, height',
                        maxHeight: '500px',
                        overflow: 'hidden',
                    }}
                >


                    <div className="flex-1 relative transition-all duration-300 ease-in-out"
                        ref={messagesRef}
                        style={{
                            minHeight: '100px',
                            width: '100%',
                            overflowY: 'auto', // Enables scrolling
                        }}
                    >
                        <div className="flex justify-end pl-5 pr-3 my-2">
                            <p className="userQuery text-sm ">{userQuery}</p>
                        </div>
                        <div
                            className="h-full pr-2"
                        >
                            <p className="break-normal whitespace-pre-wrap text-black dark:text-white/90 text-sm leading-relaxed">
                                {response}
                            </p>

                            {showToolCalls && (
                                <div className="mt-4 px-2 py-2 rounded bg-black/10 dark:bg-white/10 text-xs text-black dark:text-white/80 max-w-xl">
                                    <p className="font-semibold mb-1">Tool Calls</p>
                                    <ul className="list-disc ml-5 space-y-1">
                                        {agentWorkingMessages.length > 0 ? (
                                            agentWorkingMessages.map((msg: string, idx: number) => (
                                                <li
                                                    key={idx}
                                                    className="whitespace-pre-wrap break-normal"
                                                >
                                                    {msg}
                                                </li>
                                            ))
                                        ) : (
                                            <li>No tool calls yet.</li>
                                        )}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>



                    {isLoading && (
                        <div className="absolute bottom-2 right-2 p-2">
                            <Loader2 className="animate-spin w-4 h-4 text-black dark:text-white" />
                        </div>
                    )}
                </div>
                {/* Resize handle */}
                <div
                    onMouseDown={handleMouseDown}
                    className="absolute bottom-0 w-full h-4 cursor-s-resize bg-transparent hover:bg-blue-500/20 z-10 transition-colors duration-200 flex items-center justify-center rounded-b-[32px]"
                    style={{
                        touchAction: 'none',
                        userSelect: 'none',
                    }}
                >
                    <div className="w-8 h-1 bg-white/30 rounded-full" />
                </div>
            </div>
            {/* User Input */}
            {/* Enhanced Chat Interface */}
            <div className="absolute pointer-events-auto bottom-8 left-1/2 transform -translate-x-1/2 w-full max-w-4xl">
                <span ref={questionRef}
                    className={`text-center text-xs text-gray-500 mb-4`}
                >
                    waiting for your response on agent question...
                </span>
                <div className="bg-white/80 dark:bg-gray-900/80 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 backdrop-blur-xl shadow-lg p-2 transition-all duration-300 hover:shadow-3xl">
                    {/* Chat Form */}
                    <form onSubmit={handleSubmit} className="relative">
                        <div className="flex items-center gap-3 p-2 bg-gray-50/50 dark:bg-gray-800/50 rounded-xl border border-gray-200/50 dark:border-gray-700/50 focus-within:border-blue-500/50 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all duration-200">

                            {/* Input Field */}
                            <div className="flex-1 relative">
                                <Input
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Talk to your helpful agent!"
                                    className="w-full bg-transparent border-0 placeholder:text-gray-400 dark:placeholder:text-gray-500 text-gray-900 dark:text-gray-100 px-4 py-3 text-base focus:outline-none focus:ring-0 focus:ring-transparent focus:border-transparent"
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
                                className="relative overflow-hidden bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-medium p-3 rounded-lg transition-all duration-200 transform hover:scale-105 active:scale-95 disabled:scale-100 disabled:opacity-50 group"
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
                        <div className="flex items-center justify-between mt-3 text-xs text-gray-500 dark:text-gray-400">
                            <div className="flex items-center gap-2">
                                {session ? (
                                    <>
                                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                        <span>Connected</span>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                                        <span>Sign in to continue</span>
                                        <button
                                            onClick={signUp}
                                            type="button"
                                            className="group relative ml-1 overflow-hidden bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold px-2 py-1 rounded-xl transition-all duration-300 transform hover:scale-105 hover:shadow-lg active:scale-95"
                                        >
                                            <span className="relative z-10 flex items-center gap-2 text-xs">
                                                <FaGoogle />
                                                Sign Up with Google to use Agent
                                            </span>
                                            <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                        </button>
                                    </>
                                )}
                            </div>

                            <div className="flex items-center gap-5">
                                <div className="flex items-center gap-1">
                                    <kbd className="p-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">Enter</kbd>
                                    <span>to send</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <kbd className="p-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">Ctrl/Cmd + Enter</kbd>
                                    <span>to show/hide</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <kbd className="p-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">Shift + Enter</kbd>
                                    <span>to show/hide agent work</span>
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