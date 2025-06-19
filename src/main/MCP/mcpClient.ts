// anthropic sdk
import { Anthropic } from "@anthropic-ai/sdk";
import {
    MessageParam,
    Tool,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";

// mcp sdk
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport";

import dotenv from "dotenv";
dotenv.config();


const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
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
    }

    // Process query
    async processQuery(query: string, mainWindow: Electron.BrowserWindow | null = null): Promise<string> {
        // call th llm
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
            if (mainWindow) {
                mainWindow.webContents.send('reload-agent-message', texts.join("\n") + "\n");
            }
            if (!tool_used) {
                break; // no more tool calls, exit loop
            }
        }

        return texts.join("\n") + "\n";
    }

    async callToolTest(toolName: string, args: { [x: string]: unknown }) {
        // Call the tool with the given query
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