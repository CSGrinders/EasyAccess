// Renderer process - updated dispatcher
type CommandHandler = (...args: any[]) => any; // Can now return values

export class RendererIpcCommandDispatcher {
    private static instance: RendererIpcCommandDispatcher;
    private handlers: Map<string, CommandHandler> = new Map();

    private constructor() {
        window.mcpApi?.mcpRenderer?.on('invoke-renderer-function', (event: any, payload: any) => {
            const { invocationId, name, args } = payload;
            console.log(`RendererIpcCommandDispatcher: Invoking function "${name}" with args:`, args);
            
            const handler = this.handlers.get(name);
            if (!handler) {
                console.warn(`No renderer handler registered for function "${name}"`);
                this.sendResponse(invocationId, false, null, `No handler registered for "${name}"`);
                return;
            }

            try {
                // Execute the handler - it might be sync or async
                const result = handler(...args);
                
                // Handle both sync and async functions
                if (result instanceof Promise) {
                    result
                        .then(asyncResult => {
                            this.sendResponse(invocationId, true, asyncResult, null);
                        })
                        .catch(error => {
                            console.error(`Async error in handler for ${name}:`, error);
                            this.sendResponse(invocationId, false, null, error.message || error.toString());
                        });
                } else {
                    // Sync function
                    this.sendResponse(invocationId, true, result, null);
                }
            } catch (error: any) {
                console.error(`Error calling handler for ${name}:`, error);
                this.sendResponse(invocationId, false, null, error.message || error.toString());
            }
        });
    }

    private sendResponse(invocationId: string, success: boolean, result: any, error: string | null) {
        window.mcpApi?.mcpRenderer?.send('renderer-function-response', {
            invocationId,
            success,
            result,
            error
        });
    }

    static getInstance(): RendererIpcCommandDispatcher {
        if (!RendererIpcCommandDispatcher.instance) {
            RendererIpcCommandDispatcher.instance = new RendererIpcCommandDispatcher();
        }
        return RendererIpcCommandDispatcher.instance;
    }

    register(name: string, handler: CommandHandler): void {
        if (this.handlers.has(name)) {
            console.warn(`Overwriting existing handler for ${name}`);
        }
        this.handlers.set(name, handler);
    }

    unregister(name: string): void {
        this.handlers.delete(name);
    }
}