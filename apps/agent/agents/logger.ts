import {
    createMachine,
    assign,
    createActor,
    emit,
    InspectionEvent,
    ActorRefFrom,
    ObservableActorLogic,
    Observer
} from 'xstate';
import {render} from "../ui/render";
import {c, css, html} from "atomico";
import {pushable, Pushable} from "it-pushable";

type LoggerMachineContext = {
    logs: string[]
    events:InspectionEvent[]
    services:  Map<string, Pushable<InspectionEvent>>,

};

type LoggerMachineEvent =
    | { type: 'start' }
    | { type: 'message', message: string }
    | { type: 'json', json: any }
    | { type: 'done' };


const LogMessage = c(({message}) => {
    return html`<li class="flex justify-between gap-x-6 py-5"><pre class="font-mono text-green-600">${message} </pre></li>`
}, {
    props: {
        message: {type: String}
    },
    styles: css`
        @tailwind base;
        @tailwind components;
        @tailwind utilities;
        @tailwind screens;
        @tailwind forms;
        `
        
})

/*    <${stream.event("json").json} >
                 <ul role="list" class="divide-y divide-gray-100" slot="container-template">
                     <slot></slot>
                  </ul>
                <${LogMessage} slot="item-template" /> 
        </${stream.event("json").json} >
        
 */


customElements.define('log-message', LogMessage)
export const loggerMachine = createMachine({
    id: 'loggerMachine',
    initial: 'logging',
    types: {
        context:{} as LoggerMachineContext,
        events:{} as LoggerMachineEvent |  InspectionEvent
    },
    context: {
        logs: [],
        events: [],
        services: new Map()
    },
    entry:render(({html,stream}) => html`
        <div slot="template" class="flex flex-col gap-y-4 max-h-[90vh] overflow-y-scroll" >
         <${stream.event("message").text} />
        </div>
    `),
    states: {
        idle: {
            on: {
                start: 'logging'
            }
        },
        logging: {
            on: {
                message: {
                    actions: [
                        assign({
                            logs: ({context:{logs}, event:{message}}) => [...logs, message]
                        }),
                        emit( ({event:{message}}) => ({type: 'message', data:message})),
                       // render(({event:{message}, html}) => html`
                       //    <div class="" <pre style="margin: 0.4rem; " >${message}</pre>
                       // `)
                    ]
                },
                "@xstate.*": [{
                    actions: assign({
                        services: ({context: {services}, event}) => {
                            const { actorRef } = event as InspectionEvent;
                            if(!services.has(actorRef.id)) {
                                services.set(actorRef.id,  pushable<InspectionEvent>({objectMode: true}));
                            }
                            const service = services.get(actorRef.id);
                            service?.push(event);
                            return services;
                        }
                    })
                  }], 
                    
                json:{ 
                    actions: emit(({event:{json}}) => ({type: 'message', data:JSON.stringify(json)})),
                },
                done: 'done'
            }
        },
        done: {
            type: 'final'
        }
    }
});

export function create( create?: typeof createActor<typeof loggerMachine>) {
    return (create ?? createActor)(loggerMachine )
    
    
}

export type LoggerService = ReturnType<typeof create>

export function asLogger(logger:LoggerService) {
    return function log(...args: any[]) {
        for (const arg of args) {
            logger.send(typeof arg === 'object' ? {
                type: 'json',
                json: arg
            } : {
                type: 'message',
                message: arg
            })
        }

    }
}
export function asInspector(logger:LoggerService) {
    return {
        next: (e: InspectionEvent) => {
            logger.send(e)
        },
        error: (error: any) => {
            console.error('error', error);
            logger.send({
                type: 'error',
                error
            })
        },
        complete: () => {
            logger.send({
                type: 'complete'
            })
        }

    } satisfies Observer<InspectionEvent>
}


export default create