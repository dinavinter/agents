import { ServiceController } from "https://esm.sh/@cxai/stream/xstate?target=esnext";
import {
  asyncBatchEvents,
  asyncEventGenerator,
  fromAIElementStream,
  fromEventAsyncGenerator,
  yArrayIterator,
  yMapIterate,
} from "https://esm.sh/@cxai/stream@1.0.17?target=esnext";
import * as Y from "https://esm.sh/yjs@^13.6.20?target=esnext";
import { DOMParser, Element } from "jsr:@b-fuze/deno-dom";

import { fromAsyncGenerator } from "https://esm.sh/@cxai/stream@1.0.17/dist/xstate";
import {
  HocuspocusProvider,
  type HocuspocusProviderConfiguration,
  HocuspocusProviderWebsocket,
} from "https://esm.sh/@hocuspocus/provider@2.15.0?&external=ws&target=esnext";
import type {
  AnyEventObject,
  AnyStateMachine,
  EventObject,
  ObservableActorLogic,
  UnknownActorLogic,
} from "https://esm.sh/xstate@^5.19.0";
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
  toObserver,
} from "https://esm.sh/xstate@^5.19.0";

const renderContextEntry = (key: string, value: unknown, path: string = "") => {
  const entry = `${path}${key}`;
  return `<pre id="${entry}" class="map-entry bg-gray-50 rounded-lg shadow-inner pt-2 snap-center">
    <span class="h-6 text-blue-900 font-mono ">${key}</span>: 
    <pre class="map-value prettytext m-3 overflow-auto bg-gray-100 rounded-lg shadow-inner p-3 flex-wrap break-words max-w-full text-pretty text-wrap">
      <code class="flex-wrap word-wrap max-w-full scroll-auto overflow-y-scroll">
        ${value instanceof Object ? JSON.stringify(value, null, 2) : value?.toString() || ""}
      </code>
    </pre>
  </pre>`;
};

const renderNextEvent = (key: string, meta?: unknown) => {
  const description = meta && typeof meta === "object" && "@input" in meta ? meta["@input"] : "";
  return `<form class="flex flex-row w-full gap-2 mb-2">
    <input type="text" 
      class="flex-1 p-3 border border-gray-300 rounded-lg bg-white dark:bg-gray-800 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
      name="${key}"
      placeholder="${description || key}"
    >
    <button 
      class="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
      type="submit"
    >
      Send
    </button>
  </form>`;
};

const createXmlFragment = (doc: Y.Doc, path: string) => {
  const uiMap = doc.getMap("ui");
  const fragment = uiMap.get(path) as Y.XmlFragment | undefined;
  if (!fragment) {
    const newFragment = new Y.XmlFragment();
    uiMap.set(path, newFragment);
    return newFragment;
  }
  return fragment;
};

const htmlToYXmlElements = (html: string) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const element = doc.body.firstElementChild;

  if (!element) return new Y.XmlElement("div");

  const convertElement = (el: Element): Y.XmlElement => {
    const yElement = new Y.XmlElement(el.tagName.toLowerCase());

    // Copy attributes
    for (const attr of el.attributes) {
      yElement.setAttribute(attr.name, attr.value);
    }

    // Convert child nodes
    for (const child of el.childNodes) {
      if (child instanceof Element) {
        yElement.push([convertElement(child)]);
      } else if (child.nodeType === 3) { // Text node
        yElement.push([child.textContent || ""]);
      }
    }

    return yElement;
  };

  return convertElement(element);
};

const updateXmlElement = (fragment: Y.XmlFragment, id: string, html: string) => {
  const yElements = htmlToYXmlElements(html);
  if (yElements.length === 0) return;

  // Find existing element
  let start = 0;
  let length = 0;
  let found = false;

  fragment.forEach((item, index) => {
    if (item instanceof Y.XmlElement && item.getAttribute("id") === id) {
      start = index;
      length = 1;
      found = true;
    }
  });

  if (found) {
    fragment.delete(start, length);
    fragment.insert(start, yElements);
  } else {
    fragment.push(yElements);
  }
};

const docs = new Map<string, Y.Doc>();

function initializeDoc(doc: Y.Doc) {
  // Initialize all required maps
  if (!doc.getMap("ui").has("events")) {
    const eventsFragment = new Y.XmlFragment();
    doc.getMap("ui").set("events", eventsFragment);
  }
  if (!doc.getMap("ui").has("context")) {
    const contextFragment = new Y.XmlFragment();
    doc.getMap("ui").set("context", contextFragment);
  }

  // Ensure other maps exist
  doc.getMap("next");
  doc.getMap("context");

  return doc;
}

