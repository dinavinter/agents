/** @jsxImportSource npm:hono/jsx */

// ─── IMPORTS ──────────────────────────────────────────────────────────────

import { filterAsync, yArrayIterator, yMapIterate } from "https://esm.sh/@cxai/stream";
import * as Y from "https://esm.sh/yjs@13.6.23";
import { connectYjs } from "https://esm.town/v/dinavinter/connect";
import { DenoHandlerFileItemSchema } from "https://esm.town/v/dinavinter/cxai/schema";
import type { DeclarationItem, ExportItem, ImportItem } from "https://esm.town/v/dinavinter/cxai/schema";
import onlyOnce from "https://esm.town/v/dinavinter/dcom/async/o";
import { renderer } from "https://esm.town/v/dinavinter/htmx_layout";
import { ulid } from "jsr:@std/ulid@1";
import { azure } from "npm:@ai-sdk/azure";
import { smoothStream, streamObject, streamText } from "npm:ai";
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { streamSSE } from "npm:hono/streaming";
import UrlPattern from "npm:url-pattern";

const app = new Hono();
const agent = "editor-71";

const ydoc = new Y.Doc({ guid: agent });
connectYjs(ydoc);

// Main text for CodeMirror.
const yText = ydoc.getText("codemirror");

// Use maps (instead of arrays) for each section.
const importsMap = ydoc.getMap<ImportItem>("import");
const declarationsMap = ydoc.getMap<DeclarationItem>("declaration");
const exportsMap = ydoc.getMap<ExportItem>("export");
type Statment = {
    body: string;
    after?: string;
    section: string;
    tags: string;
};
const statments = ydoc.getMap<Statment>("statments");

// Maps for handling requests and AI responses.
const requests = ydoc.getMap("requests");

// ─── HELPER FUNCTION: UPDATE USING "AFTER" STRATEGY ─────────────────────────

function opsWithPositions(yText: Y.Text) {
    return yText.toDelta().reduce((acc: [], op) => {
        const last = acc[acc.length - 1] || { start: 0, end: 0 };
        const opLen = typeof op.insert === "string" ? op.insert.length : op.retain || 1;
        return [...acc, {
            len: opLen,
            content: op.insert,
            start: last.end,
            end: last.end + opLen,
            after: op.attributes?.after,
            section: op.attributes?.section,
            identifier: op.attributes?.identifier,
            tags: op.attributes?.tags?.split(" ") || [],
            attributes: op.attributes || {},
        }];
    }, [] as { len: number; content: string; start: number; end: number; section: string; after: string[] }[]);
}

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
1. Import item: { type: "import", identifier: "<meaningful-name>", module: "…", names: ["…"] }
2. Declaration item: { type: "declaration", identifier: "<meaningful-name>", content: "…" }
3. Export item: { type: "export", identifier: "<meaningful-name>", exportType: "default", handler: { name: "fetch", params: ["request"], body: "…" } }
Follow the schema exactly and output only valid JSON. You must output at least one export default fetch.`,
    });
    for await (const element of elementStream) {
        const item = DenoHandlerFileItemSchema.parse(element);
        ydoc.transact(() => {
            if (item.type === "import") {
                importsMap.set(item.identifier, item);
            } else if (item.type === "declaration") {
                declarationsMap.set(item.identifier, item);
            } else if (item.type === "export") {
                exportsMap.set(item.identifier, item);
            }
        });
    }
    console.log("done", await object);
    return await object;
});

/* Sync Changes to Codemirror */
const { listen: listenToNewStatments, state: newStatmentsState, output: newStatmentsOutput } = onlyOnce(
    async function*() {
        for await (const [key] of yMapIterate(statments)) {
            yield [key, {
                ...statments.get(key),
                identifier: key,
            }];
        }
    },
    {
        state: ydoc.getMap("@handler.changes"),
        output: ydoc.getArray("@handler.statement.pos"),
    },
);
// const { listen: listenToUpdatedStatments, state: updateStatmentsState, output: updateStatmentsOutput } = onlyOnce(
//   async function*() {
//     for await (const [key, { action }] of yMapIterate(statments)) {
//       if (statments.get(key)?.anchor) {
//         const anchor = Y.createAbsolutePositionFromRelativePosition(statments.get(key).anchor, ydoc);
//         const pos = {
//           start: anchor?.index,
//           assoc: anchor?.assoc,
//           statment: statments.get(key),
//           extract: yText?.toJSON()?.slice(anchor?.index || 0, anchor?.assoc)?.replace(/(?:\r\n|\r|\n)/g, ""),
//         };

//         log.set(key, pos);
//       }
//       if (action === "update" && statments.get(key)?.anchor) {
//         yield [key, {
//           ...statments.get(key),
//           identifier: key,
//         }];
//       }
//     }
//   },
//   {
//     state: ydoc.getMap("@handler.changes"),
//     output: ydoc.getArray("@handler.statement.pos"),
//   },
// );

const anchors = ydoc.getMap<string>("anchors");
listenToNewStatments(function({ tags, body, after, section, identifier }) {
    const delta = opsWithPositions(yText);
    const afterIndex = delta.findLastIndex(op => op.tags.includes(after) || op.tags.includes(section));
    const beforeIndex = delta.findIndex(op => tags?.split(" ").includes(op.after));
    const statmentIndex = Math.max(
        afterIndex > 0 ? afterIndex : (delta.length - 1),
        beforeIndex > 0 ? beforeIndex : (delta.length - 1),
    );
    const afterOp = delta[statmentIndex];

    const retain = afterOp
        ? [
            { retain: afterOp.end },
            {
                insert: `\n`,
            },
        ]
        : [];
    const attributes = {
        identifier: identifier || "",
        section: section || "",
        after: after || "",
        tags: tags || "",
        edited: Date.now(),
    };
    const content = body || `//Adding ${identifier}...`;
    const applyDelta = [
        // { retain: afterOp?.end },
        ...retain,
        {
            insert: content,
            attributes: attributes,
        },
        {
            insert: "\n",
            attributes: { tags },
        },
    ];
    console.log("appling delta", applyDelta);
    const start = afterOp?.start || 0;
    const len = (afterOp?.len || 0) + content.length;
    const anchor = Y.createRelativePositionFromTypeIndex(yText, start);

    ydoc.transact(() => {
        yText.applyDelta(applyDelta);
        anchors.set(identifier, JSON.stringify(anchor));
    });
    return { identifier, statmentIndex, beforeIndex, afterIndex, after, afterOp };
});

