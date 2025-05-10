/** @jsxImportSource npm:hono/jsx */

//env: YJS_URL=wss://yjs.cfapps.us10-001.hana.ondemand.com 
import { yArrayIterator } from "https://esm.sh/@cxai/stream";
import { filterAsync, yMapIterate } from "https://esm.sh/@cxai/stream";
import { generateObject } from "https://esm.sh/ai";
import * as Y from "https://esm.sh/yjs";
import { connectYjs } from "https://esm.town/v/dinavinter/connect";
import asyncHandler from "https://esm.town/v/dinavinter/dcom/async/event";
import { asyncUserHandler } from "https://esm.town/v/dinavinter/dcom/async/user";
import type { Account, WhEvent } from "https://esm.town/v/dinavinter/dcom/user";
import { azure } from "npm:@ai-sdk/azure";
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { z } from "npm:zod";
import { Fragment } from "npm:hono/jsx";
import { renderer } from "https://esm.town/v/dinavinter/htmx_layout";
import { stream, streamSSE, streamText } from "npm:hono/streaming";


const { queue, doc } = asyncHandler("events", "account");

const { listen } = asyncUserHandler(doc.getMap("account"), doc.getMap("@ai.avatar"), ()=> true);
connectYjs(doc);
// type VNode ={
//     props: Record<string, string>,
//     type: string,
//     children: VNodeAny[]
// }

//work

listen(async function(account: Account) {
    const { object: { outerHTML } } = await generateObject<{ outerHTML: string }>({
        model: azure("gpt-4o"),
        system: `You are an expert in fun avatars generation. , response with valid html as svg , keep it fun and simple.`,
        schema: z.object({
            outerHTML: z.string(),
        }),
        prompt: `generate a fun avatars for  the user, consider its attributes """${JSON.stringify(account)}."""`,
        temperature: 0.9,
    });

    doc.getArray("emitted").push([{
        data: outerHTML,
        event: "avatar",
        id:account.uid
    }]);
    return outerHTML;
});


const app = new Hono();
app.use("/*", cors());

//webhook handler 
app.post("/", async function(c) {
    // const payload = await c.req.json() as { events: any[] };
    return c.text("ok");
});


//view  
app.get("*", renderer());
app.get(
    "/",
    (c) =>
        c.render(
            <div
                hx-ext="sse"
sse-connect="avatars"
sse-swap="avatar"
hx-swap="afterbegin transitions:true swap:1s settle:1s"
class="h-screen w-screen flex flex-wrap bg-slate-50 grid-flow-dense"
    >
    </div>,
),
);
app.get("/accounts", c => {
    return streamSSE(c, async (stream) => {
        const filter = ([_, { action }]) => true;
        for await (const [key, { action, newValue, oldValue }] of filterAsync(yMapIterate(doc.getMap("account")), filter)) {
            const { profile, isRegistered } = doc.getMap("account").get(key);
            await stream.writeSSE({
                event: "account",
                data: `<pre class="shadow p-2 text-sm bg-slate-100 border-2 border-slate-200 transition-all">[${key}] ${
                    profile.firstName || ""
                } ${profile.lastName || ""} just ${isRegistered ? "registered" : "created"} </pre>`,
                id: key,
            });
            await new Promise((r) => setTimeout(r, 100));
        }
    });
});
app.get("/avatars", c =>
    streamSSE(c, async (stream) => {
        for await (const  avatar of yArrayIterator(doc.getArray("emitted"))) {
            await stream.writeSSE({
                event: "avatar",
                data: `<div class="h-6 w-6 p-6 m-2 object-fit">${avatar.data}</div>`,
                id: avatar.id
            });

            await new Promise((r) => setTimeout(r, 100));
        }
    })
);

app.get("/inspect", c => {
    return c.json({
        emitted: doc.getArray("emitted").toJSON(),
        handled: doc.getMap("@ai.avatar").toJSON(),
        accounts: doc.getMap("account").toJSON(),
        avatars: doc.getMap("@actor.avatar").toJSON(),
    });
});



app.get("/:uid", async (c) => {
    const { uid } = c.req.param();
    return c.json({
        uid: uid,
        ...doc.getMap(`@actor.token.${uid}`),
    });
});

export default app.fetch;