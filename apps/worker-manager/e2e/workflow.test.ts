import { assertEquals } from "https://deno.land/std/assert/mod.ts";
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';

Deno.test('Worker Manager E2E', async (t) => {
  // Setup test Yjs document
  const doc = new Y.Doc();
  const provider = new HocuspocusProvider({
    url: 'ws://localhost:1234',
    name: 'test-room',
    document: doc
  });

  // Get worker maps
  const workers = doc.getMap('workers');
  const workerStatus = doc.getMap('worker-status');

  // Test worker creation
  await t.step('create and run worker', async () => {
    // Add new worker config
    workers.set('test-worker', {
      id: 'test-worker',
      sourceCode: `
        console.log('Worker started');
        // Simulate some work
        setInterval(() => {
          console.log('Worker running...');
        }, 1000);
      `,
      runtime: 'deno'
    });

    // Wait for worker to start
    await new Promise(r => setTimeout(r, 1000));

    // Verify worker status
    const status = workerStatus.get('test-worker');
    assertEquals(status.status, 'running');
  });

  // Test worker update
  await t.step('update worker code', async () => {
    workers.set('test-worker', {
      id: 'test-worker',
      sourceCode: `
        console.log('Updated worker started');
        // Different work simulation
        setInterval(() => {
          console.log('Updated worker running...');
        }, 1000);
      `,
      runtime: 'deno'
    });

    // Wait for worker to restart
    await new Promise(r => setTimeout(r, 1000));

    // Verify worker status after update
    const status = workerStatus.get('test-worker');
    assertEquals(status.status, 'running');
  });

  // Test worker deletion
  await t.step('delete worker', async () => {
    workers.delete('test-worker');

    // Wait for worker to stop
    await new Promise(r => setTimeout(r, 1000));

    // Verify worker status after deletion
    const status = workerStatus.get('test-worker');
    assertEquals(status.status, 'stopped');
  });

  // Cleanup
  provider.destroy();
});


/*
deno task test:e2e              
Task test:e2e deno test --allow-net --allow-read --allow-env e2e/
Warning Implicitly using latest version (0.224.0) for https://deno.land/std/assert/mod.ts
Check file:///Users/I347305/Src/sap-ai/apps/worker-manager/e2e/workflow.test.ts
error: TS18046 [ERROR]: 'status' is of type 'unknown'.
    assertEquals(status.status, 'running');
                 ~~~~~~
    at file:///Users/I347305/Src/sap-ai/apps/worker-manager/e2e/workflow.test.ts:38:18

TS18046 [ERROR]: 'status' is of type 'unknown'.
    assertEquals(status.status, 'running');
                 ~~~~~~
    at file:///Users/I347305/Src/sap-ai/apps/worker-manager/e2e/workflow.test.ts:60:18

TS18046 [ERROR]: 'status' is of type 'unknown'.
    assertEquals(status.status, 'stopped');
                 ~~~~~~
    at file:///Users/I347305/Src/sap-ai/apps/worker-manager/e2e/workflow.test.ts:72:18

Found 3 errors.
➜  worker-manager git:(restruct) ✗ deno task test:e2e --no-check
Task test:e2e deno test --allow-net --allow-read --allow-env e2e/ "--no-check"
running 1 test from ./e2e/workflow.test.ts
Worker Manager E2E ...
  create and run worker ... FAILED (1s)
  update worker code ... FAILED (1s)
  delete worker ... FAILED (1s)
Worker Manager E2E ... FAILED (due to 3 failed steps) (3s)

 ERRORS 

Worker Manager E2E ... create and run worker => ./e2e/workflow.test.ts:19:11
error: TypeError: Cannot read properties of undefined (reading 'status')
    assertEquals(status.status, 'running');
                        ^
    at file:///Users/I347305/Src/sap-ai/apps/worker-manager/e2e/workflow.test.ts:38:25
    at eventLoopTick (ext:core/01_core.js:214:9)
    at async innerWrapped (ext:cli/40_test.js:191:5)
    at async exitSanitizer (ext:cli/40_test.js:107:27)
    at async Object.outerWrapped [as fn] (ext:cli/40_test.js:134:14)
    at async TestContext.step (ext:cli/40_test.js:492:22)
    at async file:///Users/I347305/Src/sap-ai/apps/worker-manager/e2e/workflow.test.ts:19:3

Worker Manager E2E ... update worker code => ./e2e/workflow.test.ts:42:11
error: TypeError: Cannot read properties of undefined (reading 'status')
    assertEquals(status.status, 'running');
                        ^
    at file:///Users/I347305/Src/sap-ai/apps/worker-manager/e2e/workflow.test.ts:60:25
    at eventLoopTick (ext:core/01_core.js:214:9)
    at async innerWrapped (ext:cli/40_test.js:191:5)
    at async exitSanitizer (ext:cli/40_test.js:107:27)
    at async Object.outerWrapped [as fn] (ext:cli/40_test.js:134:14)
    at async TestContext.step (ext:cli/40_test.js:492:22)
    at async file:///Users/I347305/Src/sap-ai/apps/worker-manager/e2e/workflow.test.ts:42:3

Worker Manager E2E ... delete worker => ./e2e/workflow.test.ts:64:11
error: TypeError: Cannot read properties of undefined (reading 'status')
    assertEquals(status.status, 'stopped');
                        ^
    at file:///Users/I347305/Src/sap-ai/apps/worker-manager/e2e/workflow.test.ts:72:25
    at eventLoopTick (ext:core/01_core.js:214:9)
    at async innerWrapped (ext:cli/40_test.js:191:5)
    at async exitSanitizer (ext:cli/40_test.js:107:27)
    at async Object.outerWrapped [as fn] (ext:cli/40_test.js:134:14)
    at async TestContext.step (ext:cli/40_test.js:492:22)
    at async file:///Users/I347305/Src/sap-ai/apps/worker-manager/e2e/workflow.test.ts:64:3

 FAILURES 

Worker Manager E2E ... create and run worker => ./e2e/workflow.test.ts:19:11
Worker Manager E2E ... update worker code => ./e2e/workflow.test.ts:42:11
Worker Manager E2E ... delete worker => ./e2e/workflow.test.ts:64:11

FAILED | 0 passed | 1 failed (3 steps) (3s)

error: Test failed
*/