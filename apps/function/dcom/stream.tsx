/** @jsxImportSource npm:hono/jsx */

import { filterAsync, yMapIterate } from "https://esm.sh/@cxai/stream";
import * as Y from "https://esm.sh/yjs";
import { connectYjs } from "https://esm.town/v/dinavinter/doc";
import { renderer } from "https://esm.town/v/dinavinter/htmx_layout";
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { Fragment } from "npm:hono/jsx";
import { stream, streamSSE, streamText } from "npm:hono/streaming";

const doc = new Y.Doc({ guid: "@async.lake" });
connectYjs(doc);

const avatarsDoc = new Y.Doc({ guid: "avatars" });
connectYjs(avatarsDoc);


const app = new Hono();
app.use("/*", cors());

// view
app.get("*", renderer());

app.get(
    "/",
    (c) =>
        c.render(
            <div
                hx-ext="sse"
                sse-connect="events"
                sse-swap="account"
                hx-swap="beforeend"
                class="h-screen relative  "
            >
                <footer
                    sse-swap="avat"
                    hx-swap="innerHTML transition:true swap:1s settle:1s"
                    class="buttom-0 sticky z-60 h-1.5 bg-slate-50 shadow m-4"
                />

                <div
                    sse-swap="account"
                    hx-swap="beforeend transition:true "
                    class="h-full w-full relative overflow-y-scroll scroll-smooth  "
                >
                </div>
            </div>,
        ),
);

app.get("/events", c =>
    streamSSE(c, async (stream) => {
        async function streamStatus() {
            for await (const [key, { action, newValue, oldValue }] of yMapIterate(doc.getMap("@user.status"))) {
                console.log(key, action, newValue, oldValue);
                const value = newValue || doc.getMap("@user.status").get(key);
                if (value) {
                    await new Promise((r) => setTimeout(r, 200));
                    await stream.writeSSE({
                        event: `@label.${key}`,
                        data: `${newValue || doc.getMap("@user.status").get(key)}`,
                        id: `@label.${key}-${newValue}`,
                    });
                }
            }
        }

        async function streamAccount() {
            const filter = ([_, { action }]) => action === "add";
            for await (
                const [key, {
                    action,
                    newValue,
                    oldValue,
                }] of filterAsync(yMapIterate(doc.getMap("account")), filter)
                ) {
                const { profile, isRegistered } = doc.getMap("account").get(key);
                const label = `[${key}] ${profile.firstName || ""} ${profile.lastName || ""}`;
                await stream.writeSSE({
                    event: "account",
                    data: `<article class="shadow p-2 text-sm bg-slate-100 border-2 border-slate-200 transition-all container ">
                            <pre class="whitespace-normal grid grid-cols-3">${label} <span sse-swap="@label.${key}"  hx-swap="textContent"></span> 
                            <pre class="inline border-slate-400 h-full mix-blend-multiply  w-4 object-fit p-4" sse-swap="@avatar.${key}"  hx-swap="innerHTML"> </pre> 
                           </pre>
                        </article> 
                         
                        `,
                    id: key,
                });
                await new Promise((r) => setTimeout(r, 100));
            }
        }

        async function streamAvatars() {
            const avatars = avatarsDoc.getMap("@avatar.map.lushi");

            for await (const [key, { action, newValue: avatar, oldValue }] of yMapIterate(avatars)) {
                console.log("avatar", key, action);
                await new Promise((r) => setTimeout(r, 200));
                await stream.writeSSE({
                    event: `@avatar.${key}`,
                    data: avatar || avatars.get(key), // `<div class="h-6 w-6 p-6 m-2 object-fit" >${avatar || avatars.get(key)}</div>`,
                    id: `@avatar.${key}`,
                });
            }
        }

        streamAccount();
        streamStatus();
        streamAvatars();
        while (true) {
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 2000);
            });
            const map = Array.from(doc.getMap("@user.status").values()).reduce((acc, e) => ({
                ...acc,
                [e]: (acc[e] || 0) + 1,
            }), {} as Record<string, number>);
            await stream.writeSSE({
                event: "stats",
                data: `${JSON.stringify(map)} time: ${Temporal.Now.instant().toString()}`,
                id: Temporal.Now.instant().toString(),
            });
        }
    }));



Deno.serve(app.fetch)
