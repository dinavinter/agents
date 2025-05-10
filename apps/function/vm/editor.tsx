/** @jsxImportSource npm:hono/jsx */

// ─── IMPORTS ──────────────────────────────────────────────────────────────

import { filterAsync, yMapIterate } from "https://esm.sh/@cxai/stream";
import * as Y from "https://esm.sh/yjs@13.6.23";
import { connectYjs } from "https://esm.town/v/dinavinter/connect";
import onlyOnce from "https://esm.town/v/dinavinter/dcom/async/o";
import { renderer } from "https://esm.town/v/dinavinter/htmx_layout";
import { ulid } from "jsr:@std/ulid@1";
import { azure } from "npm:@ai-sdk/azure";
import { smoothStream, streamObject, streamText } from "npm:ai";
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { streamSSE } from "npm:hono/streaming";
import { z } from "npm:zod";

// ─── SCHEMA DEFINITIONS ───────────────────────────────────────────────────

const ImportItemSchema = z.object({
    type: z.literal("import"),
    module: z.union([
        z.string().regex(/^npm:[\w\-.@\/]+$/),
        z.string().regex(/^(https?:\/\/)(deno\.land|esm\.sh)\/.+$/),
    ]),
    names: z.array(z.string()),
});

const DeclarationItemSchema = z.object({
    type: z.literal("declaration"),
    content: z.string(),
    name: z.string().optional(),
});

const ExportItemSchema = z.object({
    type: z.literal("export"),
    exportType: z.literal("default"),
    handler: z.object({
        name: z.literal("fetch"),
        params: z.array(z.string()).default(["request"]),
        body: z.string(),
    }),
});

// Union schema for each Deno handler file item.
const DenoHandlerFileItemSchema = z.union([
    ImportItemSchema,
    DeclarationItemSchema,
    ExportItemSchema,
]);

// Overall schema for an array output.
const DenoHandlerFileArraySchema = z.array(DenoHandlerFileItemSchema);

// ─── INITIALIZE Hono & Yjs DOCUMENT ───────────────────────────────────────

const app = new Hono();
const agent = "editor-26";

// Create a Yjs document and connect it.
const ydoc = new Y.Doc({ guid: agent });
connectYjs(ydoc);

// Get shared types from Yjs.
const yText = ydoc.getText("codemirror");
const requests = ydoc.getMap("requests");
const yMap = ydoc.getMap();

// ─── AI STREAMING LOGIC ───────────────────────────────────────────────────

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
        prompt: `Create a Deno handler file with a fetch endpoint returning "Hello World". `,
        system:
            `You are an assistant that generates Deno handler files. Generate output exactly as specified below without extra text:
1. Import item: { type: "import", module: "…", names: ["…"] }
2. Declaration item: { type: "declaration", content: "…" }
3. Export item: { type: "export", exportType: "default", handler: { name: "fetch", params: ["request"], body: "…" } }
Follow the schema exactly and output only valid JSON. You must output at least one export default fetch.`,
    });
    for await (const element of elementStream) {
        // Validate and push each element into its corresponding Y.Array.
        const item = DenoHandlerFileItemSchema.parse(element);
        ydoc.getArray(item.type).push([item]);
    }
    console.log("done", await object);
    return await object;
});

// ─── VIEW / RENDERING ENDPOINTS ─────────────────────────────────────────────

app.use("/*", cors());

app.get("*", renderer());

app.get("/", (c) =>
    c.render(
        <div hx-ext="morph" class="h-screen w-screen container">
            {/* Code editor form */}
            <form hx-target="#output" class="space-y-4">
                <input
                    type="text"
                    name="request"
                    id="request"
                    placeholder="Enter your request"
                    class="w-full p-2 border-2 border-slate-900 rounded"
                />
                <button
                    type="submit"
                    hx-post="generate-mock"
                    hx-include="#request"
                    class="p-2 border-2 border-slate-900 rounded bg-blue-500 text-white hover:bg-blue-600"
                >
                    Generate Mock
                </button>
            </form>
            <form hx-target="#output" class="space-y-4">
                <input
                    type="text"
                    name="request"
                    id="request"
                    placeholder="Enter your request"
                    class="w-full p-2 border-2 border-slate-900 rounded"
                />
                <button
                    type="submit"
                    hx-post="generate-code"
                    hx-include="#request"
                    class="p-2 border-2 border-slate-900 rounded bg-blue-500 text-white hover:bg-blue-600"
                >
                    Generate
                </button>
            </form>
            <pre id="output" class="mt-4 p-4 bg-gray-100 border rounded"></pre>

            {/* SSE streaming updates */}
            <pre
                hx-ext="sse"
                sse-connect="/status"
                sse-swap="message"
                sse-close="done"
                hx-swap="innerHTML transition:true"
            ></pre>

            <ts-editor
                value=""
                component={"codemirror"}
                url={Deno.env.get("YJS_URL") || ""}
                room={agent}
            >
            </ts-editor>

            <script src="https://esm.sh/@cxai/ide" type="module"></script>
        </div>,
    ), { title: "live coding" });

// ─── API ENDPOINTS ─────────────────────────────────────────────────────────

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
                await stream.writeSSE({ data: newValue && newValue.status });
            }
        }
        // Signal end of stream.
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
        // Signal end of stream.
        await stream.writeSSE({ event: `done`, data: `done` });
    }));

app.get("/inspect", (c) =>
    c.json({
        doc: ydoc.toJSON(),
    }));