async function syncYTextPos(){


}
yText.observe((e) => {
    console.log(e.changes, e.keys, Array.from(e.changes.delta));
    const { changes: { delta } } = e;
    for (const d of delta){


    }
    log.set("delta", [...log.get("delta") || [], delta]);
});

const log = ydoc.getMap("log");

async function logAnchors() {
    for await (const [key] of yMapIterate(anchors)) {
        const newValue = anchors.get(key);
        if (newValue) {
            try {
                const anchor = Y.createAbsolutePositionFromRelativePosition(JSON.parse(newValue), ydoc);
                const pos = {
                    newValue,
                    start: anchor?.index,
                    assoc: anchor?.assoc,
                    len: statments.get(key).body.length,
                    extract: anchor?.type?.toJSON()?.slice(anchor?.index || 0, statments.get(key).body.length)?.replace(
                        /(?:\r\n|\r|\n)/g,
                        "a",
                    ),
                    tags: statments.get(key)?.tags,
                    after: statments.get(key)?.after,
                    section: statments.get(key)?.section,
                };

                log.set(key, pos);
            } catch (e) {
                console.error(e);
                log.set(key, { error: e });
            }
        }
    }
}
logAnchors();
// listenToUpdatedStatments(async (args) => {
//   // console.log("updated",args)
// });

// ─── VIEW / RENDERING ENDPOINTS ─────────────────────────────────────────────

app.use("/*", cors());

app.get("*", renderer());

