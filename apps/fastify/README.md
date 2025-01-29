# SAP AI + Fastify Application

## Overview
A comprehensive AI-powered Fastify application that provides a flexible agent management system with advanced routing and streaming capabilities.

## Key Features
- Dynamic Agent Management
- OpenAPI Specification
- Server-Sent Events (SSE) Support
- XState Agent Workflow
- Flexible Agent Creation and Execution

## API Endpoints

### Agents Management
- `GET /agents`: List all available agents
- `POST /agents`: Create a new agent definition
- `GET /agents/{agent}`: Retrieve a specific agent's details
- `POST /agents/{agent}`: Update an agent's code
- `POST /agents/{agent}/start`: Start a specific agent
- `GET /agents/{agent}/src`: Get agent source code
- `GET /agents/{agent}/rev`: Get agent revision

### Utility Features
- `GET /sse`: Proxy Server-Sent Events
- Dynamic agent code upload and execution
- Revision and versioning support

## Agent Creation Example
```typescript
const agentDefinition = {
  id: 'emit-example',
  code: `
    createMachine({
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
          }
        }
      }
    })
  `
}
```

## Prerequisites
- Node.js 22.8.0+
- pnpm
- OpenAI API Key (optional)
- XState
- Fastify

## Installation
```bash
# Install dependencies
pnpm install

# Start the development server
pnpm dev
```

## Configuration
Create a `.env` file with the following optional configurations:
```
OPENAI_API_KEY=your_openai_api_key
AZURE_OPENAI_API_KEY=your_azure_openai_api_key
```

## Technologies
- Fastify
- XState
- OpenAI
- Server-Sent Events
- TypeScript
- HTMX

## OpenAPI Specification
A comprehensive OpenAPI 3.0.3 specification is available in `openapi.yaml`, detailing all available routes and their behaviors.

## Streaming Capabilities
- Text streaming
- AI response streaming
- Event-based streaming via SSE

## Contributing
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License
ISC License