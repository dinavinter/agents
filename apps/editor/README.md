# TypeScript Editor Web Component

A web component that provides a TypeScript editor with autocomplete, type checking, and syntax highlighting. Optionally supports real-time collaboration using Yjs.

## Installation

```bash
npm install @stackblitz/typescript-editor
```

## Usage

### Browser

```html
<script type="module">
  import '@stackblitz/typescript-editor';
</script>

<typescript-editor value="// Your TypeScript code here">
  <!-- Optional: Add collaboration support -->
  <collaboration-provider url="wss://your-hocuspocus-server" room="my-room" />
</typescript-editor>
```

### SSR (Server-Side Rendering)

The component is SSR-safe and will only initialize the editor in browser environments.

```jsx
import '@stackblitz/typescript-editor';

function App() {
  return (
    <typescript-editor value="// Your TypeScript code here">
      {/* Optional: Add collaboration support */}
      <collaboration-provider url="wss://your-hocuspocus-server" room="my-room" />
    </typescript-editor>
  );
}
```

## Properties

### TypeScript Editor
- `value`: Get or set the editor content

### Collaboration Provider
- `url`: WebSocket URL of the Hocuspocus server
- `room`: Room name for collaboration (defaults to 'default-room')

## License

MIT