// ─── CODE MIRROR / Y.TEXT UPDATE LOGIC ──────────────────────────────────────

// Create separate nested Y.Text nodes for each code section.
const yImports = ydoc.getText("@code.imports");
const yDeclarations = ydoc.getText("@code.declarations");
const yExports = ydoc.getText("@code.exports");

// Initialize yText with each section marked by an attribute.
yText.insert(0, yImports.toString(), { section: "imports" });
yText.insert(yText.length, yDeclarations.toString(), { section: "declarations" });
yText.insert(yText.length, yExports.toString(), { section: "exports" });

// Helper: update only the section that changed.
function updateSection(section, newContent) {
    let index = 0;
    let start = null,
        end = null;
    // Search through yText delta for the section marker.
    for (const op of yText.toDelta()) {
        const opLen = typeof op.insert === "string" ? op.insert.length : 1;
        if (op.attributes && op.attributes.section === section) {
            if (start === null) start = index;
            end = index + opLen;
        }
        index += opLen;
    }
    if (start !== null && end !== null) {
        const current = yText.toString().slice(start, end);
        if (current !== newContent) {
            yText.delete(start, end - start);
            yText.insert(start, newContent, { section });
        }
    } else {
        yText.insert(yText.length, newContent, { section });
    }
}

// Observe changes in nested texts.
yImports.observe(() => updateSection("imports", yImports.toString()));
yDeclarations.observe(() => updateSection("declarations", yDeclarations.toString()));
yExports.observe(() => updateSection("exports", yExports.toString()));

// ─── Y.ARRAY OBSERVERS FOR AI ITEMS ──────────────────────────────────────────

// For imports.
const importsArray = ydoc.getArray<z.infer<typeof ImportItemSchema>>("import");
importsArray.observe((event) => {
    ydoc.transact(() => {
        event.delta
            .flatMap((delta) => delta.insert || [])
            .filter(Boolean)
            .map((item: z.infer<typeof ImportItemSchema>) => `import {${item.names.join(",")}} from '${item.module}' \n\n`)
            .reduce(
                (acc: { content: string; start: number; end: number }[], item: string) => {
                    const last = acc[acc.length - 1] || { start: 0, end: 0 };
                    return acc.concat({ content: item, start: last.end, end: last.end + item.length });
                },
                [],
            )
            .forEach(({ start, content }: { content: string; start: number }) => {
                yImports.insert(start, content);
            });
    });
});

// For declarations.
const declarationsArray = ydoc.getArray<z.infer<typeof DeclarationItemSchema>>("declaration");
declarationsArray.observe((event) => {
    ydoc.transact(() => {
        event.delta
            .flatMap((delta) => delta.insert || [])
            .filter(Boolean)
            .reduce(
                (
                    acc: { content: string; start: number; end: number; name: string; index: number }[],
                    { content, name }: z.infer<typeof DeclarationItemSchema>,
                    index: number,
                ) => {
                    const item = content + "\n\n";
                    const last = acc[acc.length - 1] || { start: 0, end: 0 };
                    return [...acc, { content: item, start: last.end, end: last.end + item.length, name, index }];
                },
                [],
            )
            .forEach(({ start, content }: { content: string; start: number }) => {
                yDeclarations.insert(start, content);
            });
    });
});

// For exports.
const exportsArray = ydoc.getArray<z.infer<typeof ExportItemSchema>>("export");
exportsArray.observe((event) => {
    event.delta
        .flatMap((delta) => delta.insert || [])
        .filter(Boolean)
        .map((item: z.infer<typeof ExportItemSchema>) => ({
            content: `export default {\n  ${item.handler.name}(${
                item.handler.params.join(
                    ", ",
                )
            }) {\n    ${item.handler.body}\n  }\n};\n`,
            name: item.handler.name,
        }))
        .reduce((acc, { content, name }, index) => {
            const item = content + "\n\n";
            const last = acc[acc.length - 1] || { start: 0, end: 0 };
            return [...acc, { content: item, start: last.end, end: last.end + item.length, name, index }];
        }, [])
        .forEach(({ start, content }: { content: string; start: number }) => {
            yExports.insert(start, content);
        });
});

// ─── MOCK GENERATION ENDPOINT ─────────────────────────────────────────────

app.post("/generate-mock", async (c) => {
    const { request } = await c.req.formData();
    const id = ulid();
    console.log("send request", id, request);
    ydoc.transact(() => {
        // Clear existing imports.
        importsArray.delete(0, importsArray.length);
        // Simulate streaming AI items for imports.
        importsArray.insert(0, [
            {
                type: "imports",
                module: "npm:zod",
                names: ["z"],
            },
            {
                type: "imports",
                module: "https://deno.land/x/xstate",
                names: ["createMachine"],
            },
        ]);
    });
    // Insert a declaration.
    declarationsArray.insert(0, [
        {
            type: "declarations",
            name: "machine",
            content: `const machine= createMachine({
      id:"mymy",
      initial: "idle", 
      states: {
        idle: { on: { START: "running" } },
        running: { on: { STOP: "idle" } }
      }
  }`,
        },
    ]);
    // Insert an export.
    exportsArray.insert(0, [
        {
            type: "exports",
            handler: {
                name: "fetch",
                params: ["request"],
                body: "return new Response('Hello world')",
            },
        },
    ]);
    return c.text("ok");
});

// ─── EXPORT THE APP ─────────────────────────────────────────────────────────

export default app.fetch;