/**
 * Form Generator Machine
 * 
 * Operates on Yjs fragments directly - the AI "speaks" in element operations
 * that are applied to a shared Yjs document. Each operation is a CRDT update
 * that syncs to all connected clients via Hocuspocus.
 * 
 * Fragment language (what the AI outputs):
 *   { op: "add", id: "field_email", element: { tag: "input", type: "email", name: "email", label: "Email", placeholder: "you@example.com" } }
 *   { op: "update", id: "field_email", props: { required: true, validation: "email" } }
 *   { op: "remove", id: "field_email" }
 *   { op: "style", id: "field_email", css: "border-color: red;" }
 *   { op: "meta", title: "Registration Form", description: "..." }
 */

import { assign, emit, setup } from "xstate";
import { fromA2AElementStream } from "../a2a";
import { z } from "zod";
import { render, renderTo } from "./agent-render";
import * as Y from "yjs";

// --- Yjs Fragment Schema ---

export interface FormElement {
  id: string;
  tag: string;       // input, select, textarea, button, label, div
  type?: string;     // text, email, password, checkbox, select, submit
  name?: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  options?: string[]; // for select
  validation?: string;
  css?: string;
  children?: string; // inner HTML for containers
}

export interface FormFragment {
  meta: { title: string; description: string };
  elements: FormElement[];
}

export interface FragmentOp {
  op: "add" | "update" | "remove" | "style" | "meta";
  id?: string;
  element?: FormElement;
  props?: Partial<FormElement>;
  css?: string;
  title?: string;
  description?: string;
}

// --- Yjs helpers ---

function applyOp(doc: Y.Doc, op: FragmentOp) {
  const elements = doc.getArray<Y.Map<any>>("elements");
  const meta = doc.getMap("meta");

  doc.transact(() => {
    switch (op.op) {
      case "meta":
        if (op.title) meta.set("title", op.title);
        if (op.description) meta.set("description", op.description);
        break;

      case "add":
        if (op.element) {
          // Skip if element with same ID already exists
          const id = op.element.id || op.id;
          let exists = false;
          for (let i = 0; i < elements.length; i++) {
            if (elements.get(i).get("id") === id) {
              exists = true;
              break;
            }
          }
          if (!exists) {
            const yEl = new Y.Map<any>();
            Object.entries(op.element).forEach(([k, v]) => {
              if (Array.isArray(v)) {
                const arr = new Y.Array<string>();
                arr.push(v);
                yEl.set(k, arr);
              } else {
                yEl.set(k, v);
              }
            });
            elements.push([yEl]);
          }
        }
        break;

      case "update":
        if (op.id && op.props) {
          for (let i = 0; i < elements.length; i++) {
            const el = elements.get(i);
            if (el.get("id") === op.id) {
              Object.entries(op.props).forEach(([k, v]) => el.set(k, v));
              break;
            }
          }
        }
        break;

      case "remove":
        if (op.id) {
          for (let i = 0; i < elements.length; i++) {
            if (elements.get(i).get("id") === op.id) {
              elements.delete(i, 1);
              break;
            }
          }
        }
        break;

      case "style":
        if (op.id && op.css) {
          for (let i = 0; i < elements.length; i++) {
            const el = elements.get(i);
            if (el.get("id") === op.id) {
              el.set("css", op.css);
              break;
            }
          }
        }
        break;
    }
  });
}

function fragmentToHtml(doc: Y.Doc): string {
  const meta = doc.getMap("meta");
  const elements = doc.getArray<Y.Map<any>>("elements");
  
  const title = meta.get("title") || "Form";
  let html = `<h2 class="text-lg font-semibold mb-4">${title}</h2>\n`;
  html += `<form class="space-y-4">\n`;

  for (let i = 0; i < elements.length; i++) {
    const el = elements.get(i);
    const id = el.get("id") || `el-${i}`;
    const tag = el.get("tag") || "input";
    const type = el.get("type") || "text";
    const name = el.get("name") || id;
    const label = el.get("label");
    const placeholder = el.get("placeholder") || "";
    const required = el.get("required");
    const css = el.get("css") || "";
    const options = el.get("options");

    if (label) {
      html += `  <div class="space-y-1">\n`;
      html += `    <label for="${id}" class="text-sm font-medium text-gray-700">${label}${required ? ' *' : ''}</label>\n`;
    }

    if (tag === "select" && options) {
      const opts = options instanceof Y.Array ? options.toArray() : (Array.isArray(options) ? options : []);
      html += `    <select id="${id}" name="${name}" class="w-full px-3 py-2 border rounded-lg text-sm ${css}"${required ? ' required' : ''}>\n`;
      html += `      <option value="">Select...</option>\n`;
      opts.forEach((o: string) => { html += `      <option value="${o}">${o}</option>\n`; });
      html += `    </select>\n`;
    } else if (tag === "textarea") {
      html += `    <textarea id="${id}" name="${name}" placeholder="${placeholder}" class="w-full px-3 py-2 border rounded-lg text-sm ${css}" rows="3"${required ? ' required' : ''}></textarea>\n`;
    } else if (tag === "button") {
      html += `    <button type="${type}" class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 ${css}">${label || name}</button>\n`;
    } else {
      html += `    <input id="${id}" type="${type}" name="${name}" placeholder="${placeholder}" class="w-full px-3 py-2 border rounded-lg text-sm ${css}"${required ? ' required' : ''} />\n`;
    }

    if (label && tag !== "button") {
      html += `  </div>\n`;
    }
  }

  html += `</form>`;
  return html;
}

