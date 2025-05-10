/** @jsxImportSource npm:hono/jsx */

import { filterAsync, yMapIterate } from "https://esm.sh/@cxai/stream";
import { generateObject } from "https://esm.sh/ai";
import { connectYjs } from "https://esm.town/v/dinavinter/connect";
import onlyOnce from "https://esm.town/v/dinavinter/dcom/async/o";
import type { Account } from "https://esm.town/v/dinavinter/dcom/user";
import { renderer } from "https://esm.town/v/dinavinter/htmx_layout";
import { sse as yTextSse, text as yTextStream } from "https://esm.town/v/dinavinter/yText";
import { ulid } from "jsr:@std/ulid@1";
import { azure } from "npm:@ai-sdk/azure";
import { streamText as streamAIText } from "npm:ai";
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { streamSSE, streamText } from "npm:hono/streaming";
import * as Y from "npm:yjs";
import { z } from "npm:zod";
/*
env:
YJS_URL=wss://yjs.cfapps.us10-001.hana.ondemand.com
...

 */

const doc = new Y.Doc({ guid: "@mvbot1" });
connectYjs(doc);

// once on each request
const { listen, state } = onlyOnce(async function*() {
    for await (const [key] of yMapIterate(doc.getMap("messages"))) {
        yield [key, key];
    }
}, { state: doc.getMap("status") });

