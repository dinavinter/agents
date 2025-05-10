/** @jsxImportSource https://esm.sh/hono@latest/jsx **/

import { filterAsync, yMapIterate } from "https://esm.sh/@cxai/stream";
import { generateObject } from "https://esm.sh/ai";
import { connectYjs } from "https://esm.town/v/dinavinter/connect";
import onlyOnce from "https://esm.town/v/dinavinter/dcom/async/o";
import type { Account } from "https://esm.town/v/dinavinter/dcom/user";
import { renderer } from "https://esm.town/v/dinavinter/htmx_layout";
import { azure } from "npm:@ai-sdk/azure";
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { Fragment } from "npm:hono/jsx";
import { renderToReadableStream, Suspense } from "npm:hono/jsx/streaming";
import { streamSSE } from "npm:hono/streaming";
import * as Y from "npm:yjs";
import { z } from "npm:zod";


const app = new Hono();
app.use(
  "/*",
  cors(),
);
 
const doc = new Y.Doc({ guid: "notifications" });
const notifications = doc.getMap("notifications");
const events = doc.getArray("events");
connectYjs(doc);


const NotificationSchema =z.object()

const { listen, state } = onlyOnce(async function*() {
  for await (const [key] of yMapIterate(events)) {
    yield [key, notifications.get(key)];
  }
}, { state: doc.getMap("@handler.notifications") });

listen(async function(message: Notification) {

})

// view
app.get("*", renderer());

app.get(
  "/",
  (c) =>
    c.render(
      <Fragment>
        <div
          hx-ext="sse"
          sse-connect="events"
          sse-swap="notification"
          hx-swap="innerHTML transition:true swap:1s"
          class=" w-full h-full bg-gray-900 "
        />
        <script src="/web-compnet"></script>
      </Fragment>,
    ),
);

  


//sse stream of notifications elements
app.get("/events", (c) =>
     streamSSE(c, async (stream) => {
  //sse stream
  const returned = {} as { [key: string]: boolean }
  const filter = ([key, { action, newValue, oldValue }]) => {
    return !!newValue && !returned[key]
  }
   for await (const [key, { action, newValue, oldValue }] of filterAsync(yMapIterate(notifications), filter)){
      const {message, channel, timestamp, priority, urgency, reason} = notifications.get(key)   
      await stream.writeSSE({
            event: "notification",
            data: `
            <notification-item 
                message="${message}"
                channel="${channel}"
                timestamp="${timestamp}"
                priority="${priority}"
                urgency="${urgency}" 
                reason="${reason}" 
                action="${action}">
            </notification-item>
            `
      })
      returned[key] = true
  }
}))



  
app.get("/web-compnet", (c) => {
  return c.text(`
          class NotificationElement extends HTMLElement {
            constructor() {
              super();
            }
            static get observedAttributes() {
              return ["message", "channel", "timestamp", "priority", "urgency", "reason", "action"];
            }
            get message() {
              return this.getAttribute("message");
            }
            get channel() {
              return this.getAttribute("channel");
            }
            
            attributeChangedCallback(name, oldValue, newValue) {
              console.log(name, oldValue, newValue);
            }

            connectedCallback() {
              this.innerHTML = \`
                <div>
                  <h1>Notification Item</h1>
                  <!-- notification content -->
                </div>
              \`;
            }
          }
          customElements.define("notification-item", NotificationElement);   
  `);
});

export default app.fetch