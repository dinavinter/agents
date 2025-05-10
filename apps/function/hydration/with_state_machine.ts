/** @jsxImportSource https://esm.sh/hono@latest/jsx **/
import {
    assign,
    createActor,
    emit,
    forwardTo,
    fromPromise,
    sendTo,
    setup,
    waitFor,
} from "https://esm.sh/xstate@^5.19.0";
import * as Y from "https://esm.sh/yjs";
import withAI, { type Actions, type Actors } from "https://esm.town/v/dinavinter/ai";
import asyncHandler from "https://esm.town/v/dinavinter/async_handler";
import userMachine, { userDoc, type WhEvent } from "https://esm.town/v/dinavinter/dcom/user";
import { connectYjs, getOrCreateDoc } from "https://esm.town/v/dinavinter/doc";
import yjsActor from "https://esm.town/v/dinavinter/yjs";
import { ulid } from "jsr:@std/ulid";
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { z } from "npm:zod@^3.24.1";

const setupMachine = setup({
    guards: {},
    delays: {},
    schemas: {
        context: { doc: Y.Doc },
    },
    actors: {} as Actors,
    actions: {} as Actions,
});

const avatarMachine = setupMachine.createMachine({
    id: "avatar",
    initial: "load",
    context: ({ input }) => input,
    states: {
        load: {
            invoke: {
                src: "loadUser",
                onDone: {
                    target: "generate",
                    actions: assign({
                        user: ({ event }) => event.output,
                    }),
                },
            },
        },
        generate: {
            invoke: {
                src: "aiElementStream",
                id: "avatar",
                input: {
                    template:
                        `generate 2 avatars for  {{#user}}{{#profile}}.{{/profile}} {{/user}} , response with svg only and return html`,
                    schema: z.object({
                        outerHtml: z.string(),
                    }),
                },
                syncSnapshot: true,
                onDone: {
                    target: "update",
                },
            },

            on: {
                "element": {
                    actions: [
                        {
                            type: "@yjs.array.push",
                            params: "avatar",
                        },
                        assign({
                            avatar: ({ event }) => event.outerHtml,
                        }),
                    ],
                },
            },
        },
        update: {
            invoke: {
                src: fromPromise(async ({ input }) => {
                    const { send } = yjsActor(userMachine, userDoc(input.uid), input);
                    await send({
                        type: "push.update",
                        ...input,
                    });
                    return userDoc(input.uid).getArray("avatar").toJSON();
                }),
                input: ({ context: { user: { uid, apiKey }, avatar } }) => ({
                    uid,
                    apiKey,
                    data: {
                        avatar: avatar,
                    },
                }),
            },
        },
        done: {
            type: "final",
        },
    },
});

const { listen, queue, handled, doc: eventsDoc } = asyncHandler("async:dcom:events", "avatar");
connectYjs(eventsDoc);

listen(async function(event: WhEvent) {
    const uid = event.data.uid;
    const apiKey = event.apiKey;
    const machine = withAI(avatarMachine).provide({
        actors: {
            loadUser: fromPromise(async () => {
                const userActor = yjsActor(userMachine, userDoc(uid), {
                    uid,
                    apiKey,
                });
                await userActor.start();
                const userState = await waitFor(userActor, state => !state.hasTag("loading"), {
                    timeout: 2_000, // 10 seconds (10,000 milliseconds)
                });
                console.log("userstate", userState);
                return userState.context;
            }),
        },
    });

    const { send } = yjsActor(machine, getOrCreateDoc(`avatar:${event.data.uid}`), {
        uid: event.data.uid,
        apiKey: event.apiKey,
    });
    await send(event);
});

// inspecting worker
const app = new Hono();
app.use("/*", cors());
app.get("/", c => {
    return c.json({
        queue: queue.toJSON(),
        handled: handled.toJSON(),
    });
});

app.post("/", async function(c) {
    const payload = await c.req.json() as { events: any[] };
    // use the same queue as actors, keep whebhook just for hydardation
    // for (const event of payload.events.filter((event) => event.data?.uid)) {
    //   queue.push([event]);
    // }
    return c.text("ok");
});

app.get("/:uid", async (c) => {
    const { uid } = c.req.param();
    const doc = getOrCreateDoc(`avatar:${uid}`);

    return c.html(`<div style="max-width: 10px max-height: 10px">${
        Array.from(doc.getArray("avatar"))
            .map((x) => x.outerHtml)
            .join("</div><div style='width: 10px height: 10px'>")
    }</div>`);
});

app.get("/:uid/inspect", async (c) => {
    const { uid } = c.req.param();
    const user = getOrCreateDoc(`avatar:${uid}`);
    return c.json({
        guid: user.guid,
        uid: uid,
        apiKey: user.get("apiKey").toJSON(),
        avatar: user.getArray("avatar").toJSON(),
        ...user.getMap("@store").toJSON(),
        snapshot: user.getMap("@snapshot").toJSON(),
        events: user.getArray("@events").toJSON(),
    });
});

export default app.fetch;