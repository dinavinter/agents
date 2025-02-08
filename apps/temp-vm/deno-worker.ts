// deno-lint-ignore-file no-explicit-any

import {
  assign,
  createActor,
  enqueueActions,
  forwardTo,
  fromCallback,
  fromPromise,
  setup,
  toObserver,
  fromEventObservable,
  type PromiseActorLogic,
  type UnknownActorLogic,
  type CallbackActorLogic,
  type Subscribable,
  type Subscription,
  type UnknownActorRef,
  type ActorSystem,
  type ActorRef,
  type ActorLogic,
  type ObservableActorLogic,
  type ObservableActorRef,
  emit,
  AnyEventObject,
  
} from "xstate";
import * as http from "node:http";
import { Buffer } from "node:buffer";
import { logger } from "../function/inspect/logger.ts";
import { DenoWorker } from 'https://esm.sh/deno-vm?target=denonext';

type UpdateEvent = { type: "@worker.update"; code: string };
type SpawnEvent = { type: "@worker.start"; id?: string };
type CreatedEvent = {
  type: "@worker.created";
  worker: DenoWorker;
  id: string;
};

type ErrorEvent = { type: "@worker.error"; error: Error | unknown; id: string; logs:string[] };

type VMEvent =
  | SpawnEvent
  | UpdateEvent
  | CreatedEvent;

type Worker = DenoWorker & { id: string };
type VMContext = {
  code: string;
  worker?: Worker;
  logs: string[];
  error?: Error | unknown;
  lastActivity: Date;

};

const workerObservable=()=> fromEventObservable(({input:worker}:{input:Worker})=> {
  return {
    subscribe(callback): Subscription {
        const observer = toObserver(callback);
        observer.next && worker.addEventListener('message', ({data})=>observer.next &&observer.next(Object.assign(data || {},{
           type: "type" in data ? `@worker.message.${data.type}` : '@worker.message'
        })));
        observer.error && worker.addEventListener('error',observer.error);
        observer.complete && worker.addEventListener('close',observer.complete);
        return {
            unsubscribe() {
                observer.next && worker.removeEventListener('message',observer.next);
                observer.error && worker.removeEventListener('error',observer.error);
                observer.complete && worker.removeEventListener('close',observer.complete);
            }
        }
    }
};
});

type WorkerEmittedEvent =AnyEventObject

