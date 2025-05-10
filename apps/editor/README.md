# TypeScript Editor Web Component

A web component that provides a TypeScript editor with autocomplete, type checking, and syntax highlighting. Optionally supports real-time collaboration using Yjs.

## Installation

```bash
npm install @cxai/ide
```

## Usage

### Browser

```html
<script type="module">
  import '@cxai/ide';
</script>

<ts-editor value="import { createMachine } from 'xstate';" url="%YJS_URL%" room="%YJS_ROOM%" component="codemirror" > 
  
</ts-editor>

```



## Properties

### TypeScript Editor
- `value`: Get or set the editor content

### Collaboration Provider
- `url`: WebSocket URL of the Hocuspocus server
- `room`: Room name for collaboration (defaults to 'default-room'), this will be the doc id
- `component`: The component name in the yjs docm, defaults to 'codemirror'
## License

MIT

# YJS Form Components

This package provides form components that integrate with YJS for real-time collaboration.

## Installation

```bash
npm install yjs-form-components
```

## Usage

The package provides a `<yjs-text-input>` web component that can be used in any HTML form and automatically syncs with YJS.

```html
<form>
  <!-- Basic usage -->
  <yjs-text-input
    name="description"
    url="ws://localhost:1234"
    room="my-document"
    required
  ></yjs-text-input>

  <!-- With all options -->
  <yjs-text-input
    name="notes"
    url="ws://localhost:1234"
    room="my-document"
    required
    disabled
    value="Initial value"
  ></yjs-text-input>
</form>
```

### Attributes

- `url` (required): WebSocket URL for YJS collaboration
- `room` (required): Room name for YJS document
- `name`: Form field name
- `value`: Initial value
- `required`: Whether the field is required
- `disabled`: Whether the field is disabled

### Events

- `change`: Fired when the value changes (either locally or from remote updates)

### Form Integration

The component implements the [Form-Associated Custom Elements](https://html.spec.whatwg.org/multipage/custom-elements.html#form-associated-custom-elements) specification, which means it:

- Works with standard HTML forms
- Supports form validation
- Supports form reset
- Supports form submission
- Integrates with the Constraint Validation API

## Development

1. Install dependencies:
```bash
npm install
```

2. Build the package:
```bash
npm run build
```

3. Watch for changes during development:
```bash
npm run watch
```