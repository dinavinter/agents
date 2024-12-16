import * as Y from "https://esm.sh/yjs";
import {parseArgs} from "jsr:@std/cli/parse-args";
import {createYjsHub} from "./stream/hub.ts";
import {createActor, SnapshotFrom, waitFor} from "https://esm.sh/xstate";
import {AnyActorLogic} from "xstate";
import {YjsDocManager} from "./provider/hp.ts";
import {serviceMachine} from "./inspect/inspector.ts";
 
const flags = parseArgs(Deno.args, {
  string: ["url" , "room", "collection", "doc", "src", ],
});


const example = `
     
import {createMachine, assign, emit} from "xstate";


export default createMachine({
    id: 'emit-example',
    initial: 'emit', 
    context:{
        index: 0
    },
    states: {
        emit: {
            entry: assign({
                index: ({context: {index}}:{context:{index:number}}) => index + 1
            }),
            after: {
                1000: {
                    target: 'emit',
                    reenter: true,
                    actions: emit(({context: {index}}: {context:{index:number}}) => ({
                        type: 'EMIT',
                        data: index,
                        event: 'emit'
                    }))
                }
            },
        }
    }
})

 
`
console.log(flags, Deno.args)
 
// Learn more at https://docs.deno.com/runtime/manual/examples/module_metadata#concepts
if (import.meta.main) {
    const docManager = new YjsDocManager(flags.url); 
    const doc  =docManager.getOrCreate(flags.room || "default");
    
    await new Promise<void>(resolve=> {
        setTimeout(() => {
            console.log(doc.toJSON())
            resolve()
        }, 1000)
    });
    const actor=await start(doc); 
    actor.start();
    await waitFor(actor, () =>  false).then(() => {
        console.log('done')
    })
}


async function start(doc:Y.Doc ) {
    doc.shouldLoad && doc.load();
    if(!doc.getMap().get("src")) {
        console.log("waiting for src")
        await new Promise<void>(resolve => {
            doc.getMap().observe(() => {
                if (doc.getMap().get("src")) {
                    console.log("src loaded")
                    resolve()
                }
            })
        })
    }
    const state = doc.getMap("current").get("state");
    const context = doc.getMap("current").get("context");
    console.log("state", state, context)
    
    const logic = await getMachine(doc.getMap<string>().get("src")!);
    return createYjsActor(logic);

    function createYjsActor(logic: AnyActorLogic) {
        const hub =  createYjsHub(doc);
        const snapshotMap = hub.doc.getMap('state')?.toJSON() as SnapshotFrom<typeof logic>;
       
        return createActor(serviceMachine, {
            id: 'service',
            input: {
                logic: logic,
                hub: hub,
                snapshot:  snapshotMap.status ? snapshotMap : undefined,

            },
            
            inspect: {
                next: (e: { type: string; }) => {
                    e.type === '@xstate.event' && console.debug(e)
                }
            }
        })
    }

   
    async function getMachine(code:string) {
        code= code || example;
        const tempFilePath = await Deno.makeTempFile();
        await Deno.writeTextFile(tempFilePath, code);
        const module = await import(tempFilePath);

        return module.default;
    }


}

