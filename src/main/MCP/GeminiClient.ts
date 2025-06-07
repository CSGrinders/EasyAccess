// anthropic sdk
import { Anthropic } from "@anthropic-ai/sdk";
import {
    MessageParam,
    Tool,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";

// mcp sdk
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport";
import { GoogleGenAI, FunctionCallingConfigMode , mcpToTool, Content} from '@google/genai';

import dotenv from "dotenv";
import readline from "readline/promises";
import { text } from "stream/consumers";

dotenv.config();


const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
}

class mcpClient {
    private mcp: Client;
    private llm: Anthropic;
    // private llm: GoogleGenAI;
    private tools: Tool[] = [];

    constructor() {
        // this.llm = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        this.llm = new Anthropic({
            apiKey: ANTHROPIC_API_KEY,
            // baseUrl: "https://api.anthropic.com", // Uncomment if you need to set a custom base URL
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
    async processQuery(query: string) {
        // call th llm
        const messages: MessageParam[] = [
            {
                role: "user",
                content: query,
            },
        ];

        // console.log("Processing query this.tools: ", this.tools);

        // const messages: Content[] = [
        //     {
        //         role: "user", // 'model'
        //         parts: [{
        //             text: query,
        //         }]
        //     }
        // ]

        
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
                system: "You are a smart assistant that can answer questions and use tools to help users.",
            });


            // // Send request to the model with MCP tools
            // const response = await this.llm.models.generateContent({
            //     model: "gemini-2.0-flash-lite",
            //     contents: messages,
            //     config: {
            //         tools: [mcpToTool(this.mcp)],  // uses the session, will automatically call the tool
            //         // Uncomment if you **don't** want the sdk to automatically call the tool
            //         // automaticFunctionCalling: {
            //         //   disable: true,
            //         // },
            //     },
            // });

            // // check the response
            // console.log("LLM Response:", response);
            // console.log(response.text);
            // console.log(response.data);
            // console.log(response.functionCalls);
            // console.log(response.codeExecutionResult);
            // console.log(response.executableCode);

            // break;

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
            if (!tool_used) {
                break; // no more tool calls, exit loop
            }
        }

        return texts.join("\n") + "\n";
    }

    async cleanup() {
        await this.mcp.close();
    }
}

export default mcpClient;