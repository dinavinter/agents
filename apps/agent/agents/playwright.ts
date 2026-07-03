/**
 * Playwright Test Agent Machine
 * 
 * AI-powered test generation and execution loop:
 *   describe → generate → run → fix (repeat until passing)
 * 
 * UI: CodeMirror editor for test scenarios (left) + live reports/screenshots (right)
 * 
 * States:
 *   idle        - Waiting for test scenario description
 *   generating  - AI generates Playwright test code from description
 *   running     - Executes the generated test via Playwright
 *   fixing      - AI analyzes failures and fixes the test code
 *   passed      - Tests passed, show results
 * 
 * The agent loops: generating → running → fixing → running until tests pass
 * or max retries reached.
 */

import { assign, emit, fromPromise, setup } from "xstate";
import { fromA2AEventStream } from "../a2a";
import { renderTo } from "./agent-render";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";

const HOCUSPOCUS_URL = process.env.HOCUSPOCUS_URL || "ws://hocuspocus:1234";

// --- Types ---

export interface TestResult {
  passed: boolean;
  output: string;
  duration: number;
  screenshots: string[];  // base64 data URIs
  errors: string[];
}

// --- Helpers ---

function getDocContent(doc: Y.Doc): string {
  return doc.getText("tests").toString();
}

function setDocContent(doc: Y.Doc, content: string) {
  const text = doc.getText("tests");
  doc.transact(() => {
    text.delete(0, text.length);
    text.insert(0, content);
  });
}

// --- Machine ---

