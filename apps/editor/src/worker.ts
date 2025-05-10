import {
  createDefaultMapFromCDN,
  createSystem,
  createVirtualTypeScriptEnvironment, VirtualTypeScriptEnvironment,
} from '@typescript/vfs';
import { createWorker } from '@valtown/codemirror-ts/worker';
import * as Comlink from 'comlink';
import * as ts from 'typescript';
import { setupTypeAcquisition } from '@cxai/ata';


async function createTSEnv() {
  const fsMap = await createDefaultMapFromCDN(
    { target: ts.ScriptTarget.ES2022 },
    ts.version,
    false,
    ts
  );
  const system = createSystem(fsMap);

  const env = createVirtualTypeScriptEnvironment(system, [], ts, {
    lib: ['ES2022'],
  });

  const ata = setupTypeAcquisition({
    projectName: 'CM ATA Project',
    typescript: ts,
    logger: console,
    fetcher: (input: RequestInfo | URL, init?: RequestInit | undefined) => {
      console.log('fetcher', input, init);
      const url = typeof input === 'string' ? input :  "url" in input ? input.url : input.toString()
      const uri =  new URL(url)
      console.log('fetcher',uri, input);

      switch (uri.protocol) {
        case "jsr:":
        case "npm:": 
          uri.host = "esm.sh"
          uri.protocol = "https:"
          uri.searchParams.set("target", uri.searchParams.get("target") ?? "deno")
          break;
        case "deno:":
          uri.host = "deno.land"
          uri.protocol = "https:"
       } 
       return fetch(uri.toString(), init);

    },
    delegate: {
      receivedFile: (code: string, path: string) => {
        env.createFile(path, code);
        // Add code to your runtime at the path...
      },
      started: () => {
        console.log('ATA start');
      },
      progress: (downloaded: number, total: number) => {
        console.log(`Got ${downloaded} out of ${total}`);
      },
      finished: (vfs) => {
        console.log('ATA done', vfs);
      },
     
    },
  });


  return {
    env,

    onFileUpdated(_env:VirtualTypeScriptEnvironment, _path:string, code:string) {
      ata(code);
    },
  };
}
const worker = createWorker(createTSEnv());

Comlink.expose(worker);