// Listen for new messages and process them.
listen(async function processMessage(id: string) {
    const message = doc.getMap(id);
    const ytext = doc.getText(`txt.${id}`);
    console.log("Starting request for message:", id);

    // Stream AI response using OMDB-adapted tools.
    const { fullStream } = await streamAIText({
        model: azure("gpt-4o"),
        prompt: `Process this request: ${JSON.stringify(message.toJSON())}`,
        temperature: 0.9,
        system: "You are a video manager assistant. Use available tools for video search and retrieval.",
        tools: {
            searchLocal: {
                description: "Search for a video on the local machine",
                parameters: z.object({
                    search_string: z.string().describe("Name of the video to search for"),
                }),
                execute: async (request) => {
                    console.log("about to search", JSON.stringify(request).replace(/"/g, "'"), "https://duv.urikiller.com:53769");
                    const response = await fetch(
                        `https://duv.urikiller.com:53769/video/search_local?search_string=${
                            encodeURIComponent(request.search_string)
                        }`,
                    );
                    console.log("search response", response);
                    const data = await response.json();
                    message.set("searchLocal", data);
                    return JSON.stringify(data);
                },
            },
            // searchInternet: {
            //   description: "Search for a video on the internet",
            //   parameters: z.object({
            //     search_string: z.string().describe("Name of the video to search for"),
            //   }),
            //   execute: async (request) => {
            //     const response = await fetch(
            //       `https://duv.urikiller.com:53769/video/search_internet?search_string=${
            //         encodeURIComponent(request.search_string)
            //       }`,
            //     );
            //     const data = await response.json();
            //     message.set("searchInternet", data);
            //     return data;
            //   },
            // },
        },
    });
    for await (const part of fullStream) {
        if (part.type == "text-delta") {
            ytext.insert(ytext.length, part.textDelta);
        }
    }
    doc.transact(() => {
        message.set("status", "done");
    });
});

const app = new Hono();
app.use("/*", cors());

app.get("/message/:id", c =>
    streamText(c, async (stream) => {
        const uld = c.req.param("id");
        await yTextStream(stream, doc.getText(`txt.${uld}`));
        for await (const [key] of yMapIterate(doc.getMap(uld))) {
            if (doc.getMap(uld).get("status") === "done") {
                return;
            }
        }
    }));

// view
app.get("*", renderer());
app.post("/message", async c => {
    const uld = ulid();
    const body = await c.req.formData() as FormData;
    const message = body.get("message") as string;
    console.log(message);
    doc.transact(() => {
        doc.getMap(uld).set("user", message);
        doc.getMap("messages").set(uld, doc.getMap(uld).set("user", message));
    });
    // return new message div
    return c.render(
        <div class="mb-4">
            <div class="flex flex-col space-y-2">
                <div class="flex justify-end">
                    <div class="bg-blue-500 text-white rounded-lg py-2 px-4 max-w-xs">
                        {message}
                    </div>
                </div>
                <div class="flex justify-start">
                    <div
                        class="bg-gray-200 text-gray-800 rounded-lg py-2 px-4 max-w-xs"
                        hx-get={`/message/${uld}`}
                        hx-trigger="load"
                    >
                        <div class="animate-pulse">Thinking...</div>
                    </div>
                </div>
            </div>
        </div>,
    );
});

app.get(
    "/",
    c =>
        c.render(
            <div className="bg-gray-100 min-h-screen">
                <style>
                    {`
            .typing-indicator {
              display: inline-block;
              position: relative;
              width: 50px;
              height: 20px;
            }
            .typing-indicator span {
              position: absolute;
              bottom: 0;
              width: 8px;
              height: 8px;
              border-radius: 50%;
              background-color: #3b82f6;
              animation: typing 1s infinite ease-in-out;
            }
            .typing-indicator span:nth-child(1) {
              left: 0;
              animation-delay: 0.1s;
            }
            .typing-indicator span:nth-child(2) {
              left: 15px;
              animation-delay: 0.2s;
            }
            .typing-indicator span:nth-child(3) {
              left: 30px;
              animation-delay: 0.3s;
            }
            @keyframes typing {
              0% { transform: translateY(0px); }
              50% { transform: translateY(-10px); }
              100% { transform: translateY(0px); }
            }
            .pulse {
              animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
            }
            @keyframes pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: .5; }
            }
          `}
                </style>

                <div class="container mx-auto max-w-3xl p-4">
                    <header class="bg-white shadow-md rounded-lg p-4 mb-6">
                        <h1 class="text-2xl font-bold text-center text-blue-600">Movie Assistant</h1>
                        <p class="text-center text-gray-600">Ask about any movie or use voice commands</p>
                    </header>

                    <div class="bg-white shadow-md rounded-lg p-4 mb-6">
                        <div id="chat-container" class="h-96 overflow-y-auto mb-4 p-2">
                            <div id="output" class="space-y-4"></div>
                        </div>

                        <form
                            hx-post="/message"
                            hx-trigger="submit"
                            hx-target="#output"
                            hx-swap="beforeend"
                            class="flex flex-col space-y-2"
                        >
                            <div class="flex items-center space-x-2">
                                <input
                                    type="text"
                                    name="message"
                                    id="message-input"
                                    placeholder="Ask about a movie..."
                                    class="flex-grow p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <button
                                    type="button"
                                    id="voice-btn"
                                    class="bg-blue-500 text-white p-3 rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        class="h-6 w-6"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                                        />
                                    </svg>
                                </button>
                            </div>
                            <button
                                type="submit"
                                class="w-full bg-blue-500 text-white p-3 rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                Send Message
                            </button>
                        </form>

                        <div id="voice-status" class="mt-2 text-center text-sm text-gray-500 hidden">
                            <div class="flex items-center justify-center">
                                <div class="typing-indicator mr-2">
                                    <span></span>
                                    <span></span>
                                    <span></span>
                                </div>
                                <span>Listening..</span>
                            </div>
                        </div>
                    </div>

                    <div class="bg-white shadow-md rounded-lg p-4">
                        <div class="flex justify-between items-center mb-2">
                            <h2 class="text-xl font-semibold">Debug Info</h2>
                            <button
                                id="toggle-debug"
                                class="text-sm text-blue-500 hover:text-blue-700"
                            >
                                Toggle
                            </button>
                        </div>
                        <div id="debug-panel" class="hidden">
              <pre
                  hx-get="/inspect"
                  hx-trigger="every 1s"
                  id="inspect"
                  class="bg-gray-100 p-4 border rounded-lg h-64 overflow-auto text-xs"
              ></pre>
                        </div>
                    </div>
                </div>
                <script src="/movies-bot.js"></script>
            </div>,
        ),
);

app.get("movies-bot.js", c =>
    c.text(`  
            // Web Speech API implementation
            document.addEventListener('DOMContentLoaded', () => {
              const voiceBtn = document.getElementById('voice-btn');
              const messageInput = document.getElementById('message-input');
              const voiceStatus = document.getElementById('voice-status');
              const toggleDebug = document.getElementById('toggle-debug');
              const debugPanel = document.getElementById('debug-panel');
              
              // Check if browser supports speech recognition
              const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
              
              if (!SpeechRecognition) {
                voiceBtn.disabled = true;
                voiceBtn.classList.add('opacity-50');
                voiceBtn.title = 'Speech recognition not supported in this browser';
                return;
              }
              
              const recognition = new SpeechRecognition();
              recognition.continuous = false;
              recognition.interimResults = true;
              recognition.lang = 'en-US';
              
              let isListening = false;
              
              voiceBtn.addEventListener('click', () => {
                if (isListening) {
                  recognition.stop();
                } else {
                  messageInput.value = '';
                  recognition.start();
                  voiceStatus.classList.remove('hidden');
                  isListening = true;
                  voiceBtn.classList.add('bg-red-500');
                  voiceBtn.classList.remove('bg-blue-500');
                }
              });
              
              recognition.onresult = (event) => {
                const transcript = Array.from(event.results)
                  .map(result => result[0])
                  .map(result => result.transcript)
                  .join('');
                
                messageInput.value = transcript;
              };
              
              recognition.onend = () => {
                isListening = false;
                voiceStatus.classList.add('hidden');
                voiceBtn.classList.remove('bg-red-500');
                voiceBtn.classList.add('bg-blue-500');
              };
              
              recognition.onerror = (event) => {
                console.error('Speech recognition error', event.error);
                isListening = false;
                voiceStatus.classList.add('hidden');
                voiceBtn.classList.remove('bg-red-500');
                voiceBtn.classList.add('bg-blue-500');
              };
              
              // Toggle debug panel
              toggleDebug.addEventListener('click', () => {
                debugPanel.classList.toggle('hidden');
              });
              
              // Auto-scroll chat to bottom when new messages arrive
              const chatContainer = document.getElementById('chat-container');
              const output = document.getElementById('output');
              
              // Create a MutationObserver to watch for changes in the chat output
              const observer = new MutationObserver(() => {
                chatContainer.scrollTop = chatContainer.scrollHeight;
              });
              
              // Start observing the output element for changes
              observer.observe(output, { childList: true, subtree: true });
            });`));

app.get(
    "/doc",
    (c) =>
        c.text(
            JSON.stringify(
                doc.toJSON(),
                null,
                2,
            ),
        ),
);

app.get(
    "/inspect",
    (c) =>
        c.text(
            JSON.stringify(
                Array.from(doc.getMap("messages").keys())
                    .sort((a, b) => a.localeCompare(b))
                    .map(key => ({
                        ...state.get(key),
                        ...doc.getMap(key).toJSON(),
                    })),
                null,
                2,
            ),
        ),
);

export default app.fetch;