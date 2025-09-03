// anthropic sdk
import { Anthropic } from "@anthropic-ai/sdk";
import {
    MessageParam,
    Tool,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";

import { WebSocket } from 'ws';
// mcp sdk
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport";

import { triggerAgentWorkStop, triggerToolResultMessage, triggerGetFileOnRenderer, triggerGracefulClose, triggerOpenAccountWindow, triggerRefreshAgentMessage, triggerSendTextDelta } from "../main";
import { CloudType } from "../../types/cloudType";
import fs from 'fs';
import { getConnectedCloudAccounts } from "../cloud/cloudManager";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

class MCPClient {
    // mcp and llm might not be initialized if ANTHROPIC_API_KEY is not set
    private mcp: Client;
    private llm: Anthropic | undefined;
    private tools: Tool[] = [];
    private prev_messages: MessageParam[] = [];

    constructor() {
        if (!ANTHROPIC_API_KEY) {
            this.llm = undefined;
        } else {
            this.llm = new Anthropic({
                apiKey: ANTHROPIC_API_KEY,
            });
        }
        this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
    }

    // Connect to the MCP
    async connectToServer(transports: Transport | Transport[]) {
        const transportArray = Array.isArray(transports) ? transports : [transports];
        
        for (const transport of transportArray) {
            await this.mcp.connect(transport);
        }

        // Register tools
        const toolsResult = await this.mcp.listTools();
        this.tools = toolsResult.tools.map((tool) => {
            return {
                name: tool.name,
                description: tool.description,
                input_schema: tool.inputSchema,
            };
        });

        console.log(
            "Connected to server with tools:",
            this.tools.map(({ name }) => name)
        );

        const serializedTools = JSON.stringify(this.tools);
        console.log("Serialized tools:", serializedTools);
        fs.writeFileSync("toolset.json", serializedTools, "utf-8");
        const deserializedTools = JSON.parse(serializedTools) as Tool[];
        console.log("Deserialized tools:", deserializedTools);
    }

    async getConnectedAccountsText(): Promise<string> {
        const googleAccounts = await getConnectedCloudAccounts(CloudType.GoogleDrive) ?? [];
        const onedriveAccounts = await getConnectedCloudAccounts(CloudType.OneDrive) ?? [];
        const dropboxAccounts = await getConnectedCloudAccounts(CloudType.Dropbox) ?? [];

        const connectedAccountsText = `Google Drive: ${googleAccounts.map(acc => `${acc}`).join(", ")}; ` +
            `OneDrive: ${onedriveAccounts.map(acc => `${acc}`).join(", ")}; ` +
            `Dropbox: ${dropboxAccounts.map(acc => `${acc}`).join(", ")}`;

        return connectedAccountsText;
    }


    async streamClaudeResponse(messages: MessageParam[], tools: Tool[], connected_accounts: string, allowed_directories: string) {
      const anthropic = new Anthropic({
        apiKey: ANTHROPIC_API_KEY
      });
      try {
        const stream = await anthropic.messages.create({
          model: "claude-3-5-haiku-latest",
          max_tokens: 2000,
          messages: messages,
          tools: tools,
          stream: true,
          tool_choice: {
            type: 'auto'
          },
          system: [
            {
              type: "text",
              text: `<core_identity> You are a built-in assistant for a desktop application called EasyAccess that unifies file management across Google Drive, OneDrive, Dropbox, and the local file system. You serve real users and must respond with speed, clarity, and confidence. Your purpose is to execute file operations and respond to user actions accurately.</core_identity>
    
    <guidelines>
        • NEVER answer irrelevant questions or requests. Focus solely on file operations and user actions.
        • ALWAYS respond in a simple, short, and direct manner.
        • ALWAYS validate all inputs before taking action. Confirm paths, file names, and required parameters.
        • ALWAYS acknowledge uncertainty when present. Use <get_information_from_user/> to clarify.
        • ALWAYS check allowed_local_directories before working on local files. You do not have access to the entire local file system.
        • If a file or path is invalid, locate and suggest the nearest valid alternative.</guidelines>
    
    <connected_accounts>${connected_accounts}</connected_accounts>
    <allowed_local_directories>ALWAYS ensure the file is within these directories when accessing it. ${allowed_directories}</allowed_local_directories>`,
              cache_control: {
                type: "ephemeral"
              }
            }
          ]
        });
        return stream;
      } catch (error) {
        throw error;
      }
    }

    // Process query
    async processQuery(query: string, access_token?: string): Promise<string> {
        // if query is too long, throw an error
        const MAX_QUERY_LENGTH = 400;
        if (query.length > MAX_QUERY_LENGTH) {
            triggerGracefulClose(); // Call a function to handle graceful close if needed
            return "";
        }

        // check if prev messages are too long
        console.log("Using previous messages:", this.prev_messages);
        if (this.prev_messages.length > 20) {
            console.warn("Previous messages are too long, clearing them.");
            this.prev_messages = [];
        }

        console.log("Processing query:", query);
        
        if (access_token) {
            console.log("Access token provided, using web API");
            return await this.processQueryWeb(query, access_token);
        } else {
            console.log("No access token provided, using local API");
            return await this.processQueryLocal(query);
        }
    }

    async processQueryLocal(query: string): Promise<string> {
        // If local API key is not set, stop processing
        if (!this.llm) {
            console.error("MCPClient is not initialized properly.");
            triggerAgentWorkStop("API Key is not set.");
            return "";
        }
        const connectedAccountsText = await this.getConnectedAccountsText();
        // get allowed directories from mcp server
        const allowedDirectories = await this.mcp.callTool({
            name: "list_allowed_directories",
        });
        const directoryContent = allowedDirectories.content as { type: string, text?: string }[];
        const allowedDirectoriesText = directoryContent.map(item => item.text).join("\n");
        console.log("Allowed directories:", allowedDirectoriesText);

        const messages: MessageParam[] = [
            {
                role: "user",
                content: query,
            },
        ];

        let currentResponse: string = "";

        this.prev_messages.push({
            role: "user",
            content: query,
        });

        const texts: any[] = [];
        const toolCalls: { name: string; arguments: { [x: string]: unknown } }[] = [];

        let stop: boolean = false;

        while (!stop) {
            try {
                console.log("Messages prepared:", messages);
                let fullResponse = "";
                let toolCalls = [];
                // Process streaming response
                // Create Claude stream
                const claudeStream = await this.streamClaudeResponse(messages, this.tools, connectedAccountsText, allowedDirectoriesText);
                let currentToolCall = null;
                let inputJsonBuffer = null;
                for await (const chunk of claudeStream){
                    switch(chunk.type){
                        case 'message_start':
                            console.log("Message start detected");
                            break;
                        case 'content_block_start':
                            if (chunk.content_block.type === 'text') {
                                console.log("Text content block start detected");
                            } else if (chunk.content_block.type === 'tool_use') {
                                currentToolCall = chunk.content_block;
                                inputJsonBuffer = "";
                            }
                            break;
                        case 'content_block_delta':
                            if (chunk.delta.type === 'text_delta') {
                                fullResponse += chunk.delta.text;
                                texts.push(chunk.delta.text);
                                console.log("Response Text content:", chunk.delta.text);
                                triggerSendTextDelta(chunk.delta.text);
                                currentResponse += chunk.delta.text;
                            } else if (chunk.delta.type === 'input_json_delta') {
                                inputJsonBuffer += chunk.delta.partial_json;
                            }
                            break;
                        case 'content_block_stop':
                            console.log("Content block stop detected");
                            break;
                        case 'message_delta':
                            if (chunk.delta.stop_reason === 'tool_use') {
                                if (currentToolCall) {
                                    const currentToolInput = inputJsonBuffer ? JSON.parse(inputJsonBuffer) : {};
                                    currentToolCall.input = currentToolInput;
                                    toolCalls.push(currentToolCall);
                                    currentToolCall = null; // Reset for next tool call
                                    inputJsonBuffer = "";
                                }
                            } else if (chunk.delta.stop_reason === 'end_turn') {
                                console.log("End of turn detected");
                            }
                            break;
                        case 'message_stop':
                            // Save the full response from Claude to messages
                            if (fullResponse) {
                            messages.push({
                                role: "assistant",
                                content: [
                                {
                                    type: "text",
                                    text: fullResponse
                                }
                                ]
                            });
                            }
                            // Handle tool calls if any
                            if (toolCalls.length > 0) {
                                // this will call the tool and insert the result into messages
                                await this.processToolCallsStreaming(toolCalls, "conversationId", messages);
                            } else {
                                console.log("No tool calls to process");
                                stop = true;
                            }
                            // here now messages contains the response from Claude and any tool results
                            console.log("Final messages prepared:", messages);
                            break;
                        default:
                            console.log("Unknown chunk type");
                    }
                }
            } catch (error) {
                console.error("Error in stream processing:", error);
                stop = true; // Stop the stream on error
            } finally {
                console.log("Closing SSE stream");
                // controller.close();
            }
        }
        
        return "";
    }

    async uiTesting() {
                // temp: just testing rendering messages in renderer process
        const characters = `"The House on Thornhill Road"
Chapter 1: The Letter

When Eleanor Grange received the letter, she thought it was a joke.

The envelope was thick, the paper creamy and smooth. Her name, written in an elegant, almost calligraphic hand, danced across the front: Miss Eleanor L. Grange, 52 Roseland Lane, Apt. 3C. No return address. Just a red wax seal stamped with a rose and thorn.

She opened it out of curiosity. Inside, a letter:`;
        for (let i = 0; i < Math.floor(characters.length / 3); i++) {
            await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 50)));
            await triggerSendTextDelta(characters.substring(i * 3, i * 3 + 3));
            if (i % 50 == 0) {
                const response = await this.mcp.callTool({
                    name: "get_information_from_user",
                    arguments: {
                        question: "Testing user input",
                    },
                });
                console.log("Response from get_information_from_user:", response);
                let isError = false;
                if (response.isError) {
                    isError = true;
                    console.error("Tool error:", response.isError);
                }
                await triggerToolResultMessage("search_files", { provider: "GoogleDrive", accountId: "sohn5312@gmail.com", path: "/", patterns: ["yee"] }, response.content, isError);
            }
        }
        return "s";
    }

    async processQueryWeb(query: string, access_token: string): Promise<string> {
        const connectedAccountsText = await this.getConnectedAccountsText();
        // get allowed directories from mcp server
        const allowedDirectories = await this.mcp.callTool({
            name: "list_allowed_directories",
        });
        const directoryContent = allowedDirectories.content as { type: string, text?: string }[];
        const allowedDirectoriesText = directoryContent.map(item => item.text).join("\n");
        console.log("Allowed directories:", allowedDirectoriesText);

        const messages: MessageParam[] = [
            {
                role: "user",
                content: query,
            },
        ];

        let currentResponse: string = "";

        const jwt: string | null = access_token;
        if (!jwt) {
            throw new Error("Failed to get Supabase JWT");
        }

        const texts: string[] = [];
        const jwtToken = jwt.replace('\r\n', '');
        const ws = new WebSocket(
            "wss://lliuckljienxmohsoitv.supabase.co/functions/v1/chat-stream?token=" + jwtToken
        );
        this.prev_messages.push({
            role: "user",
            content: query,
        });
        ws.onopen = () => ws.send(JSON.stringify({
            type: "query",
            content: query,
            tool_use_id: "",
            connected_accounts: connectedAccountsText,
            allowed_directories: allowedDirectoriesText,
            messages: this.prev_messages,
        }));
        ws.onmessage = async (e) => {
            console.log('Received:', e.data);
            // Handle the response from the server
            const response = JSON.parse(e.data.toString()) as { type: string; text?: string, name?: string, input?: { [x: string]: unknown }, block_type?: string, content?: { type: string, text?: string }[] , conversationId?: string, tool_use_id?: string, error?: string, stack?: string};
            if (response) {
                if (response.type === "text_delta" && response.text) {
                    texts.push(response.text);
                    console.log("Response Text content:", response.text);
                    triggerSendTextDelta(response.text);
                    currentResponse += response.text;
                    // triggerRefreshAgentMessage(texts.join(""));
                } else if (response.type === "tool_use") {
                    console.warn("Tool use detected in response:", response);
                    // Handle tool use if needed
                    const toolName = response.name;
                    const toolArgs = response.input as { [x: string]: unknown } | undefined;
                    const toolId = response.tool_use_id // Generate a unique ID if not provided

                    if (!toolName || !toolArgs || !toolId) {
                        console.error("Tool name or arguments are missing in response:", response);
                    } else {
                        messages.push({
                            role: "assistant",
                            content: [{
                                type: "tool_use",
                                id: toolId,
                                name: toolName,
                                input: toolArgs,
                            }],
                        });
                        const result = await this.mcp.callTool({
                            name: toolName,
                            arguments: toolArgs || {},
                        });

                        let isError = false;
                        if (result.isError) {
                            isError = true;
                            console.error("Tool error:", result.isError);
                        }
                        // check if the result is error
                        triggerToolResultMessage(toolName, toolArgs, result.content, isError);

                        const contentArray = result.content as { type: string; text?: string }[];

                        // check the length of result.content text and if it is too long, truncate it
                        // This is to prevent the client from crashing due to too long content
                        for (const content of contentArray) {
                            if (content.type === "text" && content.text && content.text.length > 800) {
                                console.warn("Tool result content is too long, truncating:", content.text.length);
                                content.text = content.text.substring(0, 800) + "... (truncated)";
                            }
                        }

                        // send the truncated result to the server 
                        ws.send(JSON.stringify({
                            type: "tool_result",
                            content: result.content,
                            tool_use_id: toolId,
                            connected_accounts: connectedAccountsText,
                        }));
                        console.log("Tool result:", result);

                        let toolResultContent: string | undefined;
                        for (const toolContent of contentArray) {
                            if (toolContent.type === "text") {
                                toolResultContent = toolContent.text;
                            } else if (toolContent.type === "tool_use") {
                                console.warn("Unexpected tool_use content in tool result:", toolContent);
                            }
                        }
                        messages.push({
                            role: "user",
                            content: [{
                                type: "tool_result", // content.type
                                tool_use_id: toolId,
                                content: toolResultContent ?? "",
                            }],
                        });
                    }
                } else if (response.type === "content_stop") {
                    console.warn("Content stop detected in response:", response);
                    if (currentResponse.length > 0) {
                        messages.push({
                            role: "assistant",
                            content: currentResponse,
                        });
                        currentResponse = ""; // Reset current response after sending
                    }
                    // Handle content stop if needed
                } else if (response.type === "complete") {
                    console.warn("Complete detected in response:", response);
                    // Handle complete if needed
                } else if (response.type === "start") {
                    console.warn("Start detected in response:", response);
                    // Handle start if needed
                } else if (response.type === "content_start") {
                    console.warn("Content start detected in response:", response);
                    // Handle content start if needed
                } else if (response.type === "complete") {
                    console.warn("Tool result detected in response:", response);
                    // Handle tool result if needed
                    ws.close();
                } else if (response.type === "connection") {
                    console.warn("Connection detected in response:", response);
                    // Handle connection if needed
                } else if (response.type === "error") {
                    console.error("Error detected in response:", response);
                    // Handle error if needed
                    if (response.error && response.error.includes("overload")) {
                        console.error("API overloaded error:", response);
                        triggerAgentWorkStop("API overloaded error. Please try again later.");
                    }
                } else if (response.type === "tool_error") {
                    console.error("Tool error detected in response:", response);
                    // Handle tool error if needed
                } else {
                    console.warn("Unknown content type in response:", response);
                }
            
            }
            console.log("Response:", response);
        };
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
        ws.onclose = () => {
            console.log('WebSocket connection closed');
            triggerGracefulClose(); // Call a function to handle graceful close if needed
            console.log(`Messages sent to LLM:`, messages);
            console.log(`Messages sent to LLM:`, JSON.stringify(messages));
            // append the messages to prev_messages for future use
            this.prev_messages.push(...messages);
            // Handle WebSocket close if needed
        };


        // seems not synchronized well here... but keep it for now
        return texts.join("") + "\n";
    }
    
    // Tool execution with streaming updates
    async processToolCallsStreaming(toolCalls: any[], conversationId: string, messages: MessageParam[]) {
        for (const toolCall of toolCalls){
            messages.push({
            role: "assistant",
            content: [
                {
                type: "tool_use",
                id: toolCall.id,
                name: toolCall.name,
                input: toolCall.input || {}
                }
            ]
            });
            const toolName = toolCall.name;
            const toolArgs = toolCall.input as { [x: string]: unknown } | undefined;
            const toolId = toolCall.id;

            if (!toolName || !toolArgs || !toolId) {
                console.error("Tool name or arguments are missing");
            } else {
                messages.push({
                    role: "assistant",
                    content: [{
                        type: "tool_use",
                        id: toolId,
                        name: toolName,
                        input: toolArgs,
                    }],
                });
                const result = await this.mcp.callTool({
                    name: toolName,
                    arguments: toolArgs || {},
                });

                let isError = false;
                if (result.isError) {
                    isError = true;
                    console.error("Tool error:", result.isError);
                }
                // check if the result is error
                triggerToolResultMessage(toolName, toolArgs, result.content, isError);

                const contentArray = result.content as { type: string; text?: string }[];

                // check the length of result.content text and if it is too long, truncate it
                // This is to prevent the client from crashing due to too long content
                for (const content of contentArray) {
                    if (content.type === "text" && content.text && content.text.length > 500) {
                        console.warn("Tool result content is too long, truncating:", content.text.length);
                        content.text = content.text.substring(0, 500) + "... (truncated)";
                    }
                }

                console.log("Tool result:", result);

                let toolResultContent: string | undefined;
                for (const toolContent of contentArray) {
                    if (toolContent.type === "text") {
                        toolResultContent = toolContent.text;
                    } else if (toolContent.type === "tool_use") {
                        console.warn("Unexpected tool_use content in tool result:", toolContent);
                    }
                }
                messages.push({
                    role: "user",
                    content: [{
                        type: "tool_result", // content.type
                        tool_use_id: toolId,
                        content: toolResultContent ?? "",
                    }],
                });
            }
        }
    }


    async callToolTest(toolName: string, args: { [x: string]: unknown }) {
        if (!this.tools.some(tool => tool.name === toolName)) {
            throw new Error(`Tool ${toolName} not found`);
        }
        console.log(`Calling tool: ${toolName} with args:`, args);
        const result = await this.mcp.callTool({
            name: toolName,
            arguments: args as { [x: string]: unknown },
        });
        return result;
    }

    async cleanup() {
        await this.mcp?.close();
    }
}

export default MCPClient;