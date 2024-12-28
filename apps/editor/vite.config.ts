import { defineConfig } from 'vite';
import { comlink } from "vite-plugin-comlink";

export default defineConfig({
  envPrefix: ['VITE_', "YJS_"],
  plugins: [comlink()],

  worker:{
    plugins: () => [comlink()],
   
  },
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'TypeScriptEditor',
      formats: ['es', "cjs", "iife",'umd' ],
       
    },
    
    rollupOptions: {
         shimMissingExports:true,
         treeshake:"recommended"
    }
  }
});