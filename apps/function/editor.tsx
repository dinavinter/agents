/** @jsxImportSource npm:hono/jsx */

// ─── IMPORTS ──────────────────────────────────────────────────────────────

import { yMapIterate } from "https://esm.sh/@cxai/stream";
import * as Y from "https://esm.sh/yjs@13.6.23";
import { connectYjs } from "https://esm.town/v/dinavinter/connect";
import { DenoHandlerFileItemSchema } from "https://esm.town/v/dinavinter/cxai/schema";
import onlyOnce from "https://esm.town/v/dinavinter/dcom/async/o";
import { renderer } from "https://esm.town/v/dinavinter/htmx_layout";
import { ulid } from "jsr:@std/ulid@1";
import { azure } from "npm:@ai-sdk/azure";
import {  streamObject } from "npm:ai";
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { streamSSE } from "npm:hono/streaming";
import { syncstatements } from "https://esm.town/v/dinavinter/cxai/transform/statements";
import {continuousRun} from "https://esm.town/v/dinavinter/cxai/transform/module";

const app = new Hono();
const agent = "editor-768";
const ydoc = new Y.Doc({ guid: agent });
connectYjs(ydoc);

const {  importsMap, declarationsMap, exportsMap } = syncstatements(ydoc);

const {  getHandler} = continuousRun(ydoc);


// Maps for handling requests and AI responses.
const requests = ydoc.getMap("requests");



// ─── AI STREAMING LOGIC ─────────────────────────────────────────────────────

const { listen, state, output } = onlyOnce(
    async function*() {
        for await (const [key] of yMapIterate(requests)) {
            yield [key, requests.get(key)];
        }
    },
    {
        state: ydoc.getMap("@handler"),
        output: ydoc.getArray("@handler.output"),
    },
);  

listen(async function(request) {
    console.log("processing request", request);
    const { elementStream, object } = streamObject({
        model: azure("gpt-4o"),
        output: "array",
        schema: DenoHandlerFileItemSchema,
        temperature: 0.7,
        prompt: `Create a Deno handler file with a fetch endpoint returning "Hello World".
Include an "identifier" field for each item (e.g., for imports, use the package name).`,
        system:
            `You are an assistant that generates Deno handler files. Generate output exactly as specified below without extra text:
1. Import item: { type: "import", identifier: "<module-name>", module: "…", names: ["…"] }
2. Declaration item: { type: "declaration", identifier: "<declaration-name>", content: "…" }
3. Export item: { type: "export", identifier: "<export-name>", exportType: "default", handler: { name: "fetch", params: ["request"], body: "…" } }
Follow the schema exactly and output only valid JSON. You must output at least one export default fetch.`,
    });
    for await (const element of elementStream) {
        const item = DenoHandlerFileItemSchema.parse(element);
        ydoc.transact(() => {
            ydoc.getMap(item.type).set(item.identifier, item);
        });
    }
    console.log("done", await object);
    return await object;
});

app.use("/*", cors());

app.get("*", renderer());

app.get("/live",async (c) => {
    const handler = getHandler();
    if (handler) {
        return await handler(c.req.raw);
    }
    return c.text("nothing yet");
})


// ─── VIEW / RENDERING ENDPOINTS ─────────────────────────────────────────────
 
app.get("/", (c) =>
    c.render(
        <div hx-ext="morph" class="h-screen w-screen container">
            {/* Request forms */}

            <form hx-target="#output" className="space-y-4 grid grid-cols-3 gap-4 grid-flow-col-dense">
                <input
                    type="text"
                    name="request"
                    id="request"
                    placeholder="Enter your request"
                    class="w-full p-2 border-2 border-slate-900 rounded"
                />

                <div className="space-x-4 grid-cols-subgrid col-span-3">
                    <button
                        type="submit"
                        hx-post="generate-mock"
                        hx-include="#request"
                        hx-target="#output"
                        className="p-2 border-2 border-slate-900 hover:border-blue-600 rounded"
                    >
                        Generate Mock
                    </button>

                    <button
                        type="submit"
                        hx-post="generate-code"
                        hx-include="#request"
                        hx-target="#output"
                        className="p-2 border-2 border-slate-900 hover:border-blue-600 rounded"
                    >
                        Generate
                    </button>
                </div>
                <pre id="output" class="p-2  border-slate-900  rounded"></pre>

            </form>
            {/* SSE streaming updates */}
            <pre
                hx-ext="sse"
                sse-connect="/status"
                sse-swap="message"
                sse-close="done"
                hx-swap="innerHTML transition:true"
            ></pre>
            <ts-editor
                class="h-96 w-full"
                value=""
                component={"codemirror"}
                url={Deno.env.get("YJS_URL") || ""}
                room={agent}
            >
            </ts-editor>
            <div class="h-96 w-full" hx-get={"/live"} hx-swap="innerHTML" hx-trigger={"every 4s"} class="h-96 w-full"></div>
            <script src="https://esm.sh/@cxai/ide" type="module"></script>
        </div>,
    ));

app.post("/generate-code", async (c) => {
    const { request } = await c.req.formData();
    const id = ulid();
    console.log("send request", id, request);
    requests.set(id, request || "write ts code only");
    return c.redirect(`/status/${id}`);
});

app.get("/status", async (c) =>
    streamSSE(c, async (stream) => {
        for await (const [key, { newValue }] of yMapIterate(state)) {
            if (newValue) {
                await stream.writeSSE({ data: newValue.status });
            }
        }
        await stream.writeSSE({ event: `done`, data: `done` });
    }));

app.get("/status/:id", async (c) =>
    streamSSE(c, async (stream) => {
        const { id } = c.req.param();
        for await (const [key, { newValue }] of yMapIterate(state)) {
            if (key == id && newValue) {
                await stream.writeSSE({ data: newValue.status });
            }
        }
        await stream.writeSSE({ event: `done`, data: `done` });
}));

app.get("/inspect", (c) =>
    c.json({
        doc: ydoc.toJSON(),
    }));



app.post("/generate-mock", async (c) => {
    const { request } = await c.req.formData();
   
    await new Promise(resolve => setInterval(resolve, 100));
    importsMap.set("xstate", {
        type: "import",
        module: "https://esm.sh/xstate",
        names: ["createMachine"],
    });
    await new Promise(resolve => setInterval(resolve, 100));

    declarationsMap.set("machine", {
        type: "declaration",
        tags: "declaration",
        content: `const machine = createMachine({
  id: "mymy",
  initial: "idle", 
  states: {
    idle: { on: { START: "running" } },
    running: { on: { STOP: "idle" } }
  }
});`,
    });
    await new Promise(resolve => setInterval(resolve, 100));

    exportsMap.set("fetch", {
        type: "export",
        exportType: "default",
        handler: {
            name: "fetch",
            params: ["request"],
            body: "return new Response('Hello world')",
        },
    });
    await new Promise(resolve => setInterval(resolve, 100));

    // });
    return c.text("ok");
});

// ─── EXPORT THE APP ─────────────────────────────────────────────────────────

export default  app;