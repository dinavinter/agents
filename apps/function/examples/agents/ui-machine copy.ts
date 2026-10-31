import { ServiceController } from "https://esm.sh/@cxai/stream/xstate?target=esnext";
import {
  asyncBatchEvents,
  asyncEventGenerator,
  fromAIElementStream,
  fromEventAsyncGenerator,
  yArrayIterator,
  yMapIterate,
} from "https://esm.sh/@cxai/stream?target=esnext";
import * as Y from "https://esm.sh/yjs@^13.6.20?target=esnext";

import {
  HocuspocusProvider,
  type HocuspocusProviderConfiguration,
  HocuspocusProviderWebsocket,
} from "https://esm.sh/@hocuspocus/provider@2.15.0?&external=ws&target=esnext";
import type { AnyEventObject, AnyStateMachine, EventObject, UnknownActorLogic } from "https://esm.sh/xstate@^5.19.0";
import {
  assign,
  createActor,
  createMachine,
  emit,
  forwardTo,
  fromCallback,
  fromEventObservable,
  fromObservable,
  fromPromise,
  sendTo,
  setup,
  spawnChild,
} from "https://esm.sh/xstate@^5.19.0";

const options: Partial<HocuspocusProviderConfiguration> = {};
function createYjsActor(
  machine: AnyStateMachine,
  doc: Y.Doc,
  { agent, form }: { agent: Y.Doc; form: { visible: boolean; suggestions?: string[] } },
) {
  return createActor(ServiceController, {
    id: agent.guid,
    input: {
      doc: doc,
      logic: machine.provide({
        actors: {
          stream: asyncEventGenerator,
          batch: asyncBatchEvents,
          map: fromEventAsyncGenerator(async function*({ input }: { input: string }) {
            for await (const [key, value] of yMapIterate(agent.getMap(input)) {
              const { action, newValue } = value || { action: "delete" };
              yield {
                data: JSON.stringify(newValue),
                type: action,
                key,
              };
            }
          }),
          array: fromEventAsyncGenerator(async function*({ input }: { input: string }) {
            for await (const { type, ...event } of agent.getArray(input)) {
              yield {
                data: JSON.stringify(event),
                type,
                ...event,
              };
            }
          }),
          forward: fromCallback(({ input, receive }) => {
            receive(event => {
              console.log("forwarding event", event);
              agent.getArray(input || "events").push([event]);
            });
          }),
        },
      }),
      input: {
        agent,
        form,
      },
    },
  });
}

function connectYjs(doc: Y.Doc | string) {
  const provider = new HocuspocusProvider({
    preserveConnection: true,
    broadcast: true,
    url: Deno.env.get("YJS_URL"),
    document: typeof doc === "string" ? new Y.Doc({ guid: doc }) : doc,
    websocketProvider: new HocuspocusProviderWebsocket({
      url: Deno.env.get("YJS_URL"),
      WebSocketPolyfill: WebSocket,
    }),
    forceSyncInterval: true,
    name: typeof doc === "string" ? doc : doc?.guid || "default",
    ...options,
    connect: true,
  });

  console.log("connected to yjs", provider.document.guid, Deno.env.get("YJS_URL"), provider.isConnected);

  provider.document.load();
  return provider.document;
}

const renderContextEntry = (key: string, value: unknown, path: string = "") => {
  const entry = `${path}${key}`;
  return `<pre id="${entry}"  
    class="map-entry bg-gray-50 rounded-lg shadow-inner pt-2 snap-center"
    hx-ext="sse"
    hx-swap="outerHTML" 
    sse-swap="${entry}"
    contenteditable>
    <span class="h-6 text-blue-900 font-mono ">${key}</span>: 
    <pre class="map-value prettytext m-3 overflow-auto bg-gray-100 rounded-lg shadow-inner p-3 flex-wrap break-words max-w-full text-pretty text-wrap" 
     ><code class="flex-wrap word-wrap max-w-full scroll-auto overflow-y-scroll" contenteditable
       hx-swap="innerHTML"
      sse-swap="${entry}.value"
      id="${entry}.value"
      >${value instanceof Object ? JSON.stringify(value, null, 2) : value?.toString() || ""}</code>
    </pre>
  </pre>`;
};

export const uiMachine = setup({}).createMachine({
  id: "ui-machine",
  entry: [
    spawnChild("forward", {
      id: "agent.input",
      input: "events",
    }),
    spawnChild("map", {
      id: "agent.state.changes",
      input: "context",
    }),
  ],
  context: (
    { input: { agent, form } }: { input: { agent: Y.Doc; form: { visible: boolean; suggestions?: string[] } } },
  ) => ({
    form: form || {
      visible: true,
      suggestions: [
        "please create me a dataflow which sync my accounts with sftp",
        "create a workflow to process my customer data",
      ],
    },
    agent,
  }),
  initial: "idle",
  states: {
    idle: {
      always: [{
        target: "context",
        guard: ({ context: { agent } }) => agent.getArray("emitted").length > 0,
      }, {
        target: "container",
      }],
    },
    container: {
      entry: emit({
        type: "message",
        data:
          `<div class="w-full h-full flex flex-col"><div id="action-container"  class=" flex flex-col w-full" sse-swap="@html.actions" hx-swap="beforeend" ></div>
                      <div id="context-container" 
                                              class="mt-4 p-4 bg-gray-50 rounded-lg"
                                              sse-swap="@html.context" 
                                              hx-swap="beforeend transition:true swap:1s">
                      </div>
          </div>`,
      }),
      after: {
        200: "context",
      },
    },
    context: {
      type: "parallel",
      entry: [
        spawnChild("map", {
          id: "agent.next",
          input: "next",
        }),
      ],
      states: {
        next: {
          invoke: {
            src: fromEventAsyncGenerator(async function*({ input }: { input: Y.Map<unknown> }) {
              for await (const [key, value] of yMapIterate(input)) {
                console.log("next-event", key, value);
                const { action, newValue } = value || { action: "delete" };
                yield {
                  data: newValue,
                  type: action,
                  key,
                };
              }
            }),
            input: ({ context: { agent } }) => agent.getMap("next"),
          },
          on: {
            add: {
              actions: [
                emit(({ event }) => ({
                  type: "@htmx.append",
                  event: `@html.actions`,
                  data: `<form class="flex flex-row w-full" sse-swap="@html.${event.key}" hx-swap="innerHTML">
                              <input  
                                type="text" 
                                class="flex-1 p-3 border border-gray-300 rounded-lg bg-white dark:bg-gray-800 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
                                name="request"
                                sse-swap="@html.${event.key}.value" hx-swap="innerHTML"
                                list="idx-prompt"
                              >
                                <button 
                                  class="mx-4 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                                  hx-post="events/${event.key}"
                                  hx-target="none"
                                >
                                Create
                              </button>
                            </form>`,
                  defer: 150,
                  id: `${event.key}.${event.timestamp}`,
                })),
              ],
            },
            update: {
              actions: [
                emit(({ event }) => ({
                  type: "@htmx.replace",
                  event: `@html.${event.key}.value`,
                  data: JSON.stringify(event.data, null, 2),
                  defer: 200,
                  id: `${event.key}.${event.timestamp}`,
                })),
              ],
            },
            delete: {
              actions: [
                emit(({ event }) => ({
                  type: "@htmx.remove",
                  event: `@html.${event.key}`,
                  data: "",
                  defer: 200,
                  id: `${event.key}.${event.timestamp}`,
                })),
              ],
            },
          },
        },
        context: {
          invoke: {
            src: fromEventAsyncGenerator(async function*({ input }: { input: Y.Map<unknown> }) {
              for await (const [key, value] of yMapIterate(input)) {
                const { action, newValue } = value || { action: "delete" };
                yield {
                  data: newValue,
                  type: action,
                  key,
                };
              }
            }),
            input: ({ context: { agent } }) => agent.getMap("context"),
          },
          on: {
            add: {
              actions: [
                emit(({ event }) => ({
                  type: "@htmx.append",
                  event: `@html.context`,
                  data: renderContextEntry(event.key, event.data, "@html."),
                  defer: 150,
                  id: `${event.key}.${event.timestamp}`,
                })),
              ],
            },
            update: {
              actions: [
                emit(({ event }) => ({
                  type: "@htmx.replace",
                  event: `@html.${event.key}.value`,
                  data: JSON.stringify(event.data, null, 2),
                  defer: 200,
                  id: `${event.key}.${event.timestamp}`,
                })),
              ],
            },
            delete: {
              actions: [
                emit(({ event }) => ({
                  type: "@htmx.remove",
                  event: `@html.${event.key}`,
                  data: "",
                  defer: 200,
                  id: `${event.key}.${event.timestamp}`,
                })),
              ],
            },
          },
        },
      },
    },
  },
});

const docs = new Map<string, Y.Doc>();
function getOrCreateDoc(id: string, onCreate?: (doc: Y.Doc) => void) {
  if (!docs.has(id)) {
    const doc = connectYjs(id);
    onCreate && onCreate(doc);
    docs.set(id, doc);
  }
  return docs.get(id);
}

function createMachineDoc(agent: string, rev: string) {
  const id = `${agent}:${rev}`;
  const uiAgent = `${agent}:ui`;
  getOrCreateDoc(uiAgent, (doc) => {
    doc.getMap().set("rev", rev);
    doc.getMap().set("codemirror", `export default ${uiMachine.toJSON()}`);
    doc.getMap("revisions").set(rev, "idle");
  });
  const uiDoc = getOrCreateDoc(`${uiAgent}:${rev}`);

  getOrCreateDoc(agent, (doc) => {
    doc.getMap().set("rev", rev);
    // doc.getMap().set("codemirror", `export default ${uiMachine.toJSON()}`);
    doc.getMap("revisions").set(rev, "idle");
  });

  const agentDoc = getOrCreateDoc(id);

  return {
    agent: agentDoc,
    ui: uiDoc,
  };
}

export default async function(req: Request): Promise<Response> {
  const path = new URL(req.url).pathname.split("/").slice(1);
  console.log(path);
  if (path[0] === "agents") {
    const mode = path.pop() || "view";
    const rev = path.pop() || "1";
    const id = path.pop() || "default";

    const { agent, ui } = createMachineDoc(id, rev);
    const actor = createYjsActor(uiMachine, ui, { agent, form: { visible: true } }).start();
    const agentsUrl = `https://agents.cfapps.us10-001.hana.ondemand.com/agents`;
    return new Response(
      `<embed style="height:  80vh; width: 100vw;" src="${agentsUrl}/${id}:ui/${rev}/${mode}" />
     
       <pre> <span class="block font-semibold">UI->emitted</span>
        ${JSON.stringify(ui.getArray("emitted").toJSON() || {}, null, 2).replace(/</g, "&lt;").replace(/>/g, "&gt;")}
        </pre>
        </pre>
        `,
      {
        headers: {
          "content-type": "text/html",
        },
      },
    );
  }
  return new Response("Not Found", { status: 404 });
}

export const createUITransformer = () => {
  return (event: unknown) => {
    if (typeof event === "string") {
      return event;
    }

    if (event && typeof event === "object") {
      if ("type" in event && event.type === "error") {
        return `<div class="error-message text-red-600">${JSON.stringify(event)}</div>`;
      }

      if ("type" in event && event.type === "result") {
        return `<div class="success-message text-green-600">${JSON.stringify(event)}</div>`;
      }
    }

    return `<pre><code>${JSON.stringify(event, null, 2)}</code></pre>`;
  };
};