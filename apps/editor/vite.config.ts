import { defineConfig } from 'vite';
import { comlink } from "vite-plugin-comlink";

export default defineConfig({
  envPrefix: ['VITE_', "YJS_"],
  plugins: [comlink()],

  worker: {
    plugins: () => [comlink()],

  },
  esbuild: {
    keepNames: true,
    treeShaking: true,
  },

  build: {
    
    target: 'es2022',
    lib: {
      entry: [
        'src/index.ts',
        'src/worker.ts',
        'src/collab.ts',
        'src/copilot.ts',
        'src/styles.ts',
          "index.html"
      ],
      name: 'TypeScriptEditor',
      formats: ['es'],

    },

    rollupOptions: {
      shimMissingExports: true,
      treeshake: "recommended",
      preserveSymlinks: true,
      external: ["typescript"],
       
      output: {
        interop: 'auto',
        chunkFileNames: 'chunks/[name]-[hash].js',
        // preserveModulesRoot: 'src',preserveModules: true,
        exports: 'auto',
         compact: true,
        // entryFileNames: function (chunkInfo) {
        //     return chunkInfo. === "index" ? "index.js" : "chunks/[name]-[hash].js";
        //     }
        manualChunks:  function (id) {
          if (id.includes("node_modules")) {
             //find the package name, support nesting node_modules ../../node_modules/.pnpm/comlink@4.4.2/node_modules/comlink/dist/esm/comlink.mjs
             const packageName = id.match(/.*node_modules\/(@?[^\/]*)/)[1];
             return `vendor-${packageName}`;   
          }
        }
          

      }
    }
  }
});