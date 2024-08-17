import {
    AnyActorLogic, AnyActorRef, AnyEventObject, assign,
    createActor,
    createMachine, emit, EventFrom,
    EventObject,
    fromEventObservable,
    fromTransition,
    InspectionEvent,
    MachineConfig,
    Observer,
    Snapshot, spawnChild
} from "xstate";
import {pushable, Pushable} from "it-pushable";
import {
    asyncEventGenerator,
    filterAsync,
    filterEventAsync,
    fromAsyncGenerator,
    fromEventAsyncGenerator
} from "../stream";
import {GuardPredicate} from "xstate/dist/declarations/src/guards";

type CreateServiceMachineOptions<TLogic extends AnyActorLogic> = {
    logic: TLogic,
    name?: string
} & Parameters<typeof createActor<TLogic>>[1]
    & Record<string, any>

function getId(logic: AnyActorLogic, self: AnyActorRef, {
    name,
    id
}: Pick<CreateServiceMachineOptions<AnyActorLogic>, "id" | "name">) {
    name =  name || (logic.config as MachineConfig<any, any, any>)?.id || self.sessionId;
    return name
}

export const serviceMachine = createMachine({
    types: {
        input: {} as CreateServiceMachineOptions<AnyActorLogic>,
        events: {} as InspectionEvent | ObserverEvent
    },
    context: ({input: {logic, ...options}, spawn, self}) => {
        const logStream = pushable<InspectionEvent>({objectMode: true});
        return {
            ...options,
            logStream,
            service: createActor(logic, {
                id: getId(logic, self, options),
                inspect: observer(logStream),
                ...options
            }),
            events: [] as AnyEventObject[],
            actors: [] as AnyActorRef[],
            logger: spawn(fromAsyncGenerator(logStream[Symbol.asyncIterator]), {
                id: 'log',
                syncSnapshot: true,
                systemId: 'log'
            })
        }
    },
    
    initial: 'running',
    
    states: {
        stopped: {
            on: {
                "@xstate.*": {
                    target: 'running'
                }
            }
        },
        running: {
            on: {
                '@xstate.snapshot': {
                    actions: assign(({event: {snapshot}}) => "context" in snapshot ? snapshot.context : snapshot)
                },
                '@xstate.event': {
                    actions: assign({
                        events: ({context:{events}, event}) => [...events, event]
                    })
                    // actions: emit({event}) => event})
                    // actions: emit(({event: {event, sourceRef}, self, context:{service}}) => ({
                    //     ...event,
                    //     type: sourceRef?.id === service.id ? event.type : `@${sourceRef?.id}.${event.type}`,
                    // }))
                },
                '@observer.complete': {
                    target: 'done',
                    actions: assign(({event: {output}}) => output)
                }, 
                '@observer.error': {
                    target: 'error',
                    actions: assign(({event: {error}}) => error)
                }
            },
          
                
        },
        error: {},
        done: {}
    }
})



const eventStream = pushable<Snapshot<any>>({objectMode: true});

type ObserverEvent = {
    type: '@observer.complete',
    output?: any
} | {
    type: '@observer.error',
    error: any
}


function fromActorRef<TActorRef extends AnyActorRef>(actorRef?: TActorRef) {
    return fromEventAsyncGenerator(async function* yieldEvents({input}: { input?: TActorRef }) {
        actorRef = input || actorRef!;
        const eventStream = pushable<EventFrom<TActorRef>>({objectMode: true});
        actorRef.on("*",  (event) => {
            eventStream.push(event);
        })

        for await (const event of eventStream) {
            yield event;
        }
    })
}


    function observer<T>(pushable: Pushable<T | ObserverEvent>): Observer<T> {
        return {
            next: (value) => {
                pushable.push(value);
            },
            complete: () => {
                pushable.push({type: '@observer.complete'});
            },
            error: (error) => {
                pushable.push({type: '@observer.error', error});
            }
        }

    }

    function fromEventStream<T extends EventObject>(eventStream?: Pushable<T>) {
        return fromTransition((state: Pushable<T>, event: T) => {
            state.push(event);
            return state;
        }, eventStream || pushable<T>({objectMode: true}))
    }










/*
// spawnChild('actor', {
//     syncSnapshot: true,
//     id: ({event: {actorRef}}) => actorRef.id
// }),


  on:{
        '@xstate.actor': {
            actions: assign({
                actors: ({ spawn, event: {actorRef}, context: {actors,logStream}}) => [
                    ...actors,
                    spawn(serviceMachine,{
                        id: actorRef.id,
                        syncSnapshot: true,
                        input:  {
                            logic: fromActorRef(actorRef) 
                        }
                    })
                ]
            }) 
        }
    },
({event: {actorRef}, context:{logStream, ...context}, spawn}) =>
 spawn(logic, {
                id: getId(logic, self, options),
                inspect: observer(logStream),
                syncSnapshot: true,
                ...options
            }),
 */