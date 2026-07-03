/**
 * OpenCode Agent Machine
 * 
 * Always-live coding agent. UI is a CodeMirror editor where:
 * - User writes/edits code normally
 * - Comments prefixed with `// @ai:` are prompts to the AI
 * - AI responds by modifying the code document (Yjs CRDT)
 * 
 * States:
 *   idle        - Watching for @ai: comments / user edits
 *   processing  - Parsing the request, preparing context
 *   generating  - AI is streaming code changes
 * 
 * The machine is always live - it never reaches a final state.
 * It loops: idle → processing → generating → idle
 */

import { assign, emit, setup } from "xstate";
import { fromA2AEventStream } from "../a2a";
import { render, renderTo } from "./agent-render";
import * as Y from "yjs";

// --- Types ---

export interface CodeRequest {
  prompt: string;       // The @ai: comment text
  line: number;         // Line number of the comment
  context: string;      // Surrounding code for context
  fullDoc: string;      // Full document content
}

export interface CodeChange {
  type: "insert" | "replace" | "delete";
  from: number;         // Line number
  to?: number;          // End line (for replace/delete)
  content?: string;     // New content
}

// --- Yjs helpers ---

function getDocContent(doc: Y.Doc): string {
  return doc.getText("code").toString();
}

function applyCodeChange(doc: Y.Doc, change: CodeChange) {
  const text = doc.getText("code");
  const content = text.toString();
  const lines = content.split("\n");
  
  doc.transact(() => {
    switch (change.type) {
      case "insert": {
        const insertPos = lines.slice(0, change.from).join("\n").length + (change.from > 0 ? 1 : 0);
        text.insert(insertPos, (change.content || "") + "\n");
        break;
      }
      case "replace": {
        const from = lines.slice(0, change.from).join("\n").length + (change.from > 0 ? 1 : 0);
        const to = lines.slice(0, (change.to || change.from) + 1).join("\n").length;
        text.delete(from, to - from);
        text.insert(from, change.content || "");
        break;
      }
      case "delete": {
        const from = lines.slice(0, change.from).join("\n").length + (change.from > 0 ? 1 : 0);
        const to = lines.slice(0, (change.to || change.from) + 1).join("\n").length + 1;
        text.delete(from, Math.min(to - from, text.length - from));
        break;
      }
    }
  });
}

function extractAIComments(content: string): CodeRequest[] {
  const lines = content.split("\n");
  const requests: CodeRequest[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/\/\/\s*@ai:\s*(.+)/);
    if (match) {
      const contextStart = Math.max(0, i - 10);
      const contextEnd = Math.min(lines.length, i + 10);
      requests.push({
        prompt: match[1].trim(),
        line: i,
        context: lines.slice(contextStart, contextEnd).join("\n"),
        fullDoc: content,
      });
    }
  }
  
  return requests;
}

// --- Machine ---

export const machine = setup({
  actors: {
    aiCodeStream: fromA2AEventStream({
      temperature: 0.3,  // Lower temp for code generation
    }),
  },
  types: {
    input: {} as { doc?: Y.Doc },
    context: {} as {
      doc: Y.Doc;
      currentRequest: CodeRequest | null;
      status: "idle" | "processing" | "generating";
      lastOutput: string;
    },
  },
}).createMachine({
  initial: "idle",
  context: ({ input }) => {
    const doc = input?.doc || new Y.Doc();
    // Initialize with starter code if empty
    const text = doc.getText("code");
    if (text.length === 0) {
      text.insert(0, `// Welcome to OpenCode Editor
// Type code here and use @ai: comments to prompt the AI
// Example: // @ai: add a function that calculates fibonacci

function hello() {
  console.log("Hello from OpenCode!");
}

// @ai: add error handling to the hello function
`);
    }
    return {
      doc,
      currentRequest: null,
      status: "idle" as const,
      lastOutput: "",
    };
  },
  // Initial UI render
  entry: emit(({ context }) => ({
    type: "editor-init",
    event: "editor-init",
    data: JSON.stringify({ content: getDocContent(context.doc) }),
  })),
  states: {
    idle: {
      entry: [
        assign({ status: () => "idle" as const }),
        emit(({ context }) => ({
          type: "status",
          event: "status",
          data: `<span class="text-green-500">● idle</span> — Ready`,
        })),
      ],
      on: {
        // User submits via @ai: comment or explicit trigger
        generate: {
          target: "processing",
          actions: assign({
            currentRequest: ({ event }) => event as unknown as CodeRequest,
          }),
        },
        // Process @ai: comments from editor content
        "content-changed": {
          actions: assign({
            // Just track doc state - actual processing happens on explicit trigger
          }),
        },
      },
    },
    processing: {
      entry: [
        assign({ status: () => "processing" as const }),
        emit(() => ({
          type: "status",
          event: "status",
          data: `<span class="text-yellow-500">● processing</span> — Parsing request...`,
        })),
      ],
      always: {
        target: "generating",
        guard: ({ context }) => context.currentRequest !== null,
      },
    },
    generating: {
      entry: [
        assign({ status: () => "generating" as const }),
        emit(({ context }) => ({
          type: "status",
          event: "status",
          data: `<span class="text-blue-500">● generating</span> — "${context.currentRequest?.prompt}"`,
        })),
      ],
      invoke: {
        src: "aiCodeStream",
        id: "codegen",
        onError: {
          target: "idle",
          actions: [
            emit(({ event }) => ({
              type: "status",
              event: "status",
              data: `<span class="text-red-500">● error</span> — ${(event as any).error?.message || 'Generation failed'}`,
            })),
          ],
        },
        input: ({ context: { currentRequest, doc } }) => {
          const content = getDocContent(doc);
          return {
            prompt: `${currentRequest?.prompt}\n\nCurrent code:\n\`\`\`\n${content}\n\`\`\`\n\nRespond with ONLY the complete updated code. No explanations, no markdown fences, just the code.`,
            system: `You are a code assistant integrated into an editor. The user writes code and uses // @ai: comments to request changes. Your job is to modify the code as requested. Output ONLY the complete updated file content - no markdown, no explanations. Remove the @ai: comment after fulfilling it. Keep all other code intact.`,
          };
        },
      },
      on: {
        "text-delta": {
          actions: assign({
            lastOutput: ({ context, event }) => context.lastOutput + ((event as any).textDelta || ""),
          }),
        },
        output: {
          target: "idle",
          actions: [
            // Apply the AI output to the Yjs doc
            assign({
              lastOutput: ({ context, event }) => {
                const output = (event as any).output || context.lastOutput;
                if (output) {
                  const text = context.doc.getText("code");
                  // Replace entire doc content with AI output
                  context.doc.transact(() => {
                    text.delete(0, text.length);
                    // Strip markdown fences if present
                    const clean = output.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
                    text.insert(0, clean);
                  });
                }
                return "";
              },
            }),
            // Emit updated code to editor
            emit(({ context }) => ({
              type: "editor-update",
              event: "editor-update",
              data: JSON.stringify({ content: getDocContent(context.doc) }),
            })),
            assign({ currentRequest: () => null }),
          ],
        },
      },
    },
  },
});
