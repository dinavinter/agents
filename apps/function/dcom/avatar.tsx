/** @jsxImportSource npm:hono/jsx */

//env: YJS_URL=wss://yjs.cfapps.us10-001.hana.ondemand.com 
import { yArrayIterator } from "https://esm.sh/@cxai/stream";
import {filterAction} from "https://esm.town/v/dinavinter/dcom/async/user"
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


const doc = new Y.Doc({ guid: "avatars" });
connectYjs(doc);

const { queue, doc:accountsDoc } = asyncHandler("lake", "account");

const avatars = doc.getMap("@avatar.map.lushi");
const handler = accountsDoc.getMap("@avatar.handler.lushi");
const results = accountsDoc.getMap("@avatar.results.lushi");

const { listen } = asyncUserHandler(accountsDoc.getMap("account"), handler);
connectYjs(accountsDoc);


//once on each account
listen(async function(account: Account) {
    console.log("gen for ", account.uid)
    const { object: { outerHTML } } = await generateObject<{ outerHTML: string }>({
        model: azure("gpt-4o"),
        system: `You are an expert in fun avatars generation. , response with valid html as svg , keep it fun and simple.`,
        schema: z.object({
            outerHTML: z.string(),
        }),
        prompt: `generate a fun avatars for  the user, consider its attributes """${JSON.stringify(account)}."""`,
        temperature: 0.9,
    });
    results.set(account.uid, (results.get(account.uid) || 0) +1)
    avatars.set(account.uid,outerHTML)

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


app.get("/avatars", c =>
    streamSSE(c, async (stream) => {
        const filter = ([_, { newValue }]) => !!newValue;
        for await (const [key, { action, newValue:avatar, oldValue }] of filterAsync(yMapIterate(avatars), filter)) {
            await stream.writeSSE({
                event: "avatar",
                data: `<div class="h-6 w-6 p-6 m-2 object-fit">${avatar}</div>`,
                id: key
            });

            await new Promise((r) => setTimeout(r, 100));
        }
    })
);



app.get("/inspect", c => {
    return c.json({
        handled: handler.toJSON(),
        avataru:avatars.toJSON(),
        registered:accountsDoc.getArray("registered").toJSON(),
        results:results.toJSON(),
        accounts: doc.getMap("account").toJSON(),

    });
});



app.get("/:uid", async (c) => {
    const {uid} = c.req.param();
    const avatar = avatars.get(uid);
    return c.html(avatars.get(uid) || "")
});

Deno.serve(app.fetch)


/*
create an application to collabrate building a code editor with ai agent, user can ask requests and ai visalize the resulsts , communication over yjs document, the ai part do as mock
the idea is , chat user say "create me an html code editor" agent push new editor elements to yjs fragment, ui editor created from the yjs fragment, user say "change theme"  agent change them in the fragment and ui respond, user say connect to collebritive agent add extension to yjs
 */