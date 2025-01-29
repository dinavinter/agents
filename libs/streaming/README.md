# @cxai/stream - Streaming Library

## Overview
`@cxai/stream` is a powerful TypeScript streaming library designed for advanced streaming capabilities, with a focus on AI-driven applications, state management, and real-time data processing.

## Features
- AI Streaming Support
- XState Integration
- Server-Sent Events (SSE)
- Async Iterator Utilities
- Yjs Collaborative Editing Support
- Observable Actors
- UI Rendering Helpers

## Installation
```bash
npm install @cxai/stream
```

## Prerequisites
- Node.js 22.8.0+
- Optional Peer Dependencies:
  - `yjs`
  - `openai`

## Core Modules

### AI Streaming
Stream text and objects from AI models with advanced configuration options.

```typescript
import { streamText } from '@cxai/stream/ai';

const result = await streamText({
  model: openaiGP4o(),
  prompt: "Generate a creative idea"
});
```

### XState Integration
Create observable actors and manage complex state transitions.

```typescript
import { fromAIEventStream } from '@cxai/stream/xstate';

const machine = createMachine({
  // Machine configuration with streaming support
});
```

### Async Iterator Utilities
Advanced async iterator manipulation and cloning.

```typescript
import { cloneable } from '@cxai/stream/iterator';

const clonableStream = cloneable(originalStream);
```

### Server-Sent Events
Convert async iterators to SSE-compatible streams.

```typescript
import { sseReadableStream } from '@cxai/stream/iterator/sse';

const sseStream = sseReadableStream(asyncIterator);
```

## Development
```bash
# Install dependencies
pnpm install

# Build the library
pnpm run build

# Run tests
pnpm test
```

## Technologies
- TypeScript
- XState
- Yjs
- OpenAI
- Atomico
- Server-Sent Events

## Contributing
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License
ISC License

## Peer Dependencies
- `yjs`: Collaborative editing support (optional)
- `openai`: AI model streaming (optional)
