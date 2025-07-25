// // anthropic sdk
// import {
//     Tool,
// } from "@anthropic-ai/sdk/resources/messages/messages.mjs";

// // mcp sdk
// import { Client } from "@modelcontextprotocol/sdk/client/index.js";
// import { Transport } from "@modelcontextprotocol/sdk/shared/transport";
// import { GoogleGenAI, FunctionCallingConfigMode, mcpToTool, Content, ToolUnion } from '@google/genai';

// import dotenv from "dotenv";
// import readline from "readline/promises";
// import { text } from "stream/consumers";
// import { triggerRefreshAgentMessage } from "../main";

// dotenv.config();

// const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
// if (!ANTHROPIC_API_KEY) {
//     throw new Error("ANTHROPIC_API_KEY is not set");
// }

// class GeminiMcpClient {
//     private mcp: Client;
//     private llm: GoogleGenAI;
//     private tools: ToolUnion[] = [];

//     constructor() {
//         this.llm = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
//         this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
//     }

//     // Connect to the MCP
//     async connectToServer(transports: Transport | Transport[]) {
//         const transportArray = Array.isArray(transports) ? transports : [transports];

//         for (const transport of transportArray) {
//             await this.mcp.connect(transport);
//         }

//         // Register tools
//         const toolsResult = await this.mcp.listTools();
//         this.tools = [
//             {
//                 functionDeclarations: toolsResult.tools.map(tool => ({
//                     name: tool.name,
//                     description: tool.description
//                 }))
//             }
//         ];


//         const serializedTools = JSON.stringify(this.tools);
//         console.log("Serialized tools:", serializedTools);
//     }

//     // Process query
//     async processQuery(query: string) {

//         const messages: Content[] = [
//             {
//                 role: "user", // 'model'
//                 parts: [{
//                     text: query,
//                 }]
//             }
//         ]

//         const texts: any[] = [];

//         console.log("Processing query:", query);

//         // Loop until the model has no more function calls to make
//         while (true) {
//             const result = await this.llm.models.generateContent({
//                 model: "gemini-2.0-flash",
//                 contents: messages,
//                 config: {
//                     tools: this.tools,  // uses the session, will automatically call the tool
//                     systemInstruction: 
// `You are a helpful and proactive assistant embedded in an application that unifies access to Google Drive, OneDrive, Dropbox, and local files — all in a single, seamless interface.

// You have direct access to MCP tools that allow you to retrieve information, perform file operations, and manage user data across all connected storage providers without requiring users to switch platforms.

// Instructions:

// 1. **Always act first**:
//    - Use MCP tools immediately to retrieve information or perform actions.
//    - Do NOT prompt the user unless absolutely necessary.

// 2. **Tool invocation rules**:
//     - Use tools to gather information, such as listing files, checking connected accounts, or searching for files.
//     - **NEVER** respond with a question as it ends the conversation.
//     - **NEVER** ask the user for clarification as you can use tools to gather necessary information.
//     - If you need more information to proceed, use the **get_information_from_user** tool to ask the user for clarification.

// 3. **Response formatting**:
//    - Keep all responses short, clear, and direct.
//    - Do not restate the user’s request unless clarification is needed.

// 4. **Inference and fallback**:
//    - If information (like paths or accounts) can be retrieved using MCP tools, do so instead of asking the user.
//    - If a file path is inaccessible, suggest the closest valid alternative.
//    - If anything is unclear, call 'get_information_from_user' to request clarification.

// Examples:
// - If asked to find a file, search across all connected storage accounts automatically.
// - If asked to move a file but no destination is specified, call 'get_information_from_user' instead of asking directly.

// Failure to follow these rules will be considered a failure to perform your task.`,
//                     // Uncomment if you **don't** want the sdk to automatically call the tool
//                     automaticFunctionCalling: {
//                         disable: true,
//                     },
//                 },
//             });

//             console.log("Result:", result);
//             console.log("text:", result.text);
//             console.log("functionCalls:", result.functionCalls);
//             console.log("usageMetadata:", result.usageMetadata);

//             if (result.text) {
//                 // No more function calls, break the loop.
//                 console.log(result.text);
//                 texts.push(result.text);
//             }
//             if (result.functionCalls && result.functionCalls.length > 0) {
//                 const functionCall = result.functionCalls[0];

//                 const { name, args } = functionCall;

//                 const tool = this.tools.find(t => t.name === name);
//                 if (!tool) {
//                     throw new Error(`Unknown function call: ${name}`);
//                 }

//                 const toolResponse = await this.mcp.callTool({
//                     name: tool.name,
//                     arguments: args,
//                 });

//                 console.log("Tool result:", toolResponse);

//                 const contentArray = toolResponse.content as { type: string; text?: string }[];
//                 let toolResultContent: string | undefined;
//                 for (const toolContent of contentArray) {
//                     if (toolContent.type === "text") {
//                         texts.push(toolContent.text);
//                         toolResultContent = toolContent.text;
//                     } else if (toolContent.type === "tool_use") {
//                         console.warn("Unexpected tool_use content in tool result:", toolContent);
//                     }
//                 }

//                 const functionResponsePart = {
//                     name: functionCall.name,
//                     response: {
//                         result: toolResponse,
//                     },
//                 };

//                 // Send the function response back to the model.
//                 messages.push({
//                     role: "model",
//                     parts: [
//                         {
//                             functionCall: functionCall,
//                         },
//                     ],
//                 });
//                 messages.push({
//                     role: "user",
//                     parts: [
//                         {
//                             functionResponse: functionResponsePart,
//                         },
//                     ],
//                 });
//                 triggerRefreshAgentMessage(texts.join("\n"));
//             } else {
//                 break;
//             }
//         }

//         return texts.join("\n") + "\n";
//     }

//     async callToolTest(toolName: string, args: { [x: string]: unknown }) {
//         // Call the tool with the given query
//         // triggerOpenAccountWindow("cloud", "agent opened", undefined, CloudType.GoogleDrive, "sohn5312@gmail.com");
//         // triggerChangeDirectoryOnAccountWindow(CloudType.GoogleDrive, "sohn5312@gmail.com", "/easyAccess");
//         if (!this.tools.some(tool => tool.name === toolName)) {
//             throw new Error(`Tool ${toolName} not found`);
//         }
//         console.log(`Calling tool: ${toolName} with args:`, args);
//         const result = await this.mcp.callTool({
//             name: toolName,
//             arguments: args as { [x: string]: unknown },
//         });
//         return result;
//     }

//     async cleanup() {
//         await this.mcp.close();
//     }
// }

// export default GeminiMcpClient;