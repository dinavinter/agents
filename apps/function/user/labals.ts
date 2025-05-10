/** @jsxImportSource npm:hono/jsx */

import { filterAsync, yMapIterate } from "https://esm.sh/@cxai/stream";
import { keys } from "https://esm.sh/lib0@0.2.99/esnext/object.mjs";
import * as Y from "https://esm.sh/yjs";
import asyncHandler from "https://esm.town/v/dinavinter/dcom/async/event";
import userActor, { userDoc, type WhEvent } from "https://esm.town/v/dinavinter/dcom/user";
import { connectYjs } from "https://esm.town/v/dinavinter/doc";
import { renderer } from "https://esm.town/v/dinavinter/htmx_layout";
import withYjs from "https://esm.town/v/dinavinter/with_yjs";
import yjsActor from "https://esm.town/v/dinavinter/yjs_actor";
import { ulid } from "jsr:@std/ulid";
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { Fragment } from "npm:hono/jsx";
import { stream, streamSSE, streamText } from "npm:hono/streaming";
const { listen, queue, handled, doc } = asyncHandler("lake", "account");
connectYjs(doc);
console.log(doc.guid)



//worker  
listen(async function(event: WhEvent) {
    const { start, send } = yjsActor(withYjs(userActor, doc), userDoc(event.data.uid, connectYjs), {
        uid: event.data.uid,
        apiKey: event.apiKey,
    });
    await start();
    await send(event);
});


const app = new Hono();
app.use("/*", cors());


//whebhook handler
app.post("/", async function(c) {
    const text = await c.req.text();
    console.log("post request", text);
    try {
        const payload = JSON.parse(text) as { events: any[] };
        for (const event of payload.events.filter((event) => event.data?.uid)) {
            queue.push([event]);
        }
    }
    catch (e) {
        console.warn("error", e.message, text);
        return c.text("error", e.message);
    }

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
sse-connect="accounts"
sse-swap="account"
hx-swap="beforeend transitions:true swap:1s settle:1s"
class="h-screen"
    >
    </div>,
),
);




app.get("/accounts", c => {
    return streamSSE(c, async (stream) => {

        async function streamLabales(){
            for await (const [key, { action, newValue, oldValue }] of yMapIterate(doc.getMap("@user.status"))) {
                console.log(key,action, newValue,oldValue)
                const value=newValue || doc.getMap("@user.status").get(key);
                if(value){
                    await new Promise((r) => setTimeout(r, 150));
                    await stream.writeSSE({
                        event: `@label.${key}`,
                        data: `${newValue || doc.getMap("@user.status").get(key)}`,
                        id: `@label.${key}-${newValue}`,
                    });
                }
            }
        }
        streamLabales()
        const filter = ([_, { action }]) => action === "add";
        for await (const [key, { action, newValue, oldValue }] of filterAsync(yMapIterate(doc.getMap("account")), filter)) {
            const { profile, isRegistered } = doc.getMap("account").get(key);
            const label =`[${key}] ${  profile.firstName || ""  } ${profile.lastName || ""}`
            await stream.writeSSE({
                event: "account",
                data: `<pre class="shadow p-2 text-sm bg-slate-100 border-2 border-slate-200 transition-all">
                            ${label} <span sse-swap="@label.${key}" hx-swap="textContent transision:true"></span>
                        </pre>`,
                id: key,
            });
            await new Promise((r) => setTimeout(r, 100));
        }
    });
});

app.get("/:uid/status", async (c) => {
    return c.html(<)
})

app.get("/inspect", c => {
    return c.json({
        guid: doc.guid,
        accounts: doc.getMap("account").toJSON(),
        queue: queue.toJSON(),
    });
});


app.get("/inspect/:uid", async (c) => {
    const { uid } = c.req.param();
    const user = userDoc(uid, connectYjs);
    return c.json({
        uid: uid,
        apiKey: user.get("apiKey").toJSON(),
        ...user.getMap("@store").toJSON(),
        snapshot: user.getMap("@snapshot").toJSON(),
        events: user.getArray("@events").toJSON(),
    });
});

Deno.serve( app.fetch)
