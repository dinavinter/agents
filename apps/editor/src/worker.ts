import {
  createDefaultMapFromCDN,
  createSystem,
  createVirtualTypeScriptEnvironment, VirtualTypeScriptEnvironment,
} from '@typescript/vfs';
import { createWorker } from '@valtown/codemirror-ts/worker';
import * as Comlink from 'comlink';
import * as ts from 'typescript';
import { setupTypeAcquisition } from '@cxai/ata';

console.log('here');

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
    projectName: 'My ATA Project',
    typescript: ts,
    logger: console,
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

  console.log('here');

  return {
    env,

    onFileUpdated(_env:VirtualTypeScriptEnvironment, _path:string, code:string) {
      ata(code);
    },
  };
}
const worker = createWorker(createTSEnv());

Comlink.expose(worker);
