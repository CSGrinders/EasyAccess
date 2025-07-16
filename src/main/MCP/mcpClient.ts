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

import dotenv from "dotenv";
import { triggerAgentWorkStop, triggerToolResultMessage, triggerGetFileOnRenderer, triggerGracefulClose, triggerOpenAccountWindow, triggerRefreshAgentMessage, triggerSendTextDelta } from "../main";
import { CloudType } from "../../types/cloudType";
import fs from 'fs';
import { getConnectedCloudAccounts } from "../cloud/cloudManager";

import Store from 'electron-store';

dotenv.config({ path: '.env' });
const store = new Store();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
}

const getSupabaseJwt = async (email: string) => {
}

class MCPClient {
    private mcp: Client;
    private llm: Anthropic;
    private tools: Tool[] = [];

    constructor() {
        this.llm = new Anthropic({
            apiKey: ANTHROPIC_API_KEY,
        });
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

    // Process query
    async processQuery(query: string, access_token: string): Promise<string> {
        console.log("Processing query:", query);

//         // temp: just testing rendering messages in renderer process
//         const characters = `"The House on Thornhill Road"
// Chapter 1: The Letter

// When Eleanor Grange received the letter, she thought it was a joke.

// The envelope was thick, the paper creamy and smooth. Her name, written in an elegant, almost calligraphic hand, danced across the front: Miss Eleanor L. Grange, 52 Roseland Lane, Apt. 3C. No return address. Just a red wax seal stamped with a rose and thorn.

// She opened it out of curiosity. Inside, a letter:

// Dearest Eleanor,

// I trust this reaches you in good health. You are the last surviving heir to the Grange estate in Windmere. The house on Thornhill Road now belongs to you.

// Your grandfather, Alaric Grange, left strict instructions in the event of his passing. You must come alone. Do not delay. The house is waiting.

// Yours in utmost sincerity,
// Samuel Thorne, Executor

// Eleanor blinked. Her grandfather had died twenty-five years ago. She’d been ten years old, and remembered only fragments—his peculiar voice, the scent of pipe smoke, the locked study that no one was ever allowed to enter.

// “Windmere,” she whispered. “I haven’t heard that name in years.”

// The town had vanished from her memory, like a dream forgotten upon waking. But now, something stirred—an image of a gray house, choked in ivy, windows like dark eyes.

// And so, without truly knowing why, she packed a bag and boarded a train.`;
//         for (let i = 0; i < Math.floor(characters.length / 3); i++) {
//             await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 50)));
//             await triggerSendTextDelta(characters.substring(i * 3, i * 3 + 3));
//             if (i % 50 == 0) {
//                 const response = await this.mcp.callTool({
//                     name: "get_information_from_user",
//                     arguments: {
//                         question: "Testing user input",
//                     },
//                 });
//                 console.log("Response from get_information_from_user:", response);
//                 await triggerToolResultMessage("get_information_from_user", { question: "Testing user input" }, [{ text: response }]);
//             }
//         }
//         return "s";

        const connectedAccountsText = await this.getConnectedAccountsText();

        const jwt: string | null = access_token;
        if (!jwt) {
            throw new Error("Failed to get Supabase JWT");
        }

        const texts: string[] = [];
        const jwtToken = jwt.replace('\r\n', '');
        const ws = new WebSocket(
            "wss://lliuckljienxmohsoitv.supabase.co/functions/v1/chat-stream?token=" + jwtToken
        );
        ws.onopen = () => ws.send(JSON.stringify({ 
            type: "query",
            content: query,
            tool_use_id: "",
            connected_accounts: connectedAccountsText,
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
                        const result = await this.mcp.callTool({
                            name: toolName,
                            arguments: toolArgs || {},
                        });
                        ws.send(JSON.stringify({
                            type: "tool_result",
                            content: result.content,
                            tool_use_id: toolId,
                            connected_accounts: connectedAccountsText,
                        }));
                        console.log("Tool result:", result);
                        // check if the result is error
                        triggerToolResultMessage(toolName, toolArgs, result.content, result.error);
                    }
                } else if (response.type === "content_stop") {
                    console.warn("Content stop detected in response:", response);
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
            // Handle WebSocket close if needed
        };


        // seems not synchronized well here... but keep it for now
        return texts.join("") + "\n";

        /*

        // call the llm
        const messages: MessageParam[] = [
            {
                role: "user",
                content: query,
            },
        ];



        const texts: any[] = [];
        const toolCalls: { name: string; arguments: { [x: string]: unknown } }[] = [];

        while (true) {
            console.log("Sending messages to LLM:", messages);
            const response = await this.llm.messages.create({
                model: "claude-3-5-haiku-20241022",
                max_tokens: 1000,
                messages,
                tools: this.tools,
                tool_choice: { type: 'auto' },
                system: "You are an assistant that answers questions and uses tools to help. " +
                        "Our app connects Google Drive, OneDrive, Dropbox, and local files in one view." +
                        "Always reply in a way that is simple, short, and straight to the point.",
            });

            // add the llm response to messages for next iteration
            messages.push({
                role: "assistant",
                content: response.content,
            });

            // if text -> return response
            let tool_used = false;
            for (const content of response.content) {
                console.log("API Message Content:", content);
                if (content.type === "text") {
                    console.log("Response Text content:", content.text);
                    texts.push(content.text);
                } else if (content.type === "tool_use") {
                    tool_used = true;
                    // if tool -> call the tool on mcp server
                    const toolName = content.name;
                    const toolArgs = content.input as { [x: string]: unknown } | undefined;
                    toolCalls.push({
                        name: toolName,
                        arguments: toolArgs || {},
                    });
                    const result = await this.mcp.callTool({
                        name: toolName,
                        arguments: toolArgs || {}
                    });

                    console.log("Tool result:", result);

                    const contentArray = result.content as { type: string; text?: string }[];
                    let toolResultContent: string | undefined;
                    for (const toolContent of contentArray) {
                        if (toolContent.type === "text") {
                            texts.push(toolContent.text);
                            toolResultContent = toolContent.text;
                        } else if (toolContent.type === "tool_use") {
                            console.warn("Unexpected tool_use content in tool result:", toolContent);
                        }
                    }
                    messages.push({
                        role: "user",
                        content: [{
                            type: "tool_result", // content.type
                            tool_use_id: content.id,
                            content: toolResultContent ?? "",
                        }],
                    });
                }
            }
            triggerRefreshAgentMessage(texts.join("\n") + "\n");
            //type: string, title: string, icon?: React.ReactNode, cloudType?: CloudType, accountId?: string
            if (!tool_used) {
                break; // no more tool calls, exit loop
            }
        }

        return texts.join("\n") + "\n";
        */
    }

    async callToolTest(toolName: string, args: { [x: string]: unknown }) {
        // Call the tool with the given query
        // triggerOpenAccountWindow("cloud", "agent opened", undefined, CloudType.GoogleDrive, "sohn5312@gmail.com");
        // triggerChangeDirectoryOnAccountWindow(CloudType.GoogleDrive, "sohn5312@gmail.com", "/easyAccess");
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
        await this.mcp.close();
    }
}

export default MCPClient;