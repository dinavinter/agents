import { createMachine, assign, createActor ,AnyEventObject, waitFor} from 'xstate';
import { DenoWorker } from 'npm:deno-vm';

type WorkerContext = {
  code: any;
  worker?: DenoWorker;
  events: any[];
  error?: string ;
};

type WorkerEvent =
  | { type: 'RECEIVE_NEW_CODE'; code: string }
  | { type: 'WORKER_READY' }
  | { type: 'WORKER_ERROR'; error: string }
  | { type: 'WORKER_EVENT';  [key: string]: any}
  | { type: 'STOP_WORKER' }
  | AnyEventObject;

export const workerMachine =
  createMachine({
    id: 'apiWorker',
    types: {} as {
      input: WorkerContext["code"];
      context: WorkerContext;
      events: WorkerEvent;
    },
    context: ({ input }) =>  ({
      events: [],
      code: input ?? `   self.onmessage = async (event) => {
              const { type, ...data } = event;
              
              try {
                self.postMessage({ type: 'event', data: { type, result: data }});
              } catch (error) {
                self.postMessage({ type: 'error', data: error.message });
              }
            };`
   
    }),
    initial: 'idle',
    states: {
      idle: {
        on: {
          RECEIVE_NEW_CODE: {
            target: 'initializingWorker',
            actions: assign({
              code: ({ event:{code} }) => code,
            }),
          },
        },
      },
      initializingWorker: {
        entry: {
          type: 'createWorker',
        },
        on: {
          WORKER_READY: 'running',
          WORKER_ERROR: {
            target: 'failed',
            actions: assign({
              error: ({ event }) => event.error,
            }),
          },
        },
      },
      running: {
        on: {
          WORKER_EVENT: {
            actions: assign({
              events: ({ context, event }) => [...context.events, event],
            }),
          },
         
          STOP_WORKER: 'stopping',

          "*": {
            actions:  ({ event, context:{worker} }) => {
              worker.postMessage(event);
            }
          }
        },
      },
      stopping: {
        entry: {
          type: 'destroyWorker',
        },
        always: 'stopped',
      },
      stopped: {
        on:{
          "START_WORKER":{
            target: 'initializingWorker',
          }
        }
      },
      failed: {
        on: {
          RECEIVE_NEW_CODE: {
            target: 'initializingWorker',
            actions: assign({
              code: ({ event:{code} }) => code,
              error: () => undefined,
            }),
          },
        },
      },
    },
  }).provide({
    actions: {
      createWorker: async ({ context, self }) => {
        try {
          const worker = new DenoWorker({
            permissions: {
              net: true,
              read: true,
              env: true,
              write: true,
              import: true,
              run: true

            },
          });

          const workerScript = `${context.code}`;

          await worker.run(workerScript);
          self.send({ type: 'WORKER_READY' });
          return worker;
        } catch (error) {
          self.send({ type: 'WORKER_ERROR', error: error.message });
        }
      },
      destroyWorker: ({ context }) => {
        if (context.worker) {
          context.worker.terminate();
        }
      },
    },
  });


  export default workerMachine;
// Example usage:
const actor = createActor(workerMachine,{
  inspect:{
    next: e=> console.log(e.type),
    error: console.error,
    complete: () => console.log('Done!'),
  }
});

actor.subscribe((state) => {
   console.log('Current state:', state.value);
  console.log('Events:', state.context.events);
});

actor.start();

actor.send({ type: 'some_event', data: 'some data 1' });
actor.send({ type: 'some_event', data: 'some data 2' });

actor.send({ type: 'STOP_WORKER' });

actor.send({ type: 'some_event', data: 'some data 3' });



Deno.serve(async (req) => {
  actor.send({ type: 'swd', code: 'data req' });
   return new Response(JSON.stringify({
     events:actor.getPersistedSnapshot().context.events,
     snapshot:actor.getPersistedSnapshot(),
   },null,2));

});
