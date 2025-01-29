# Worker Manager App

A standalone app that manages dynamic worker creation and lifecycle using Yjs for synchronization.

## Features
- Dynamic worker creation and management
- Real-time worker status monitoring
- Multiple runtime support (Deno, Node, Browser)
- Health checks and metrics
- Yjs-based synchronization

## Usage

1. Start the Hocuspocus server (required for Yjs sync)

2. Run the worker manager:
```bash
deno task dev
```

3. Run E2E tests:
```bash
deno task test:e2e
```

## Environment Variables
- `HOCUSPOCUS_URL`: WebSocket URL for Hocuspocus server (default: ws://localhost:1234)
- `ROOM_NAME`: Room name for Yjs sync (default: worker-manager)

## Example: Creating a Worker

```typescript
// Connect to the same Yjs document
const doc = new Y.Doc();
const provider = new HocuspocusProvider({
  url: 'ws://localhost:1234',
  name: 'worker-manager',
  document: doc
});

// Get the workers map
const workers = doc.getMap('workers');

// Add a new worker
workers.set('my-worker', {
  id: 'my-worker',
  sourceCode: `
    console.log('Worker started');
    // Your worker code here
  `,
  runtime: 'deno'
});

// Monitor worker status
const workerStatus = doc.getMap('worker-status');
workerStatus.observe(event => {
  console.log('Worker status:', workerStatus.get('my-worker'));
});
```
