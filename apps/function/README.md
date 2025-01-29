# SAP AI Function Module

## Overview
The Function module is a sophisticated TypeScript/Deno-based framework for building dynamic, AI-powered, and collaborative applications. It leverages cutting-edge technologies like XState, Yjs, and AI streaming to create flexible and interactive systems.

## Key Components

### 1. Virtual Machine (VM) Capabilities
Located in `vm/` directory, provides a revolutionary approach to agent creation:

#### Core VM Philosophy
The VM is designed to be a **flexible, framework-agnostic environment** for creating agents. Key features include:
- **Framework-Independent**: Agents can be created using any state management approach
- **Event Publishing**: Unified mechanism to publish events to Yjs
- **Sandboxed Execution**: Safe and isolated runtime environments

#### Agent Creation Flexibility
Agents can be created using:
- XState
- Custom state machines
- Vanilla JavaScript/TypeScript
- Any framework that can publish events

**Key Requirement**: Ability to publish events to Yjs document

#### Example of Flexible Agent Creation
```typescript
// XState-based Agent
const xstateMachine = createMachine({...});

// Custom Agent without XState
class CustomAgent {
  constructor(ydoc) {
    this.doc = ydoc;
  }

  publishEvent(event) {
    // Publish event directly to Yjs document
    const yArray = this.doc.getArray('events');
    yArray.push([event]);
  }
}

// Both can be used in the VM ecosystem
```

#### Key VM Scripts
- `deno-http-workers.ts`: HTTP worker management
- `example-vm.ts`: Comprehensive VM example demonstrating agent flexibility
- `http-deno-vm.ts`: HTTP-based virtual machine implementation

### 2. Streaming Infrastructure
Located in `stream/` directory, offers advanced streaming capabilities:
- Event-based streaming
- AI model integration
- XState actor support

### 3. Provider Management
Located in `provider/` directory, handles:
- Document and state synchronization
- Collaborative editing support

### 4. Inspection and Logging
Located in `inspect/` directory, provides:
- Detailed logging
- Service state inspection

### 5. Examples
Located in `examples/` directory, demonstrates:
- Various use cases
- Integration patterns
- Code generation techniques

## Core Technologies
- Deno
- XState
- Yjs (Collaborative Editing)
- Azure OpenAI
- TypeScript
- Server-Sent Events (SSE)

## Key Features
- Dynamic AI-powered code generation
- Collaborative state management
- Extensible virtual machine
- Advanced streaming capabilities
- Cross-platform compatibility

## Example: Dynamic Agent Creation
```typescript
import { createMachine, assign, emit } from "xstate";

export default createMachine({
  id: 'emit-example',
  initial: 'emit', 
  context: { index: 0 },
  states: {
    emit: {
      entry: assign({
        index: ({context: {index}}) => index + 1
      }),
      after: {
        1000: {
          target: 'emit',
          reenter: true,
          actions: emit(({context: {index}}) => ({
            type: 'EMIT',
            data: index,
            event: 'emit'
          }))
        }
      },
    }
  }
})
```

## Prerequisites
- Deno 1.40+
- Node.js (for some dependencies)
- Azure OpenAI API Key (optional)

## Installation
```bash
# Ensure Deno is installed
deno install --allow-net --allow-read --allow-write

# Run main application
deno run --allow-all main.ts
```

## Configuration
Create a `.env` file or use command-line flags for configuration:
```bash
deno run main.ts --url=https://example.com --room=my-room
```

## Contributing
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License
ISC License

## Future Roadmap
- Enhanced AI integration
- More robust VM sandboxing
- Expanded streaming capabilities
- Cross-platform deployment tools