// --- XState Machine ---

export const machine = setup({
  actors: {
    aiFragmentStream: fromA2AElementStream({
      temperature: 0.7,
    }),
  },
  types: {
    input: {} as { doc?: Y.Doc },
    context: {} as {
      request?: string;
      doc: Y.Doc;
      ops: FragmentOp[];
    },
  },
}).createMachine({
  initial: "idle",
  context: ({ input }) => ({
    request: "",
    doc: input?.doc || new Y.Doc(),
    ops: [],
  }),
  entry: renderTo("chat", ({ html, stream }) => html`<div class="mb-4">
    <div class="flex items-start gap-3">
      <img class="w-8 h-8 rounded-full" src="https://flowbite.com/docs/images/people/profile-picture-2.jpg" alt="User" />
      <div class="flex-1">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-sm font-semibold text-gray-900">You</span>
        </div>
        <form class="flex gap-2">
          <input type="text" autocomplete="true" list="form-suggestions" class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" name="message" placeholder="Describe the form you want..." />
          <button class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700" hx-post="${stream.href}/events/message" hx-swap="outerHTML">Generate</button>
          <datalist id="form-suggestions">
            <option value="User registration form with email, password, and profile fields" />
            <option value="Contact form with name, email, subject, and message" />
            <option value="Event booking form with date picker, attendees, and preferences" />
            <option value="Add a phone number field after email" />
          </datalist>
        </form>
      </div>
    </div>
  </div>`),
  states: {
    idle: {
      on: {
        message: {
          target: "generating",
          actions: assign({
            request: ({ event: { message } }) => message,
          }),
        },
      },
    },
    generating: {
      entry: [
        renderTo("chat", ({ html, context }) => html`<div class="mb-3">
          <div class="flex items-start gap-3">
            <img class="w-8 h-8 rounded-full" src="https://flowbite.com/docs/images/people/profile-picture-2.jpg" alt="User" />
            <div class="flex-1">
              <p class="text-sm text-gray-700 bg-gray-100 rounded-lg px-3 py-2">${context.request}</p>
            </div>
          </div>
        </div>
        <div class="mb-3">
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-bold">AI</div>
            <div class="flex-1">
              <p class="text-sm text-gray-500 italic" sse-swap="status" hx-swap="innerHTML">Generating form fragments...</p>
              <div class="mt-2 text-xs font-mono text-gray-400 max-h-32 overflow-y-auto" sse-swap="ops-log" hx-swap="beforeend"></div>
            </div>
          </div>
        </div>`),
      ],
      invoke: {
        src: "aiFragmentStream",
        id: "formgen",
        onError: {
          target: "idle",
          actions: [
            renderTo("chat", ({ html, event }) => html`<div class="mb-3 p-2 bg-red-50 rounded text-xs text-red-700">Error: ${(event as any).error?.message || JSON.stringify(event)}</div>`),
            emit(({ event }) => ({
              type: "form-preview",
              event: "form-preview",
              data: `<div class="p-4 text-red-600 text-sm">Error: ${(event as any).error?.message || 'Unknown error'}</div>`,
            })),
          ],
        },
        input: ({ context: { request, doc } }) => {
          // Always pass current form state so AI knows what exists
          const currentElements = doc.getArray<Y.Map<any>>("elements");
          const currentState = [];
          for (let i = 0; i < currentElements.length; i++) {
            const el = currentElements.get(i);
            currentState.push(Object.fromEntries(el.entries()));
          }
          const meta = doc.getMap("meta");
          const title = meta.get("title") || "";

          const stateDescription = currentState.length > 0
            ? `\n\nCurrent form "${title}" has these elements:\n${JSON.stringify(currentState, null, 0)}\n\nTo modify existing fields use "update" op. To add new fields use "add" with a UNIQUE id. To style use "style" op. Do NOT re-add fields that already exist.`
            : `\n\nThe form is empty. Start with a "meta" op then "add" fields.`;

          return {
            prompt: `${request}${stateDescription}`,
            system: `You are a form builder. Output JSON operations to modify a form. Operations:
- {"op":"meta","title":"...","description":"..."} - set form title
- {"op":"add","id":"field_xxx","element":{"id":"field_xxx","tag":"input","type":"text","name":"xxx","label":"Xxx","placeholder":"...","required":true}} - add NEW field (only if it doesn't exist)
- {"op":"update","id":"field_xxx","props":{"label":"New Label","placeholder":"..."}} - update existing field properties
- {"op":"style","id":"field_xxx","css":"tailwind classes"} - style existing field
- {"op":"remove","id":"field_xxx"} - remove a field

IMPORTANT: If the form already has fields, do NOT re-add them. Use "update" or "style" to modify existing ones.`,
            schema: z.object({
              op: z.enum(["add", "update", "remove", "style", "meta"]).describe("The operation type"),
              id: z.string().optional().describe("Element ID for add/update/remove/style"),
              element: z.object({
                id: z.string().describe("Unique element ID"),
                tag: z.enum(["input", "select", "textarea", "button", "div"]).describe("HTML tag"),
                type: z.string().optional().describe("Input type: text, email, password, checkbox, submit"),
                name: z.string().optional().describe("Form field name"),
                label: z.string().optional().describe("Display label"),
                placeholder: z.string().optional().describe("Placeholder text"),
                required: z.boolean().optional().describe("Whether field is required"),
                options: z.array(z.string()).optional().describe("Options for select"),
              }).optional().describe("Element definition for 'add' op"),
              props: z.record(z.any()).optional().describe("Properties to update for 'update' op"),
              css: z.string().optional().describe("Tailwind CSS classes for 'style' op"),
              title: z.string().optional().describe("Form title for 'meta' op"),
              description: z.string().optional().describe("Form description for 'meta' op"),
            }).describe("A fragment operation to apply to the form document"),
          };
        },
      },
      on: {
        "*": {
          actions: [
            // Apply operation to Yjs doc
            assign({
              ops: ({ context, event }) => {
                const op = event as unknown as FragmentOp;
                if (op.op) {
                  applyOp(context.doc, op);
                  return [...context.ops, op];
                }
                return context.ops;
              },
            }),
            // Emit op log to chat
            renderTo("ops-log", ({ html, event }) => {
              const op = event as unknown as FragmentOp;
              if (!op.op) return html``;
              return html`<div class="py-0.5 border-b border-gray-100 text-[10px]">
                <span class="text-indigo-500">${op.op}</span>
                ${op.id ? html`<span class="text-gray-500"> #${op.id}</span>` : ''}
                ${op.title ? html`<span class="text-gray-600"> "${op.title}"</span>` : ''}
                ${op.element?.label ? html`<span class="text-gray-600"> [${op.element.tag}] ${op.element.label}</span>` : ''}
              </div>`;
            }),
            // Re-render form preview from current Yjs state
            emit(({ context }) => {
              const formHtml = fragmentToHtml(context.doc);
              return {
                type: "form-preview",
                event: "form-preview",
                data: `<div class="max-w-md mx-auto bg-white rounded-xl shadow-sm border border-gray-200 p-6">${formHtml}</div>`,
              };
            }),
          ],
        },
        output: {
          target: "idle",
          actions: [
            // Render form preview from current Yjs state (ops already applied by * handler)
            emit(({ context }) => {
              const formHtml = fragmentToHtml(context.doc);
              const singleLine = formHtml.replace(/\n/g, '').replace(/\s{2,}/g, ' ');
              return {
                type: "form-preview",
                event: "form-preview",
                data: `<div class="max-w-md mx-auto bg-white rounded-xl shadow-sm border border-gray-200 p-6">${singleLine}</div>`,
              };
            }),
            renderTo("status", ({ html, context }) => html`<span class="text-sm text-green-600 font-medium">Done! Applied ${context.ops.length} operations.</span>`),
            // Re-render the input form for next prompt
            renderTo("chat", ({ html, stream }) => html`<div class="mb-4 mt-4 pt-4 border-t border-gray-100">
              <div class="flex items-start gap-3">
                <img class="w-8 h-8 rounded-full" src="https://flowbite.com/docs/images/people/profile-picture-2.jpg" alt="User" />
                <div class="flex-1">
                  <form class="flex gap-2">
                    <input type="text" class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" name="message" placeholder="Modify the form..." />
                    <button class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700" hx-post="${stream.href}/events/message" hx-swap="outerHTML">Update</button>
                  </form>
                </div>
              </div>
            </div>`),
            assign({ ops: [] }),
          ],
        },
      },
    },
  },
});