app.get("/", (c) =>
    c.render(
        <div hx-ext="morph" class="h-screen w-screen container">
            {/* Request forms */}
            <form hx-target="#output" class="space-y-4">
                <button
                    type="submit"
                    hx-post="add-imports"
                    hx-include="#request"
                    class="p-2 border-2 border-slate-900 rounded bg-blue-500 text-white hover:bg-blue-600"
                >
                    Add import
                </button>
                <button
                    type="submit"
                    hx-post="add-declaration"
                    hx-include="#request"
                    class="p-2 border-2 border-slate-900 rounded bg-blue-500 text-white hover:bg-blue-600"
                >
                    Add declaration
                </button>
                <button
                    type="submit"
                    hx-post="update-imports"
                    hx-include="#request"
                    class="p-2 border-2 border-slate-900 rounded bg-blue-500 text-white hover:bg-blue-600"
                >
                    Update import
                </button>
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

// ─── CODE MIRROR / Y.TEXT UPDATE LOGIC ──────────────────────────────────────

// Create nested Y.Text nodes for each section.
const yImports = ydoc.getText("@code.imports");
const yDeclarations = ydoc.getText("@code.declarations");
const yExports = ydoc.getText("@code.exports");

// // Initialize yText with each section marked by an attribute.
// yText.insert(0, "\n\n\n", { section: "imports" });
// yText.insert(yText.length, "\n\n\n", { section: "declarations" });
// yText.insert(yText.length, "\n\n\n", { section: "exports" });

// pattern.stringify({id: 20}) // '/api/users/20'
// pattern.match('/api/users/10'); // {id: '10'}
// var pattern = new UrlPattern('/api/users(/:id)');

const pattern = new UrlPattern("(/:section)(/:identifier)");
async function syncChangesToCode() {
    // ─── MAP OBSERVERS: USING "AFTER" STRATEGY ────────────────────────────────
    for await (const [key, { action }] of yMapIterate(statments)) {
        const newValue = statments.get(key);
        if (newValue) {
            const { tags, body, after, section } = newValue;
            console.log("apppling change", {
                identifier: key,
                tags,
                body,
                after,
                section,
            });
            ydoc.transact(() => {
                upsertIdentifier({
                    identifier: key,
                    tags,
                    body: body + `\n`,
                    after,
                    section,
                });
            });
        }
    }
}
// syncChangesToCode();

// For imports.
importsMap.observe((e) => {
    ydoc.transact(() => {
        e.keysChanged.forEach((key) => {
            const item = importsMap.get(key);
            item && statments.set(key, {
                tags: "imports",
                body: `import {${item.names.join(",")}} from '${item.module}';`,
                section: "imports",
            });
        });
    });
});
// For declarations.
declarationsMap.observe((e) => {
    ydoc.transact(() => {
        e.keysChanged.forEach((key) => {
            const item = declarationsMap.get(key);
            item && statments.set(key, {
                tags: "declarations",
                body: item.content,
                section: "declarations",
                after: "imports",
            });
        });
    });
});

function upsertIdentifier({ identifier, section, after, tags, body: text }: Statment & { identifier: string }) {
    const delta = opsWithPositions(yText);
    // const sectionIdentifiers = opsWithPositions.filter(op => op.section === section  );
    // const lastPosition = Math.max(sectionIdentifiers.map(a => a.content));
    console.log("ops", delta);
    const op = delta.find(op => op.section === section && op.identifier === identifier);
    if (op) {
        const { start, len, attributes: opAttributes } = op;
        yText.applyDelta([
            { retain: start },
            { delete: len },
            {
                insert: text,
                attributes: {
                    ...opAttributes,
                    identifier: identifier || "",
                    section: section || "",
                    after: after || "",
                    tags: tags || "",
                    edited: Date.now(),
                },
            },
        ]);
    }
    else {
        function lastBeforeMe() {
            const before = delta.findIndex(op => tags.split(" ").includes(op.after));
            return before ? delta[before - 1] : delta[-1];
        }
        const afterOp = delta.findLast(op => op.tags.includes(after))
            || lastBeforeMe();

        const retain = afterOp
            ? [
                { retain: afterOp.end },
                {
                    insert: `\n`,
                },
            ]
            : [];
        const applyDelta = [
            // { retain: afterOp?.end },
            ...retain,
            {
                insert: text || `/n\n//Adding ${identifier}...`,
                attributes: {
                    identifier: identifier || "",
                    section: section || "",
                    after: after || "",
                    tags: tags || "",
                    edited: Date.now(),
                },
            },
        ];
        console.log("appling delta", applyDelta);

        yText.applyDelta(applyDelta);
    }
}

app.post("/update-imports", async (c) => {
    importsMap.set("zod", {
        type: "import",
        module: "jsr:zod",
        names: ["z"],
    });
    importsMap.set("ai", {
        type: "import",
        module: "npm:ai",
        names: ["ai"],
    });
    return c.text(yText.toJSON());
});
app.post("/add-declaration", async (c) => {
    declarationsMap.set("x", {
        content: "const x= 34345353\n",
    });
    declarationsMap.set("machine", {
        content: `const machine = createMachine({
  id: "mymy",
  initial: "idle", 
  states: {
    idle: { on: { START: "running" } },
    running: { on: { STOP: "idle" } }
  }
});`,
    });

    return c.text(yText.toJSON());
});
app.post("/add-imports", async (c) => {
    importsMap.set("zod", {
        type: "import",
        module: "npm:zod",
        names: ["z"],
    });

    return c.text(yText.toJSON());
});
// ─── MOCK GENERATION ENDPOINT ─────────────────────────────────────────────

app.post("/generate-mock", async (c) => {
    const { request } = await c.req.formData();
    console.log("send request", request);
    // ydoc.transact(() => {
    // Clear and add mock items using meaningful identifiers.
    importsMap.set("zod", {
        type: "import",
        module: "npm:zod",
        names: ["z"],
    });
    await new Promise(resolve => setInterval(resolve, 100));
    importsMap.set("xstate", {
        type: "import",
        module: "https://deno.land/x/xstate",
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

export default app.fetch;