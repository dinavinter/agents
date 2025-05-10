import { yArrayIterator } from "https://esm.sh/@cxai/stream";
import * as Y from "https://esm.sh/yjs";
import { connectYjs } from "https://esm.town/v/dinavinter/connect";
import asyncHandler from "https://esm.town/v/dinavinter/dcom/asyncUserHandler";
import type { WhEvent } from "https://esm.town/v/dinavinter/dcom/user";
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";

//consume events (produce by sync handler) and generate token
const { listen, queue, handled, doc: eventsDoc } = asyncHandler("async:dcom:events", "token");
connectYjs(eventsDoc);

listen(async function(event: WhEvent) {
    const response = await fetch(`https://accounts.eu1.gigya.com/socialize.getToken?httpStatusCodes=true`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: new URLSearchParams({
            "apiKey": event.apiKey,
            "grant_type": "none",
            "siteUID": event.data.uid,
            "userKey": Deno.env.get("GIGYA_CLIENT_ID")!,
            "secret": Deno.env.get("GIGYA_CLIENT_SECRET")!,
        }),
    });
    if (!response.ok) throw new Error(JSON.stringify(await response.json()));
    const { access_token } = await response.json();
    console.log("return access to ", event.data.uid, access_token);
    return access_token;
});

const usersDoc = connectYjs(new Y.Doc({ guid: `dcom:users`, meta: { collection: "async-handler" } }));

const app = new Hono();
app.use("/*", cors());
app.get("/", c => {
    const users = usersDoc.getMap("lookup").toJSON();
    return c.json({
        token: Object.keys(users).map(x => eventsDoc.getMap(`@actor.token.${x}`).toJSON()).filter(x => x?.state), // eventsDoc.share
        queue: queue.toJSON(),
    });
});

app.post("/", async function(c) {
    const payload = await c.req.json() as { events: any[] };
    for (const event of payload.events.filter((event) => event.data?.uid)) {
        queue.push([event]);
    }
    return c.text("ok");
});

app.get("/:uid", async (c) => {
    const { uid } = c.req.param();
    return c.json({
        uid: uid,
        ...eventsDoc.getMap(`@actor.token.${uid}`),
    });
});

export default app.fetch;