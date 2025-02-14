
/** @jsxImportSource npm:hono/jsx */

import { filterAsync, yMapIterate } from "https://esm.sh/@cxai/stream";
import { keys } from "https://esm.sh/lib0@0.2.99/esnext/object.mjs";
import * as Y from "https://esm.sh/yjs";
import onlyOnce from "https://esm.town/v/dinavinter/dcom/async/once"
import userActor, { userDoc, type WhEvent } from "https://esm.town/v/dinavinter/dcom/user";
import { connectYjs } from "https://esm.town/v/dinavinter/doc";
import { renderer } from "https://esm.town/v/dinavinter/htmx_layout";
import withYjs from "https://esm.town/v/dinavinter/with_yjs";
import yjsActor from "https://esm.town/v/dinavinter/yjs_actor";
import { ulid } from "jsr:@std/ulid";
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { stream, streamSSE, streamText } from "npm:hono/streaming";


const doc = new Y.Doc({guid: "@async.lake"});
connectYjs(doc)

const users = doc.getMap("@users.array.lushi");
const handled = doc.getMap("@users.handler.lushic");
const queue = doc.getArray("@queue");

//debug handler times
const results = doc.getMap("@users.results.lushi");


const { listen } = onlyOnce(queue,{
    status:handled
});

//worker  
listen(async function(event: WhEvent) {

    const { start, send } = yjsActor(withYjs(userActor, doc), userDoc(event.data.uid, connectYjs), {
        uid: event.data.uid,
        apiKey: event.apiKey,
    });

    await send(event);

    results.set(event.id, (results.get(event.id) || 0) +1)
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
class="h-screen overflow-y-scroll scroll-smooth  "
    >
    </div>,
),
);



app.get("/accounts", c => {
    return streamSSE(c, async (stream) => {
        const filter = ([_, { action }]) => action === "add";
        for await (const [key, { action, newValue, oldValue }] of filterAsync(yMapIterate(doc.getMap("account")), filter)) {
            const { profile, isRegistered } = doc.getMap("account").get(key);
            const label =`[${key}] ${  profile.firstName || ""} ${  profile.lastName || ""}`
            await stream.writeSSE({
                event: "account",
                data: `<pre class="shadow p-2 text-sm bg-slate-100 border-2 border-slate-200 transition-all">
                            ${label} <span sse-swap="@label.${key}"  hx-swap="textContent transision:true"></span>
                        </pre>  `,
                id: key,
            });
            await new Promise((r) => setTimeout(r, 100));
        }
    });
});

app.get("/:uid/status", async (c) => {
    const { uid } = c.req.param();
    const status = doc.getMap("@user.status").get(uid)
    const trigger = !status?  "intersect once dealy:1s":  status === "registered"? "intersect once dealy:2s" : "intersect once dealy:60s";
    return c.html(<span class="text-slate-900" hx-get={c.req.url} hx-trigger={trigger}  hx-swap="outerHTML transition:true swap:1s settle:1s">{status}</span>) 
})

app.get("/inspect", c => {
    return c.json({
        guid: doc.guid,
        handlers:handled.toJSON(),
        results:results.toJSON(),
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