function getOrCreateDoc(id: string) {
  let doc = docs.get(id);
  if (!doc) {
    doc = new Y.Doc({ guid: id });
    docs.set(id, doc);
    // initializeDoc(doc);

    // Connect to Yjs after initialization
    const provider = new HocuspocusProvider({
      url: Deno.env.get("YJS_URL"),
      name: id,
      document: doc,
      connect: true,
    });
    console.log("connected to yjs", doc.guid);
  }
  return doc;
}

export const uiMachine = createMachine({
  id: "ui-machine",
  context: ({ input }: { input: { agent: Y.Doc; form?: { visible: boolean; suggestions?: string[] } } }) => ({
    agent: input.agent,
    form: input.form || {
      visible: true,
      suggestions: [],
    },
    nextEvents: {},
  }),
  initial: "idle",
  states: {
    idle: {
      always: {
        target: "observing",
      },
    },
    observing: {
      type: "parallel",
      states: {
        container: {
          initial: "rendering",
          states: {
            rendering: {
              entry: ({ context }) => {
                const uiMap = context.agent.getMap("ui");
                const eventsFragment = uiMap.get("events") as Y.XmlFragment;
                const contextFragment = uiMap.get("context") as Y.XmlFragment;
                const contextMap = context.agent.getMap("context");
                const nextMap = context.agent.getMap("next");

                // Initial render of context entries
                contextMap.forEach((value, key) => {
                  const html = renderContextEntry(key, value);
                  const elements = htmlToYXmlElements(html);
                  if (elements.length > 0) {
                    let found = false;
                    contextFragment.forEach((item, index) => {
                      if (item instanceof Y.XmlElement && item.getAttribute("id") === key) {
                        contextFragment.delete(index, 1);
                        contextFragment.insert(index, elements);
                        found = true;
                      }
                    });
                    if (!found) {
                      contextFragment.push(elements);
                    }
                  }
                });

                // Initial render of next events
                nextMap.forEach((meta, key) => {
                  const html = renderNextEvent(key, meta);
                  const elements = htmlToYXmlElements(html);
                  if (elements.length > 0) {
                    let found = false;
                    eventsFragment.forEach((item, index) => {
                      if (item instanceof Y.XmlElement && item.getAttribute("id") === key) {
                        eventsFragment.delete(index, 1);
                        eventsFragment.insert(index, elements);
                        found = true;
                      }
                    });
                    if (!found) {
                      eventsFragment.push(elements);
                    }
                  }
                });
              },
            },
          },
          on: {
            add: {
              actions: ({ context, event }) => {
                const uiMap = context.agent.getMap("ui");
                const eventsFragment = uiMap.get("events") as Y.XmlFragment;
                const html = renderNextEvent(event.key, event.data);
                const elements = htmlToYXmlElements(html);
                if (elements.length > 0) {
                  let found = false;
                  eventsFragment.forEach((item, index) => {
                    if (item instanceof Y.XmlElement && item.getAttribute("id") === event.key) {
                      eventsFragment.delete(index, 1);
                      eventsFragment.insert(index, elements);
                      found = true;
                    }
                  });
                  if (!found) {
                    eventsFragment.push(elements);
                  }
                }
              },
            },
            update: {
              actions: ({ context, event }) => {
                const uiMap = context.agent.getMap("ui");
                const eventsFragment = uiMap.get("events") as Y.XmlFragment;
                const html = renderNextEvent(event.key, event.data);
                const elements = htmlToYXmlElements(html);
                if (elements.length > 0) {
                  eventsFragment.forEach((item, index) => {
                    if (item instanceof Y.XmlElement && item.getAttribute("id") === event.key) {
                      eventsFragment.delete(index, 1);
                      eventsFragment.insert(index, elements);
                    }
                  });
                }
              },
            },
            delete: {
              actions: ({ context, event }) => {
                const uiMap = context.agent.getMap("ui");
                const eventsFragment = uiMap.get("events") as Y.XmlFragment;
                eventsFragment.forEach((item, index) => {
                  if (item instanceof Y.XmlElement && item.getAttribute("id") === event.key) {
                    eventsFragment.delete(index, 1);
                  }
                });
              },
            },
          },
        },
      },
    },
  },
});

function renderSubmitButton(key: string, meta: any) {
  const button = new Y.XmlElement("button");
  button.setAttribute(
    "class",
    "px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-",
  );
  button.setAttribute("type", "submit");
  button.setAttribute("hx-post", `events/${key}`);
  button.setAttribute("hx-swap", "none");
  return button;
}

