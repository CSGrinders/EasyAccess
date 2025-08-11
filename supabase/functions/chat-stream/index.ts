// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.
// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Anthropic } from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
const toolResultPromises = new Map();
const MONTHLY_REQUEST_LIMIT = 50; // Monthly request limit per user
let cachedTools = null;
async function fetchTools() {
  try {
    if (cachedTools) {
      console.log("Using cached tools");
      return cachedTools;
    }
    const bucketName = "tool-definitions";
    const filePath = "toolset.json";
    // Download file from storage
    const { data, error } = await supabase.storage.from(bucketName).download(filePath);
    if (error || !data) {
      return new Response(`Failed to download file: ${error?.message}`, {
        status: 500
      });
    }
    // data is a ReadableStream — read it fully
    const toolResponse = await new Response(data).json();
    if (!Array.isArray(toolResponse)) {
      throw new Error('Tools response is not an array');
    }
    const tools = toolResponse.map((tool)=>({
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema
      }));
    tools[tools.length - 1].cache_control = {
      "type": "ephemeral"
    };
    // Cache the tools for future requests
    cachedTools = tools;
    return tools;
  } catch (err) {
    // Return empty array instead of throwing
    return [];
  }
}
async function streamClaudeResponse(messages, tools, connected_accounts, allowed_directories) {
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
async function incrementUserRequestCount(userEmail) {
  const { error } = await supabase.rpc("increment_request_count", {
    user_email_input: userEmail
  });
  if (error) {
    console.error("Error updating user requests track:", error);
    socket.send(JSON.stringify({
      type: "error",
      error: "Error updating user requests track: " + error.message
    }));
    return false;
  }
  return true;
}
async function getUserFromJwt(jwt) {
  if (!jwt) {
    return null;
  }
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) {
    return null;
  }
  return user;
}
async function checkUserLimit(user) {
  // Need to make sure that the user email is unique to each user to avoid conflicts
  const { data: userRequestsTrack, error: userRequestsError } = await supabase.from('userRequestTrack').select('*').eq('user_email', user.email).limit(1);
  if (userRequestsError) {
    return false;
  }
  // last_request_date YYYY-MM-DD format
  const lastRequestDate = userRequestsTrack.length > 0 ? userRequestsTrack[0].last_request_date : null;
  const parsedDate = lastRequestDate ? new Date(lastRequestDate).getTime() : null;
  // Check if the user has made less than 50 request in this month
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const lastRequestMonth = parsedDate ? new Date(parsedDate).getMonth() : null;
  const lastYear = parsedDate ? new Date(parsedDate).getFullYear() : null;
  const isNewMonth = currentMonth !== lastRequestMonth || currentYear !== lastYear;
  if (userRequestsTrack.length === 0 || isNewMonth || userRequestsTrack[0].requests < MONTHLY_REQUEST_LIMIT) {
    // Insert or update the user request track
    return true;
  } else {
    console.log("User request limit reached or not found, returning error");
    return false;
  }
}
// Deno Server with Claude Streaming
Deno.serve(async (req)=>{
  // if (req.method !== "POST") {
  //   return new Response("Method not allowed", { status: 405 });
  // }
  const url = new URL(req.url);
  // Handle the specific endpoint
  const upgrade = req.headers.get('upgrade') || '';
  if (upgrade.toLowerCase() === 'websocket') {
    try {
      // parse the jwt from the parameters
      const jwt = url.searchParams.get('token');
      // Get user from JWT
      const user = await getUserFromJwt(jwt);
      if (!user) {
        console.error("User not found or invalid JWT");
        return new Response('Unauthorized', {
          status: 401
        });
      }
      // check for the user request limit
      const canProceed = await checkUserLimit(user);
      if (!canProceed) {
        return new Response(JSON.stringify({
          message: "User request limit reached"
        }), {
          status: 403
        });
      }
      const { socket: socket1, response } = Deno.upgradeWebSocket(req);
      socket1.onopen = ()=>console.log(`WebSocket opened for user: ${user.email}`);
      socket1.onmessage = async (e)=>{
        console.log('Received:', e.data);
        // Parse the incoming message
        const { type, content, tool_use_id, connected_accounts, allowed_directories, messages } = await JSON.parse(e.data);
        if (type == "query") {
          // increment the user request count
          const result = await incrementUserRequestCount(user.email);
          if (!result) {
            socket1.send(JSON.stringify({
              type: "error",
              error: "Error updating user requests track"
            }));
            return;
          }
          // socket.send(`Echo: ${e.data} - ${new Date().toString()} - ${query}`);
          try {
            // Set up SSE headers
            // sse is for streaming the response from Claude
            const headers = new Headers({
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Headers": "Content-Type"
            });
            let stop = false;
            // Load conversation context - FIX: Remove duplicate message
            // const messages = [
            //   {
            //     role: "user",
            //     content: content
            //   }
            // ];
            let socketClosed = false;
            while(!stop){
              const stream = new ReadableStream({
                async start (controller) {
                  try {
                    // Send initial connection confirmation
                    controller.enqueue(`${JSON.stringify({
                      type: 'connection',
                      text: 'Stream connected'
                    })}\n\n`);
                    console.log("Messages prepared:", messages);
                    // Get tools
                    const tools = await fetchTools();
                    if (!tools || tools.length === 0) {
                      console.warn("No tools fetched, proceeding without tools");
                      controller.close();
                      return;
                    }
                    let fullResponse = "";
                    let toolCalls = [];
                    // Process streaming response
                    // Create Claude stream
                    const claudeStream = await streamClaudeResponse(messages, tools, connected_accounts, allowed_directories);
                    let currentToolCall = null;
                    let inputJsonBuffer = null;
                    for await (const chunk of claudeStream){
                      switch(chunk.type){
                        case 'message_start':
                          controller.enqueue(`${JSON.stringify({
                            type: 'start',
                            conversationId: "conversationId"
                          })}\n\n`);
                          break;
                        case 'content_block_start':
                          if (chunk.content_block.type === 'text') {
                            controller.enqueue(`${JSON.stringify({
                              type: 'content_start',
                              block_type: 'text'
                            })}\n\n`);
                          } else if (chunk.content_block.type === 'tool_use') {
                            currentToolCall = chunk.content_block;
                            inputJsonBuffer = "";
                          }
                          break;
                        case 'content_block_delta':
                          if (chunk.delta.type === 'text_delta') {
                            fullResponse += chunk.delta.text;
                            controller.enqueue(`${JSON.stringify({
                              type: 'text_delta',
                              text: chunk.delta.text
                            })}\n\n`);
                          } else if (chunk.delta.type === 'input_json_delta') {
                            inputJsonBuffer += chunk.delta.partial_json;
                          }
                          break;
                        case 'content_block_stop':
                          controller.enqueue(`${JSON.stringify({
                            type: 'content_stop'
                          })}\n\n`);
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
                            await processToolCallsStreaming(toolCalls, controller, "conversationId", messages);
                          } else {
                            console.log("No tool calls to process");
                            stop = true;
                          }
                          // here now messages contains the response from Claude and any tool results
                          console.log("Final messages prepared:", messages);
                          controller.enqueue(`${JSON.stringify({
                            type: 'complete'
                          })}\n\n`);
                          break;
                        default:
                          console.log("Unknown chunk type:", chunk.type);
                      }
                    }
                  } catch (error) {
                    console.error("Error in stream processing:", error);
                    controller.enqueue(`${JSON.stringify({
                      type: 'error',
                      error: error.message,
                      stack: error.stack
                    })}\n\n`);
                    stop = true; // Stop the stream on error
                  } finally{
                    console.log("Closing SSE stream");
                    controller.close();
                  }
                }
              });
              await stream.pipeTo(new WritableStream({
                write (chunk) {
                  socket1.send(chunk);
                },
                close () {
                  console.log("All chunks sent. Ready to close WebSocket.");
                }
              })).then(()=>{
                console.log("pipeTo finished. Closing WebSocket.");
                if (stop) {
                  socket1.close();
                  socketClosed = true;
                }
              }).catch((err)=>{
                console.error("Stream piping failed:", err);
                socket1.close(); // close on failure to pipe
              });
            }
          } catch (error) {
            console.error("Error in main handler:", error);
            socket1.close();
          }
        } else if (type == "tool_result") {
          // Handle the tool result
          const resultContent = content;
          const toolUseId = tool_use_id;
          const pendingPromise = toolResultPromises.get(toolUseId);
          if (pendingPromise) {
            pendingPromise.resolve({
              content: resultContent
            });
            toolResultPromises.delete(toolUseId);
          } else {
            console.warn("No pending promise found for tool use ID:", toolUseId);
          }
        }
      };
      socket1.onerror = (e)=>console.log('WebSocket error:', e);
      socket1.onclose = ()=>console.log('WebSocket closed');
      return response;
    } catch (error) {
      console.error('WebSocket upgrade failed:', error);
      return new Response('WebSocket upgrade failed', {
        status: 500
      });
    }
  } else {
    // Handle regular HTTP requests to this endpoint
    return new Response('This endpoint requires WebSocket upgrade', {
      status: 400
    });
  }
});
// Tool execution with streaming updates
async function processToolCallsStreaming(toolCalls, controller, conversationId, messages) {
  for (const toolCall of toolCalls){
    const toolResultPromise = new Promise((resolve, reject)=>{
      toolResultPromises.set(toolCall.id, {
        resolve,
        reject
      });
      setTimeout(()=>{
        if (toolResultPromises.has(toolCall.id)) {
          console.warn("Tool execution timed out, rejecting promise");
          reject(new Error("Tool execution timed out"));
        }
      }, 40000); // 40 seconds timeout
    });
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
    controller.enqueue(`${JSON.stringify({
      type: 'tool_use',
      name: toolCall.name,
      input: toolCall.input || {},
      tool_use_id: toolCall.id
    })}\n\n`);
    try {
      // get the result from the tool call from the desktop client
      // wait until the tool result is received from the client
      const result = await toolResultPromise;
      console.log("Tool result received:", result);
      const contentArray = result.content;
      let toolResultContent;
      for (const toolContent of contentArray){
        if (toolContent.type === "text") {
          // texts.push(toolContent.text);
          toolResultContent = toolContent.text;
        } else if (toolContent.type === "tool_use") {
          console.warn("Unexpected tool_use content in tool result:", toolContent);
        }
      }
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: toolResultContent ?? ""
          }
        ]
      });
      return result;
    } catch (error) {
      console.error("Tool execution error:", error);
      controller.enqueue(`${JSON.stringify({
        type: 'tool_error',
        tool_id: toolCall.id,
        error: error.message
      })}\n\n`);
      return "Tool execution failed";
    }
  }
}
