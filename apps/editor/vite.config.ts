import { defineConfig } from 'vite';

export default defineConfig({
  envPrefix: ['VITE_', "ROOM", "YJS_URL"],
  build: {
    lib: {
      entry: 'src/typescript-editor.ts',
      name: 'TypeScriptEditor',
      formats: ['es'],
      fileName: 'typescript-editor'
    },
    
    rollupOptions: {
      external: [
        '@codemirror/autocomplete',
        '@codemirror/lang-javascript',
        '@codemirror/lint',
        '@codemirror/view',
        '@typescript/vfs',
        '@valtown/codemirror-ts',
        'codemirror',
        'comlink'
      ]
    }
  }
});