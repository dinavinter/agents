/** @jsxImportSource npm:hono/jsx */

import {filterAsync, yMapIterate} from "https://esm.sh/@cxai/stream";
import {generateObject} from "https://esm.sh/ai";
import * as Y from "npm:yjs";
import {connectYjs} from "https://esm.town/v/dinavinter/connect";
import onlyOnce from "https://esm.town/v/dinavinter/dcom/async/o";
import type {Account} from "https://esm.town/v/dinavinter/dcom/user";
import {azure} from "npm:@ai-sdk/azure";
import {Hono} from "npm:hono";
import {cors} from "npm:hono/cors";
import {z} from "npm:zod";
import {renderer} from "https://esm.town/v/dinavinter/htmx_layout";
import {streamSSE} from "npm:hono/streaming";

/*
env: 
YJS_URL=wss://yjs.cfapps.us10-001.hana.ondemand.com 
...azure 

 */


const doc = new Y.Doc({guid: "avatars"});
connectYjs(doc);

const accountsDoc = new Y.Doc({guid: "@async.lake"})
connectYjs(accountsDoc);


//once on each account
const {listen, state: handler} = onlyOnce(async function* () {
    for await (const [key,] of yMapIterate(accountsDoc.getMap("account"))) {
        yield [key, accountsDoc.getMap("account").get(key)];
    }
}, {state: doc.getMap("@avatar.handler")});

const avatars = doc.getMap("avatars");

listen(async function (account: Account) {
    console.log("gen for ", account.uid)
    const {object: {outerHTML}} = await generateObject<{ outerHTML: string }>({
        model: azure("gpt-4o"),
        system: `You are an expert in fun avatars generation. , response with valid html as svg , keep it fun and simple.`,
        schema: z.object({
            outerHTML: z.string(),
        }),
        prompt: `generate a fun avatars for  the user, consider its attributes """${JSON.stringify(account)}."""`,
        temperature: 0.9,
    });
    avatars.set(account.uid, outerHTML)

});


const app = new Hono();
app.use("/*", cors());

//webhook handler 
app.post("/", async function (c) {
    // const payload = await c.req.json() as { events: any[] };
    return c.text("ok");
});


//view  
app.get("*", renderer());
app.get(
    "/",
    (c) =>
        c.render(
            <div hx-ext="morph">
                <div
                    hx-ext="sse"
                    sse-connect="avatars"
                    sse-swap="avatar"
                    hx-swap="morph"
                    hx-swap="afterbegin transitions:true swap:1s settle:1s"
                    class="h-screen w-screen flex flex-wrap bg-slate-50 grid-flow-dense"
                >

                </div>
            </div>,
        ),
);


app.get("/avatars", c =>
    streamSSE(c, async (stream) => {
        const filter = ([_, {newValue}]) => !!newValue;
        for await (const [key, {action, newValue: avatar, oldValue}] of filterAsync(yMapIterate(avatars), filter)) {
            await stream.writeSSE({
                event: "avatar",
                data: `<div  class="h-6 w-6 p-6 m-2 object-fit">${avatar}</div>`,
                id: key
            });

            await new Promise((r) => setTimeout(r, 100));
        }
    })
);


app.get("/inspect", c => {
    return c.json({
        handled: handler.toJSON(),
        avatars: avatars.toJSON(),
        accounts: doc.getMap("account").toJSON(),

    });
});


app.get("/:uid", async (c) => {
    const {uid} = c.req.param();
    const avatar = avatars.get(uid);
    return c.html(avatars.get(uid) || "")
});

Deno.serve(app.fetch)
