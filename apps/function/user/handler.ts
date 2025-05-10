import * as Y from "https://esm.sh/yjs";
import asyncHandler from "https://esm.town/v/dinavinter/async_handler";
import userActor, { userDoc, type WhEvent } from "https://esm.town/v/dinavinter/dcom/user";
import { connectYjs } from "https://esm.town/v/dinavinter/doc";
import withYjs from "https://esm.town/v/dinavinter/with_yjs";
import yjsActor from "https://esm.town/v/dinavinter/yjs_actor";
import { ulid } from "jsr:@std/ulid";
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";

const { listen, queue, handled, doc } = asyncHandler("async:dcom:events", "account");
connectYjs(doc);

//handle events
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
app.get("/", c => {
    return c.json({
        accounts: doc.getMap("account").toJSON(),

        queue: queue.toJSON(),
    });
});

app.post("/", async function(c) {
    const payload = await c.req.json() as { events: any[] };
    for (const event of payload.events.filter((event) => event.data?.uid)) {
        //push event to queue
        queue.push([event]);
    }
    return c.text("ok");
});

app.get("/:uid", async (c) => {
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

export default app.fetch;