function renderInput(key: string, meta: any) {
  const input = new Y.XmlElement("input");
  input.setAttribute("type", "text");
  const defaults = {
    "description": key,
    "placeholder": key,
    "value": "",
    "name": key,
    "class":
      "flex-1 p-3 border border-gray-300 rounded-lg bg-white dark:bg-gray-800 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent",
  };
  for (
    const [key, value] of Object.entries({
      ...defaults,
      ...meta || {},
    })
  ) {
    input.setAttribute(key, value);
  }

  return input;
}
export async function iterateNext(doc: Y.Doc) {
  const fragment = doc.getXmlFragment("@html.next");
  console.group(`iterating ${doc.guid}`);
  console.log(fragment.toJSON());
  for await (const [key, { newValue, action }] of yMapIterate(doc.getMap("next"))) {
    console.log("next", key, newValue);

    doc.transact(() => {
      const nodes = fragment.toArray() as Y.XmlElement[];

      for (const node of nodes.filter((node) => node.getAttribute("id") === key)) {
        fragment.delete(nodes.indexOf(node), 1);
      }

      if (action === "add" || action === "update") {
        console.log("adding", key, htmlToYXmlElements(renderNextEvent(key, newValue)).toJSON());
        const element = new Y.XmlElement("form");
        element.setAttribute("id", key);
        element.setAttribute("class", "flex flex-row w-full gap-2 mb-2");
        fragment.push([element]);
        element.push([renderInput(key, newValue?.meta), renderSubmitButton(key, newValue?.meta)]);
      }

      if (action === "delete") {
        console.log("deleting", key);
      }
    });
  }
  console.groupEnd();
}

export async function iterateContext(doc: Y.Doc) {
  for await (const [key, value] of yMapIterate(doc.getMap("context"))) {
    console.log("context", key, value);
    doc.transact(() => {
      const nodes = doc.getXmlFragment("@html.context").toArray() as Y.XmlElement[];
      const fragment = doc.getXmlFragment("@html.context");
      for (const node of fragment.toArray() as Y.XmlElement[]) {
        if (node.getAttribute("id") === key) {
          fragment.delete(nodes.indexOf(node), 1);
        }
      }
      const html = renderContextEntry(key, value);
      const elements = htmlToYXmlElements(html);
      if (elements.length > 0) {
        fragment.push(elements);
      }
    });
  }
}

export function createUIActor(agent: Y.Doc, options?: { form?: { visible: boolean; suggestions?: string[] } }) {
  return createActor(uiMachine, {
    input: {
      agent,
      form: options?.form,
    },
  });
}

export default async function(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const [agentId = "idx-gen-clean", rev = "25", mode = "view", ...path] = url.pathname.split("/").filter(Boolean);

  const agent = getOrCreateDoc(`${agentId}:${rev}`);

  if (req.method === "POST" && mode === "events") {
    const formData = await req.formData();

    agent.getArray("events").push([{
      id: path.pop(),
      formData,
    }]);

    return new Response(null, {
      status: 200,
    });
  }

  // const actor = createUIActor(agent).start();
  iterateNext(agent);
  iterateContext(agent);
  const eventsFragment = agent.getXmlFragment("@html.next");
  const contextFragment = agent.getXmlFragment("@html.context");
  // const eventsFragment = agent.getMap("ui").get("events") as Y.XmlFragment;
  // const contextFragment = agent.getMap("ui").get("context") as Y.XmlFragment;

  return new Response(
    `<!DOCTYPE html>
    <html lang="en">
      <head>
        <base href="${rev}/" />
        <title>Machine Inspector - ${agentId}:${rev}</title>
         <script src="https://unpkg.com/htmx.org@2.0.2"></script>
          <script src="https://unpkg.com/htmx-ext-sse@2.2.2/sse.js"></script>
          <script src="https://cdn.tailwindcss.com?plugins=forms,typography,aspect-ratio,line-clamp,container-queries"></script>
      </head>
      <body class="bg-gray-100 min-h-screen p-6">
        <div class="max-w-4xl mx-auto">
          <h1 class="text-2xl font-bold mb-6">Machine Inspector - ${agentId}:${rev}</h1>
          <div id="machine-container" class="bg-white rounded-lg shadow-lg p-6">
            <div id="content">
              <div class="w-full h-full flex flex-col gap-4">
                <div id="next-events" class="p-4 bg-gray-50 rounded-lg">
                  <h3 class="text-lg font-semibold mb-2">Available Events</h3>
                  <div id="events-container">
                    ${eventsFragment?.toJSON() || ""} 
                  </div>
                </div>
                <div id="context-container" class="p-4 bg-gray-50 rounded-lg">
                  <h3 class="text-lg font-semibold mb-2">Machine Context</h3>
                  <div id="context-items">
                    ${contextFragment?.toJSON() || ""}
                  </div>
                </div>
                 <div id="doc-json" class="p-4 bg-gray-50 rounded-lg">
                 <h3 class="text-lg font-semibold mb-2">Document JSON</h3>
                  <pre>${JSON.stringify(agent.toJSON(), null, 2)}</pre>
                  </div>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>`,
    {
      headers: {
        "content-type": "text/html",
      },
    },
  );
}