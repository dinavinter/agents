import {
    AnyStateMachine,
    assign,
    createMachine,
    emit,
    fromPromise,
    sendTo,
    StateMachine,
    StateMachineDefinition
} from "xstate";
import * as Y from "yjs";
import {serviceMachine} from "../inspect/inspector";
import {render} from "./agent-render";
import {yTextObservable} from "../stream/ytext";
import vm from "node:vm";

export const machineIde = createMachine({
    types: {
        context: {} as {
            error?: Error
            store: Y.Doc,
            // service: ActorRefFrom<typeof serviceMachine> | undefined,
            // transformer: ActorRefFrom<typeof agentTransformerMachine> 
        },
        input: {} as Y.Doc,
        events: {} as
            { type:'version', doc: Y.Doc , definition: StateMachineDefinition<any, any>, machine:AnyStateMachine} |
            { type: 'error', error: Error},
    },


    context: ({input, spawn}) => {
        const transformer = spawn(agentTransformerMachine, {
            id: input.guid,
            systemId: 'transformer',
            input: input,
            syncSnapshot: true
        });

        const service =spawn(serviceMachine,{
            id: 'latest',
            systemId: 'latest',
            input: {
                name: input.guid,
                logic: transformer.getSnapshot().context.latest
            }
        });
        return {
            store: input,
            service: service,
            transformer: transformer
        }
    },

    entry:render(({html}) =>  html`
       <div>
              <h1>IDE</h1>
       </div>
    `),
    on: {
        'version': {
            actions: sendTo('latest',  ({event:{machine}}) => ({
                type: 'update.logic',
                logic: machine
            }))
        },
        'error': {
            actions: assign({
                error: ( {event:{error}}) => error
            })
        }
    }
} )

const machineTransformer = fromPromise( async ({input: {identifier, code, context}}:{ input:{identifier:string, code: string, context: object}}) => {
    return await toMachine(identifier, code, context);
})


function getNew() {
  const doc = new Y.Doc();
 doc.getMap('context').set('agent', 'ide');
  doc.getText('code').insert(0, `
import { createMachine, assign } from 'xstate';

interface Context {
  retries: number;
}

const fetchMachine = createMachine<Context>({
  id: 'fetch',
  initial: 'idle',
  context: {
    retries: 0
  },
  states: {
    idle: {
      on: {
        FETCH: 'loading'
      }
    },
    loading: {
      on: {
        RESOLVE: 'success',
        REJECT: 'failure'
      }
    },
    success: {
      type: 'final'
    },
    failure: {
      on: {
        RETRY: {
          target: 'loading',
          actions: assign({
            retries: (context, event) => context.retries + 1
          })
        }
      }
    }
  }
});
`.trim());
  return doc;
}

const agentTransformerMachine = createMachine({
    types:{
        context: {} as  {
            doc: Y.Doc,
            versions: Y.Map<Y.Doc>,
            code: Y.Text,
            latest: AnyStateMachine,
            context: any,
            processing?: string
        },
     },
    context:( {input}:{input:Y.Doc})=> ({
        doc: input ?? getNew(),
        versions: input.getMap<Y.Doc>('version') ,
        code:  input.getText('code'),
        context:  {
            ...input.getMap('context').toJSON(),
            ...input.meta,
            id: input.guid
        } ,
        latest: createMachine({
            id:  input.guid,
            meta: {
                version: "empty",
                created: new Date().toISOString()
            },
        })
    }),

    initial: 'connected',
    states: {
        connected: {
            initial: 'pending',
            states: {
                pending: {
                    invoke: {
                        src: yTextObservable,
                        input: ({context: {code}}) => code
                    },
                    always: [
                        {
                            target: 'transforming',
                            guard: ({context: {code, processing}}) => code.toJSON() !== processing
                        },
                    ],
                    on: {
                        'text-delta': 'transforming',
                         disconnect: '#disconnected'
                    }
                },
                transforming: {
                    entry: assign({
                        processing: ({context:{code}}) => code.toJSON()
                    }),
                    invoke: {
                        src: machineTransformer,
                        input: ({context: {doc, processing}}) => ({
                            identifier: doc.guid,
                            code: processing,
                            context: doc.meta
                        }),
                        onDone: {
                            target: 'pending',
                            actions: emit(({event:{output}}) => ({
                                type: 'version',
                                ...output
                            }))
                        },
                        onError: {
                            target: 'pending',
                            actions: emit(({event: {error}}) => ({
                                type: "error",
                                error
                            }))
                        }
                    }
                }
            }
        },
        disconnected: {
            id: 'disconnected',
            on: {
                connect: 'connected'
            }
        }
    }
})


async function toMachine( identifier:string, code: string, context: object) {
    const machine = await transform(code);
    const definition = machine.toJSON();
    const machineJSONStr = JSON.stringify({
        ...definition,
        version: undefined
    });
    definition.version = await textHash(machineJSONStr);
    const verDoc = new Y.Doc({
        guid: definition.version,
        meta: {
            version: definition.version,
            created: new Date().toISOString()
        }
    });
    verDoc.getText('logic').insert(0, machineJSONStr);
    // version.set(definition.version, verDoc);
    // version.set('latest', verDoc);

    return{
        machine,
        definition,
        doc: verDoc
    }

    async function transform(code: string) {
        const mod = new vm.SourceTextModule(code, {
            identifier: identifier,
            context
        });

        // Execute any imperative statements in the module's code.
        await mod.evaluate();

        if("machine" in mod.namespace && mod.namespace.machine instanceof StateMachine) {
            // The namespace includes the exports of the ES module.
            return  mod.namespace.machine
        }
        throw new Error(`No machine exported from ${identifier} `);

    }

}

async function textHash(text:string ) {
    const arrayBuffer = new TextEncoder().encode(text);

    // Git prepends the null terminated text 'blob 1234' where 1234
    // represents the file size before hashing so we are going to reproduce that

    // first we work out the Byte length of the file
    const uint8View = new Uint8Array(arrayBuffer);
    const length = uint8View.length;

    // Git in the terminal uses UTF8 for its strings; the Web uses UTF16.
    // We need to use an encoder because different binary representations
    // of the letters in our message will result in different hashes
    const encoder = new TextEncoder();
    // Null-terminated means the string ends in the null character which
    // in JavaScript is '\0'
    const view = encoder.encode(`blob ${length}\0`);

    // We then combine the 2 Array Buffers together into a new Array Buffer.
    const newBlob = new Blob([view.buffer, arrayBuffer], {
        type: "text/plain",
    });
    const arrayBufferToHash = await newBlob.arrayBuffer();

    // Finally we perform the hash this time as SHA1 which is what Git uses.
    // Then we return it as a string to be displayed.
    return hashToString(await crypto.subtle.digest("SHA-1", arrayBufferToHash));


    function hashToString(arrayBuffer:ArrayBufferLike) {
        const uint8View = new Uint8Array(arrayBuffer);
        return Array.from(uint8View)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
    }

}

         