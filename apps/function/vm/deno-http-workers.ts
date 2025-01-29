// deno-lint-ignore-file no-explicit-any

import {
  assign,
  CallbackActorLogic,
  createActor,
  emit,
  enqueueActions,
  forwardTo,
  fromCallback,
  fromPromise,
  setup,
} from "xstate";
import * as http from "node:http";
import { Buffer } from "node:buffer";
import { logger } from "../inspect/logger.ts";
import { newDenoHTTPWorker, DenoHTTPWorker } from "./http-deno-vm.ts";
// type DenoHTTPWorker = ReturnType<typeof newDenoHTTPWorker>
type UpdateEvent = { type: "@worker.update"; code: string[] };
type SpawnEvent = { type: "@worker.start"; id?: string };
type CreatedEvent = {
  type: "@worker.created";
  worker: DenoHTTPWorker;
  id: string;
};

type FetchEvent = { type: "@api.fetch"; request: string |URL; options?: http.RequestOptions; id?: string };
type TimeoutEvent = { type: "@api.timeout"; id: string; timeout: number };
type ErrorEvent = { type: "@api.error"; error: Error | unknown; id: string };
type ResponseEvent = {
  type: "@api.response";
  response: http.IncomingMessage;
  id: string;
};
type BodyEvent = { type: "@api.body"; body: string; id: string };

type VMEvent =
  | SpawnEvent
  | FetchEvent
  | TimeoutEvent
  | ErrorEvent
  | UpdateEvent
  | CreatedEvent;

type Worker = DenoHTTPWorker & { id: string };
type VMContext = {
  code: string;
  worker?: Worker;
  logs: string[];
  error?: Error | unknown;
  lastActivity: Date;
};

const denoVMMachine = setup({
  schemas: {
    input: {} as Partial<VMContext>,
    context: {} as VMContext,
    events: {} as VMEvent,
    emitted: {} as
      | ResponseEvent
      | BodyEvent
      | ErrorEvent
      | TimeoutEvent
      | CreatedEvent,
  },
  actions: {},
  guards: {},
  delays: {},
  actors: {
    spawnVM: fromPromise(async function ({ input: { code, id } }) {
      return Object.assign(
        await newDenoHTTPWorker(code, {
          printOutput: true,
          runFlags: ["--allow-net", "--allow-env", "--allow-read", "--allow-write", "--allow-run"],
        }),
        { id },
      );
    }),
    fetch: fromPromise(({ input: { request, worker, options } }: { input: {worker: Worker, request: string |URL , options: http.RequestOptions} }) => {
      return new Promise((resolve, reject) => {
         worker.request(request, options || {
           method: "GET",
         }, (resp) => {
          if (resp.statusCode >= 400) {
            return reject(resp); 
          }
          else resolve(resp);
        })
        setTimeout(() => {
          reject(new Error("timeout"))
        }, 2000)
      })
    }),
    executeRequest: fromCallback(({ emit, sendBack, receive, input: { worker, id } }) => {
      receive(async ({ request }: FetchEvent) => {
        const body = await new Promise((resolve, reject) => {
          const req = worker.request(request, {}, (resp) => {
            sendBack({ type: "@api.response", response: resp, id: id });
            const body = [] as any[];
            resp.on("error", reject);
            resp.on("data", (chunk: any) => {
              body.push(chunk);
            });
            resp.on("end", () => {
              resolve(Buffer.concat(body).toString());
              // resolve(new TextDecoder().decode(new Uint8Array(body)));
            });
          });
          req.end();
        });
        sendBack({ type: "@api.body", body, id: id });
      });
    }) satisfies CallbackActorLogic<FetchEvent, Worker, VMEvent>,
  },
}).createMachine({
  id: "denoVM",
  initial: "idle",
  types: {} as {
    input: Partial<VMContext>;
    context: VMContext;
    events: VMEvent;
    emitted:
    | ResponseEvent
    | BodyEvent
    | ErrorEvent
    | TimeoutEvent
    | CreatedEvent;
  },
  context: ({ input: { code, ...rest } }) => ({
    logs: [],
    events: [],
    lastActivity: new Date(),
    code: code ||
      `export default {
        async fetch(req: Request): Promise<Response> {
            return Response.json({ ok: req.url });
        },
    }`,
    ...rest,
  }),
  states: {
    idle: {
      on: {
        "@worker.start": {
          target: "spawning"

        },
      },
    },
    spawning: {
      invoke: {
        src: "spawnVM",
        input: ({ context, event: { id } }) => ({
          id: id ?? crypto.randomUUID(),
          ...context,
        }),
        onDone: {
          target: "running",
          actions: enqueueActions(
            ({
              enqueue,
              event: { output: worker },
              context: { worker: previousWorker, logs },
            }) => {
              enqueue.emit({
                type: "@worker.created",
                worker: worker,
                id: worker.id,
              });

              if (previousWorker) {
                previousWorker.terminate();
              }

              enqueue.assign({
                worker: worker,
                logs: [...logs, "VM spawned successfully"],
              });
            },
          ),
        },
        onError: {
          target: "error",
          actions: assign({
            error: ({ event: { error } }) => error,
            logs: ({ context, event: { error } }) => [
              ...context.logs,
              `Failed to spawn VM: ${error?.message || error}`,
            ],
          }),
        },
      },
      on: {
        "@worker.created": {
          target: "running",
          actions: [
            assign({
              worker: ({ event }) => event.worker,
              workerId: ({ event }) => event.id,
              logs: ({ context, event }) => [
                ...context.logs,
                `VM spawned successfully with ID: ${event.id}`,
              ],
            }),
          ],
        },
      },
    },
    running: {
      on: {
        "@api.fetch": {
          target: "processing",
          actions: assign({
            logs: ({ context }) => [...context.logs, "Executing request"],
            events: ({ context, event }) => [...context.events, event]
          }),
        },
        "@api.error": {
          target: "error",
          actions: assign({
            error: ({ event: { error } }) => error,
            logs: ({ context, event: { error } }) => [
              ...context.logs,
              `Error occurred: ${error || error}`,
            ],
          }),
        },
        "@api.timeout": {
          target: "error",
          actions: assign({
            error: ({ event: { timeout } }) => timeout,
            logs: ({ context, event: { timeout } }) => [
              ...context.logs,
              `Timeout occurred: ${timeout}`,
            ],
          }),
        },
      },
    },
    processing: {
      invoke: {
        src: "fetch",
        input: ({ context: { worker }, event }) => ({
          worker: worker,
          ...event,
        }),
        onDone: {
          target: "running",
          actions: assign({
            logs: ({ context, event }) => [
              ...context.logs,
              `Request completed: ${event.output}`,
            ],
          }),
        },
        onError: {
          target: "error",
          actions: assign({
            error: ({ event: { error } }) => error,
            logs: ({ context, event: { error } }) => [
              ...context.logs,
              `Request failed: ${error}`,
            ],
          }),
        },
      },
      on: {
        "@api.response": {
          target: "running",
          actions: [
            assign({
              events: ({ context, event }) => [...context.events, event],
              logs: ({ context, event }) => [...context.logs, "Response received, request id: " + event.id],
            }),
            emit(({ event }) => event)
          ],
        }
      }
    },
    error: {
      entry: ({ event: { error } }) => {
        console.error("error", error)
      },
      after: {
        5000: "idle",
      },

      on: {
        "@worker.start": {
          target: "spawning",
          actions: assign({
            error: undefined,
            logs: ({ context }) => [
              ...context.logs,
              "Attempting recovery by respawning VM",
            ],
          }),
        },
      },
    },
    terminating: {
      entry: ({ context }) => {
        if (context.worker) {
          context.worker.terminate();
        }
      },
      always: "idle",
    },
  },
});


