/** @jsxImportSource https://esm.sh/hono@latest/jsx **/

import { Application, Router } from "https://deno.land/x/oak/mod.ts";
import {
    EventMessage,
    serializeSSEEvent,
    sseReadableStream,
    yArrayIterator,
    yMapIterate,
} from "https://esm.sh/@cxai/stream?yjs=13.6.20&target=esnext";
import { createMachineDoc, getOrCreateDoc } from "https://esm.town/v/dinavinter/doc";
import { ulid } from "jsr:@std/ulid";
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";

const users = getOrCreateDoc("dcom:users").getMap("lookup");

const app = new Hono();
app.use("/*", cors());
app.get("/", c => {
    return c.json(users.toJSON());
});


app.post("/", async function(c) {
    const payload = await c.req.json() as { events: any[] };
    for (const event of payload.events.filter((event) => event.data?.uid)) {
        //push user to yjs map 
        const { id, type, endpoint, apiKey, callId, timestamp, data: { uid, params, accountType } } = event;
        users.get(uid) || users.set(uid, { timestamp, event: id, ulid: ulid() });
        const user = getOrCreateDoc(`dcom:${uid}`);
        
        //push event to user events
        user.getArray("events").push([{
            id,
            ulid: ulid(),
            type,
            apiKey,
            callId,
            timestamp,
            accountType,
            ...params || {},
        }]);
    }
    return c.text("ok");
});

app.get("/:uid", async (c) => {
    const { uid } = c.req.param();
    const user = getOrCreateDoc(`dcom:${uid}`);
    return c.json(user.getArray("events").toJSON());
});

export default app.fetch;