# SAP AI Project Documentation

## Project Overview

This project is a comprehensive AI agent framework built using modern web technologies, focusing on state management, AI integration, and interactive user interfaces. The project leverages several key technologies:

- **State Management**: [xstate](https://github.com/statelyai/xstate)
- **Web Framework**: [Fastify](https://fastify.dev/)
- **UI Rendering**: [HTMX](https://htmx.org/)
- **AI Integration**: OpenAI, Azure OpenAI

## Project Structure

### Main Directories
- `apps/`: Contains different application modules
  - `agent/`: AI agent implementations
  - `editor/`: Editor-related components
  - `fastify/`: Fastify server configurations
  - `function/`: Utility and function-based modules
  - `hocuspocus/`: Collaborative editing components
  - `logger/`: Logging utilities

### Key Technologies and Patterns

#### 1. State Management with XState
- Each agent is implemented as a state machine
- Supports complex state transitions and asynchronous tasks
- Provides a clear, structured approach to managing agent behavior

#### 2. AI Integration
Supported AI Services:
- OpenAI (GPT-4o)
- Azure OpenAI
- Pinecone (for semantic search)

#### 3. UI Rendering
- Server-Side Rendering with HTMX
- Server-Sent Events (SSE) for dynamic updates
- Modular component-based architecture

## Agents Catalog

### 1. Simple Agent
- Generates thoughts and doodles
- Demonstrates basic xstate and AI integration

### 2. Parallel Agent
- Handles multiple asynchronous tasks concurrently
- Showcases advanced state management

### 3. Screen Set Builder
- Assists developers in creating application forms
- Generates screen drafts with fields and CSS styling

### 4. Support Agent
- Customer support representative simulation
- Issue classification and routing

### 5. Tic Tac Toe Agent
- AI-powered game agent
- Demonstrates game state management

### 6. Test Agent
- Generates API tests
- Integrates with Azure OpenAI

### 7. GitHub Agent
- Analyzes tests from GitHub repositories
- Demonstrates API integration

### 8. Pinecone Agent
- Performs semantic searches
- Uses AI embeddings and vector database

## Getting Started

### Prerequisites
- Node.js
- pnpm

### Installation
```bash
npm install -g pnpm
pnpm install
```

### Running the Project
```bash
pnpm dev
```

Access agents at:
- Simple Agent: http://localhost:5002/simple
- Parallel Agent: http://localhost:5002/parallel
- Screen Set Builder: http://localhost:5002/screen
- Support Agent: http://localhost:5002/support
- Tic Tac Toe Agent: http://localhost:5002/tictac
- Test Agent: http://localhost:5002/test
- GitHub Agent: http://localhost:5002/git
- Pinecone Agent: http://localhost:5002/pinecone

## Environment Configuration
Create a `.env` file in the project root with the following variables:
- OpenAI API Key
- Azure OpenAI Credentials
- Pinecone API Key
- Other service-specific configurations

## Contributing
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License
[Include License Information]

## Contact
[Include Contact Information]