export const machine = setup({
  actors: {
    aiGenerateTests: fromA2AEventStream({ temperature: 0.3 }),
    aiFixTests: fromA2AEventStream({ temperature: 0.2 }),
    runTest: fromPromise(async ({ input }: { input: { testCode: string } }) => {
      const { writeFile, unlink, mkdir } = await import("fs/promises");
      const { execSync } = await import("child_process");
      const { join } = await import("path");
      const { readFileSync, existsSync, readdirSync } = await import("fs");

      const tmpDir = "/tmp/pw-tests";
      await mkdir(tmpDir, { recursive: true });
      const testFile = join(tmpDir, "test.spec.mjs");
      await writeFile(testFile, input.testCode);

      const result: TestResult = {
        passed: false,
        output: "",
        duration: 0,
        screenshots: [],
        errors: [],
      };

      const start = Date.now();
      try {
        const output = execSync(
          `npx playwright test ${testFile} --reporter=line 2>&1`,
          { timeout: 90000, encoding: "utf-8", cwd: tmpDir }
        );
        result.passed = true;
        result.output = output;
      } catch (e: any) {
        result.output = e.stdout || e.stderr || e.message || String(e);
        result.errors = [result.output.substring(0, 2000)];
      }
      result.duration = Date.now() - start;

      // Collect screenshots
      const ssDir = join(tmpDir, "test-results");
      if (existsSync(ssDir)) {
        try {
          const findPngs = (dir: string): string[] => {
            const files: string[] = [];
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
              const full = join(dir, entry.name);
              if (entry.isDirectory()) files.push(...findPngs(full));
              else if (entry.name.endsWith('.png')) files.push(full);
            }
            return files;
          };
          for (const f of findPngs(ssDir).slice(0, 5)) {
            const data = readFileSync(f);
            result.screenshots.push(`data:image/png;base64,${data.toString("base64")}`);
          }
        } catch {}
      }

      try { await unlink(testFile); } catch {}
      return result;
    }),
  },
  types: {
    input: {} as { doc?: Y.Doc; workflow?: string },
    context: {} as {
      doc: Y.Doc;
      hocuspocus: HocuspocusProvider;
      scenario: string;
      testCode: string;
      results: TestResult[];
      currentResult: TestResult | null;
      retries: number;
      maxRetries: number;
      status: "idle" | "generating" | "running" | "fixing" | "passed" | "failed";
    },
  },
}).createMachine({
  initial: "idle",
  context: ({ input }) => {
    const doc = input?.doc || new Y.Doc();
    const text = doc.getText("code");
    if (text.length === 0) {
      text.insert(0, `// Playwright Test Agent - describe scenarios, AI generates & runs tests
// Press Ctrl+Enter to generate and run tests from @test: comments
//
// Target app: https://0210498507.eu12.sapdas-dev.cloud.sap/new/buildcreds
// Credentials: opencode@pyzlo.com / openCODE1!

// @test: Navigate to https://0210498507.eu12.sapdas-dev.cloud.sap/new/buildcreds
//   Login with email "opencode@pyzlo.com" and password "openCODE1!"
//   Verify successful login by checking the page loads after auth
//   Take a screenshot of the dashboard/main page
`);
    }

    // Connect server-side to Hocuspocus for Yjs sync
    // The doc name matches what the browser connects to: pw-${workflow}
    const docName = `pw-${input?.workflow || 'default'}`;
    const hocuspocus = new HocuspocusProvider({
      url: HOCUSPOCUS_URL,
      name: docName,
      document: doc,
      onConnect() {
        // Set awareness as AI agent - browser will see cursor
        hocuspocus.setAwarenessField('user', {
          name: 'AI Agent',
          color: '#a855f7',
          colorLight: '#a855f720',
        });
      },
    });

    return {
      doc,
      hocuspocus,
      scenario: "",
      testCode: "",
      results: [],
      currentResult: null,
      retries: 0,
      maxRetries: 3,
      status: "idle" as const,
    };
  },

  entry: [
    emit(({ context }) => ({
      type: "editor-init",
      event: "editor-init",
      data: JSON.stringify({ content: getDocContent(context.doc) }),
    })),
    emit(() => ({
      type: "status",
      event: "status",
      data: `<span class="text-green-500">● idle</span> — Describe a test scenario and press Ctrl+Enter`,
    })),
  ],

  states: {
    idle: {
      entry: assign({ status: () => "idle" as const }),
      on: {
        run: {
          target: "generating",
          actions: assign({
            scenario: ({ event }) => (event as any).scenario || "",
            retries: () => 0,
            results: () => [],
            testCode: () => "",
          }),
        },
      },
    },

    generating: {
      entry: [
        assign({ status: () => "generating" as const }),
        emit(({ context }) => ({
          type: "status",
          event: "status",
          data: `<span class="text-blue-500">● generating</span> — Creating Playwright test...`,
        })),
        emit(() => ({
          type: "report",
          event: "report",
          data: `<div class="p-3 bg-blue-900/30 rounded text-blue-300 text-xs font-mono">Generating test code...</div>`,
        })),
      ],
      invoke: {
        src: "aiGenerateTests",
        id: "gen",
        onError: {
          target: "idle",
          actions: emit(({ event }) => ({
            type: "status",
            event: "status",
            data: `<span class="text-red-500">● error</span> — ${(event as any).error?.message || 'Generation failed'}`,
          })),
        },
        input: ({ context: { scenario } }) => ({
          prompt: `Generate a Playwright test for this scenario:\n\n${scenario}\n\nOutput ONLY the test code. Use @playwright/test with test() and expect(). Include proper waits and assertions. Use headless: true.`,
          system: `You are a Playwright test expert. Generate complete, runnable Playwright test files. Use ES module imports. Include proper error handling and timeouts. Output ONLY code, no markdown fences. The test should be self-contained and executable with "npx playwright test".`,
        }),
      },
      on: {
        "text-delta": {
          actions: [
            assign({
              testCode: ({ context, event }) => context.testCode + ((event as any).textDelta || ""),
            }),
            // Send just the delta - browser appends it (fast!)
            emit(({ context, event }) => {
              const delta = (event as any).textDelta || "";
              // On first delta, clear editor
              if (context.testCode.length === 0) {
                return { type: "editor-clear", event: "editor-clear", data: "" };
              }
              return { type: "editor-delta", event: "editor-delta", data: delta };
            }),
          ],
        },
        output: {
          target: "running",
          actions: [
            assign({
              testCode: ({ context, event }) => {
                const output = (event as any).output || context.testCode;
                const clean = output.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
                // Also write to Yjs for persistence
                const text = context.doc.getText("code");
                context.doc.transact(() => {
                  text.delete(0, text.length);
                  text.insert(0, clean);
                });
                return clean;
              },
            }),
            emit(({ context }) => ({
              type: "editor-done",
              event: "editor-done",
              data: JSON.stringify({ content: context.testCode }),
            })),
          ],
        },
      },
    },

    running: {
      entry: [
        assign({ status: () => "running" as const }),
        emit(({ context }) => ({
          type: "status",
          event: "status",
          data: `<span class="text-yellow-500">● running</span> — Executing test (attempt ${context.retries + 1}/${context.maxRetries})...`,
        })),
        emit(() => ({
          type: "report",
          event: "report",
          data: `<div class="p-3 bg-yellow-900/30 rounded text-yellow-300 text-xs font-mono animate-pulse">Running Playwright test...</div>`,
        })),
      ],
      // Execute the test via fetch to a test runner endpoint
      invoke: {
        src: "runTest",
        id: "runner",
        input: ({ context }) => ({ testCode: context.testCode }),
        onDone: [
          {
            guard: ({ event }) => (event as any).output?.passed === true,
            target: "passed",
            actions: assign({
              currentResult: ({ event }) => (event as any).output,
              results: ({ context, event }) => [...context.results, (event as any).output],
            }),
          },
          {
            guard: ({ context }) => context.retries >= context.maxRetries - 1,
            target: "failed",
            actions: assign({
              currentResult: ({ event }) => (event as any).output,
              results: ({ context, event }) => [...context.results, (event as any).output],
            }),
          },
          {
            target: "fixing",
            actions: assign({
              currentResult: ({ event }) => (event as any).output,
              results: ({ context, event }) => [...context.results, (event as any).output],
              retries: ({ context }) => context.retries + 1,
            }),
          },
        ],
        onError: {
          target: "fixing",
          actions: assign({
            currentResult: () => ({ passed: false, output: "Execution error", duration: 0, screenshots: [], errors: ["Failed to execute test"] }),
            retries: ({ context }) => context.retries + 1,
          }),
        },
      },
    },

    fixing: {
      entry: [
        assign({ status: () => "fixing" as const, testCode: () => "" }),
        emit(({ context }) => ({
          type: "status",
          event: "status",
          data: `<span class="text-orange-500">● fixing</span> — Analyzing failure, attempt ${context.retries}/${context.maxRetries}...`,
        })),
        emit(({ context }) => ({
          type: "report",
          event: "report",
          data: `<div class="p-3 bg-red-900/30 rounded text-red-300 text-xs font-mono mb-2"><strong>Test Failed:</strong><br/>${(context.currentResult?.errors || []).join('<br/>').substring(0, 500)}</div><div class="p-3 bg-orange-900/30 rounded text-orange-300 text-xs font-mono">AI is fixing the test...</div>`,
        })),
      ],
      invoke: {
        src: "aiFixTests",
        id: "fix",
        onError: {
          target: "idle",
          actions: emit(() => ({
            type: "status",
            event: "status",
            data: `<span class="text-red-500">● error</span> — Fix generation failed`,
          })),
        },
        input: ({ context: { testCode, currentResult, scenario } }) => ({
          prompt: `Fix this failing Playwright test.\n\nOriginal scenario: ${scenario}\n\nCurrent test code:\n\`\`\`\n${testCode}\n\`\`\`\n\nError output:\n${currentResult?.errors?.join('\n') || currentResult?.output || 'Unknown error'}\n\nOutput ONLY the fixed complete test code. No explanations.`,
          system: `You are a Playwright debugging expert. Fix the failing test. Common issues: wrong selectors, missing waits, timeout too short, incorrect assertions. Output ONLY the complete fixed test code.`,
        }),
      },
      on: {
        "text-delta": {
          actions: [
            assign({
              testCode: ({ context, event }) => context.testCode + ((event as any).textDelta || ""),
            }),
            emit(({ context, event }) => {
              const delta = (event as any).textDelta || "";
              if (context.testCode.length === 0) {
                return { type: "editor-clear", event: "editor-clear", data: "" };
              }
              return { type: "editor-delta", event: "editor-delta", data: delta };
            }),
          ],
        },
        output: {
          target: "running",
          actions: [
            assign({
              testCode: ({ context, event }) => {
                const output = (event as any).output || context.testCode;
                const clean = output.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
                const text = context.doc.getText("code");
                context.doc.transact(() => {
                  text.delete(0, text.length);
                  text.insert(0, clean);
                });
                return clean;
              },
            }),
            emit(({ context }) => ({
              type: "editor-done",
              event: "editor-done",
              data: JSON.stringify({ content: context.testCode }),
            })),
          ],
        },
      },
    },

    passed: {
      entry: [
        assign({ status: () => "passed" as const }),
        emit(({ context }) => ({
          type: "status",
          event: "status",
          data: `<span class="text-green-500">● passed</span> — All assertions passed (${context.retries + 1} attempt${context.retries > 0 ? 's' : ''})`,
        })),
        emit(({ context }) => {
          const r = context.currentResult;
          const screenshotHtml = r?.screenshots?.length
            ? r.screenshots.map((s, i) => `<img src="${s}" class="rounded border border-gray-700 max-w-full mb-2" alt="Screenshot ${i + 1}" />`).join('')
            : '';
          return {
            type: "report",
            event: "report",
            data: `<div class="space-y-2"><div class="p-3 bg-green-900/30 rounded text-green-300 text-xs font-mono"><strong>✓ PASSED</strong> (${r?.duration || 0}ms)</div>${screenshotHtml}<pre class="p-2 bg-gray-800 rounded text-[10px] text-gray-400 overflow-auto max-h-40">${(r?.output || '').substring(0, 1000)}</pre></div>`,
          };
        }),
      ],
      on: {
        run: {
          target: "generating",
          actions: assign({
            scenario: ({ event }) => (event as any).scenario || "",
            retries: () => 0,
            testCode: () => "",
          }),
        },
      },
    },

    failed: {
      entry: [
        assign({ status: () => "failed" as const }),
        emit(({ context }) => ({
          type: "status",
          event: "status",
          data: `<span class="text-red-500">● failed</span> — Max retries (${context.maxRetries}) reached`,
        })),
        emit(({ context }) => {
          const r = context.currentResult;
          const screenshotHtml = r?.screenshots?.length
            ? r.screenshots.map((s, i) => `<img src="${s}" class="rounded border border-gray-700 max-w-full mb-2" alt="Screenshot ${i + 1}" />`).join('')
            : '';
          return {
            type: "report",
            event: "report",
            data: `<div class="space-y-2"><div class="p-3 bg-red-900/30 rounded text-red-300 text-xs font-mono"><strong>✗ FAILED</strong> after ${context.maxRetries} attempts</div>${screenshotHtml}<pre class="p-2 bg-gray-800 rounded text-[10px] text-red-400 overflow-auto max-h-60">${(r?.output || '').substring(0, 2000)}</pre></div>`,
          };
        }),
      ],
      on: {
        run: {
          target: "generating",
          actions: assign({
            scenario: ({ event }) => (event as any).scenario || "",
            retries: () => 0,
            testCode: () => "",
          }),
        },
      },
    },
  },
});