const denoVMMachine = setup({
  schemas: {
    input: {} as Partial<VMContext>,
    context: {} as VMContext,
    events: {} as VMEvent,
    emitted: {} as
      | ErrorEvent
      | CreatedEvent
      | WorkerEmittedEvent
  },
  actions: {},
  guards: {},
  delays: {},
  actors: {  
    
    spawnVM: fromPromise(async function ({ input: { code, id } }: { input: { code: string; id?: string } }) {
      const worker=new DenoWorker(code,{

        logStdout:false,
        logStderr:true, 
        denoBootstrapScriptPath:"./vm/deno/index.ts",
        denoCachedOnly: false,
        denoUnstable:true,

        permissions: {
          
          allowAll:true,
          allowEnv:true,
          allowNet:true,
          allowRun:true,
          allowRead:true,
          allowWrite:true,
          allowImport:true
        
        },
      })
        

       return Object.assign(
        worker,
        { id },
      );
    }) 
  },
}).createMachine({
  id: "denoVM",
  initial: "idle",
  types: {} as {
    input: Partial<VMContext>;
    context: VMContext;
    events: VMEvent;
    emitted:
      | ErrorEvent
      | CreatedEvent;
  },
  context: ( { input }) => ({
    logs: [],
    lastActivity: new Date(),
    code:   `   
    
    self.onmessage = async (event) => {
        const { type, data} = event;
        self.postMessage({ type: 'event', result: data }); 
    }
  
            `,
    ...input || {},
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
          actions: enqueueActions( ({ enqueue, event: { output }, context: { worker, logs },  }) => {
              enqueue.emit({
                type: "@worker.created",
                worker: output,
                id: output.id,
              });

              if (worker) {
                worker.terminate();
              }

              enqueue.assign({
                worker: output,
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
      }
      
    },
    running: {
      invoke:{
        src: fromCallback(({ input:worker, receive , sendBack}) => {

          worker.onmessage = (({ data }) => sendBack(Object.assign(data || {}, {
             type: "type" in data ? `@worker.message.${data.type}` : '@worker.message'
          })))
 
          worker.onexit = ((event) =>sendBack(Object.assign(event,{
            type: "@worker.exit"
          })))

          receive(({ event }) => {
            worker.postMessage(event);  
          })

        }),
        input:({context:{worker}})=> worker,
      },
      on: {
        "@worker.update": {
          actions: assign({
            code: ({ event: { code } }) => code,
          }),
          target: "spawning",
        },
        "@worker.stop": {
          target: "terminating",
        },
        "@worker.exit": {
          actions: emit(({event})=> event ),
          target: "idle",
        },
        "@worker.message.*":{
          actions:emit(({event})=> Object.assign(event,{
            type: event.type.replace('@worker.message.',''),
          }) )
        },
        "*":{
          actions: ({event,context:{worker}})=> worker.postMessage(event)  
        }
      },
    },
   
    error: {
      entry:emit(({context:{error, logs}})=>({
        type:"@worker.error",
        error, 
        logs
      })),
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

export default denoVMMachine;

// const service = createActor(denoVMMachine, {
//   input: {
//     code: `export default {
//             async fetch(req: Request): Promise<Response> {
//                 return Response.json({ ok: req.url });
//             },
//         }`,
//   },
//   inspector:{

//   },
//   onDone:({event})=>{
//     console.log("done",event)
//   },

// });
// logger(service)
// service.send({type:"@worker.start"})
// Deno.serve(async (req) => {
//   const id = crypto.randomUUID();
//   const waitResponse =  new Promise<BodyEvent>((resolve, reject) => {
//     const { unsubscribe } = service.on("@api.body", callback);
//     function callback(event: BodyEvent) {
//       if (event.id === id) {
//         unsubscribe();
//         resolve(event);
//       }
//     }
//   });

//   console.log("start ...");

//   service.start()
//   console.log("send request ...");
//   service.send({ type: "@api.fetch", request: req, id: id });

//   console.log("wait response ...");

//   const event = await waitResponse;
//   console.log("event", event);
//   return new Response(event.body);
// });
 

const actor = createActor(denoVMMachine,{
  inspect:{
    next: e=> {
        if(e.type ==="@xstate.event"){
          console.log(e.event)
        }
        if(e.type === "@xstate.snapshot"){
          console.log(e.actorRef.getSnapshot().value)
        }
      },
    error: console.error,
    complete: () => console.log('Done!'),
  }
});

actor.subscribe((state) => {
   console.log('Current state:', state.value);
  // console.log('Events:', state.context.events);
});
actor.on("@worker.created", ({worker})=>{
   console.log("started" , worker.id)
   worker.onmessage = async (event) => {
      console.log("received event from worker: ", event)
  };
  worker.onerror = (event) => {
    console.log("received error from worker: ", event)
  }
  worker.onclose = () => {
    console.log("worker closed")
  }
  worker.onexit = (event) => {
    console.log("received exit from worker: ", event)
  }
})

actor.on("*", (e)=>{
  console.log("received event from actor: ", e)
    
  }
)

actor.on("@worker.error", ()=>{
  console.log(actor.getSnapshot().context.logs)

})

actor.start();
actor.send({ type: '@worker.start' , id: 'swd'});
actor.send({ type: 'some_event', data: 'some data 1' });
actor.send({ type: 'some_event', data: 'some data 2' });

actor.send({ type: '@worker.stop' });

actor.send({ type: 'some_event', data: 'some data 3' });


Deno.serve(async (req) => {
    if(req.method === "POST"){
      
      if(req.headers.has("content-type") && req.headers.get("content-type")?.includes("multipart/form-data")){
        const form = await req.formData()
        console.log(form.has("file"), form.get("file"))
        const file = await Deno.readTextFile(form.get("file")!)
        if(file){
          actor.send({ type: '@worker.update', code:  file }); 
        }
      }
      else{ 
      const body = await req.text()
      actor.send({ type: '@worker.update', code:  body });
      }
    }
    
   return new Response(JSON.stringify({
    events:actor.getPersistedSnapshot().events,
     logs:actor.getPersistedSnapshot().context.logs,

    },null,2));

});



// fetch("http://localhost:8000", {
//   method: "POST",
//   headers: {
//     "Content-Type": "multipart/form-data",

//   },


//curl -X POST -F "file=@/.vm/example-vm.ts" http://localhost:8000