const service = createActor(denoVMMachine, {
  input: {
    code: await Deno.readTextFile("./vm/example-vm.ts"),
  },
  inspect:{
    next: e=> {
        if(e.type ==="@xstate.event"){
          console.log(e.event)
        }
        if(e.type === "@xstate.snapshot"){
          // console.log(e.actorRef.getSnapshot().value)
        }
      },
    error: console.error,
    complete: () => console.log('Done!'),
  }

});

service.on("*", (e)=>{
  console.log("received event from actor: ", e)
    
  }
)

service.on("@worker.created", ({worker})=>{
  console.log("started" , worker.id)
  worker.onmessage = async (event) => {
     console.log("received event from worker: ", event)
 };
 
 worker.onclose = () => {
   console.log("worker closed")
 }
 worker.onexit = (event) => {
   console.log("received exit from worker: ", event)
 }

 worker.stderr.on("data", (chunk) => Deno.stderr.write(chunk))
 worker.stdout.on("data", (chunk) => Deno.stdout.write(chunk))
})
// logger(service)
 

service.send({ type: "@worker.start" })

service.start()

Deno.serve(async (req) => {
  const id = crypto.randomUUID();
  

  console.log("start ...");

  console.log("send request ...");
  service.send({ type: "@api.fetch", request: "https://hello/world?query=param", id: id });
   
  return new Response(JSON.stringify({
    events: service.getPersistedSnapshot().context.events,
    logs: service.getPersistedSnapshot().context.logs,

  }, null, 2));
});

/*
export interface DenoHTTPWorker {
  **
   * Terminate the worker. This kills the process with SIGKILL if it is still
   * running, closes the http2 connection, and deletes the socket file.
  terminate(): void;

  **
   * Gracefully shuts down the worker process and waits for any unresolved
   * promises to exit.
  shutdown(): void;

  **
   * request calls http.request but patches the options to work with our
   * connection pool and safely handle rewriting various headers.
  request(
    url: string | URL,
    options: http.RequestOptions,
    callback: (response: http.IncomingMessage) => void
  ): http.ClientRequest;

  get stdout(): Readable;

  get stderr(): Readable;

  **
   * Adds the given listener for the "exit" event.
   *
  addEventListener(type: "exit", listener: OnExitListener): void;
}

const waitResponse = new Promise<BodyEvent>((resolve, reject) => {
    const { unsubscribe } = service.on("@api.body", callback);
    function callback(event: BodyEvent) {
      if (event.id === id) {
        unsubscribe();
        resolve(event);
      }
    }
  });
*/
