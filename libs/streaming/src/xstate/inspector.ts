import {
    Actor,
    AnyActorLogic,
    AnyActorRef,
    createActor,
    enqueueActions,
    type EventDescriptor,
    type EventFromLogic,
    type EventObject, forwardTo, fromEventObservable,
    type InspectionEvent,
    setup, type AnyStateMachine,
    SnapshotFrom, StateMachine, AnyEventObject, AnyActor
} from "xstate";
import {createYjsHub, type serviceHub, type Emitted} from "./hub";
import * as Y from "yjs";
import  {yArrayIterator} from "@/yjs";
import {fromEventAsyncGenerator} from "./generator";
import {withTimeline} from "./timeline";

export type CreateServiceControllerOptions<TLogic extends AnyActorLogic> =
    & {
        logic: TLogic;
        name?: string;
        doc?: Y.Doc;
        hub?: serviceHub;
    }
    & Parameters<typeof createActor<TLogic>>[1]
    & Record<string, any>;

export type ServiceControllerContext = {
    service: AnyActorRef,
    hub: serviceHub
    logic: AnyActorLogic
}

type Event = InspectionEvent
type Input = CreateServiceControllerOptions<AnyActorLogic>
export type ServiceController<T extends AnyActorLogic= AnyActorLogic> =  StateMachine<ServiceControllerContext, Event, any, any, any, any, any, any, any, CreateServiceControllerOptions<T>, any, any, any, any>


const serviceControllerSetup = setup({
    actors:{
        events: fromEventObservable(({input}:{input:Y.Doc})=> yArrayIterator(input.getArray<EventObject>("events")))
    },
    types: {
        input: {} as Input,
        events: {} as InspectionEvent ,
        context: {} as {
            service: AnyActorRef,
            hub: serviceHub
            logic: AnyActorLogic
        }
    } 
})
 

 // @ts-ignore
const machine=serviceControllerSetup.createMachine({ 
    context: ({input: {logic,doc,hub,input, ...options}, self} ) => {
        hub = hub ?? createYjsHub(doc);
        const snapshotMap = hub.doc.getMap("state").toJSON() as SnapshotFrom<typeof logic>;
        input = Object.assign(input || {}, {
            ...hub.doc.getMap("input").toJSON(),
            ...hub.doc.meta || {},
        });
        const service = createActor(withTimeline(withInspector(logic, hub), hub), {
            id: self.id,
            logger: (s) => {},
            snapshot: snapshotMap.status ? snapshotMap : undefined,
            input: input,
            ...options,
        });

        return {
            ...options,
            hub,
            logic,
            service: service,
        };
    },
    invoke: {
        src: fromEventAsyncGenerator(async function*({ input }: { input: Y.Doc }) {
            let i = 0;
            for await (const e of yArrayIterator<EventObject>(input.getArray("events"))) {
                yield {
                    id: i++,
                    timestamp: Date.now(),
                    ...e,
                };
            }
        }),
        input: ({ context: { hub } }) => hub.doc,
    },

    entry: enqueueActions(({ context: { service, hub, logic }, enqueue }) => {
        service.on("*", (event: Emitted) => {
            console.group("emitted", event.type);
            if (event.type === "frontend") {
                console.log("emitted", event.data);
            }

            hub.emitted.push({
                offset: Date.now() - (hub.emitted.raw.get(0)?.timestamp ?? Date.now()),
                id: event.id || (hub.emitted.raw.length + 1).toString(),
                ...event,
                timestamp: Date.now(),
            });

            setNextEvents(hub.doc.getMap("next"), logic, service.getSnapshot());
            console.groupEnd();
        });
        service.start();
        setNextEvents(hub.doc.getMap("next"), logic, service.getSnapshot());

        // enqueue(({context:{service, hub}}) => {
        //         hub.doc.getArray<EventObject>("events").observe((event) => {
        //             service.send(event);
        //         })
        //     })
    }),

    on: {
        "*": {
            actions: [
                forwardTo(({ context: { service } }) => service),
            ],
            //@ts-ignore
            guards: ({ event, context: { hub } }) => !hub.doc.getMap("history").get(event.id),
        },
        // "*" : {
        //     actions: log (({event, context: {service}}) => {
        //         return  {type: event.type, id: service.id, sessionId: service.sessionId}
        //     })
        // }
    },
});

export function withInspector<T extends AnyActorLogic>(actorLogic: T, hub: serviceHub): T {
    if (actorLogic == undefined) {
        debugger;
        throw new Error("actorLogic is undefined");
    }

    // return actorLogic;
    const transition = actorLogic.transition.bind(actorLogic);
    const serviceMap = new Map<string, AnyActor>();
    actorLogic.transition = (state, event, actorCtx) => {
        // hub.inspected.push(event);
        // console.log('Inspected', event.type);

        const newState = transition(state, event, actorCtx);
        const snapshotMap = hub.doc.getMap("state");
        const persistedSnapshot = actorCtx.self.getPersistedSnapshot();
        Object.entries(persistedSnapshot).forEach(([key, value]) => {
            snapshotMap.set(key, value);
        });

        
        const contextMap = hub.doc.getMap("context");
        Object.entries("context" in persistedSnapshot ? persistedSnapshot.context as Record<string, any> : {}).forEach(
            ([key, value]) => {
                contextMap.set(key, value);
            },
        );

        const snapshot = actorCtx.self.getSnapshot();
        setNextEvents(hub.doc.getMap("next"), snapshot, actorLogic);
        hub.state = {
            next: getAllOwnEventDescriptors(snapshot).join(","),
            state: snapshot.value,
            event: event?.type,
        };

        if (event) {
            hub.doc.getMap("last-event").set("timestamp", event.timestamp ?? Date.now());
            hub.doc.getMap("last-event").set("id", event.id);
            hub.doc.getMap("last-event").set("type", event.type);
            hub.doc.getMap("history").set(event.id, {
                id: event.id,
                type: event.type,
                timestamp: event.timestamp ?? Date.now(),
            });
        }

        Object.entries(newState.children)?.forEach(([service, ref]) => {
            if (ref instanceof Actor) {
                hub.doc.getMap("services").get(service) || hub.doc.getMap("services").set(service, {
                    id: ref.id,
                    sessionId: ref.sessionId,
                    created: Date.now(),
                    status: ref.getSnapshot()?.status,
                    started: Date.now(),
                });

                if (!serviceMap.get(service)) {
                    ref.on("*", (event: AnyEventObject) => {
                        hub.emitted.push({
                            offset: Date.now() - (hub.emitted.raw.get(0)?.timestamp ?? Date.now()),
                            ...event,
                            type: `@${service}.${event.type}`,
                            timestamp: Date.now(),
                        });
                    });
                    serviceMap.set(service, ref);
                }
            }
        });

        return newState;
    };

    return actorLogic;
}
function getAllOwnEventDescriptors<T extends AnyStateMachine,TSnapshot extends SnapshotFrom<AnyStateMachine>>(
    snapshot: TSnapshot,
): EventDescriptor<EventFromLogic<T>>[] {
    console.log("nodes", snapshot._nodes);
    return [...new Set([...snapshot._nodes?.flatMap(sn => sn.ownEvents) || []])];
}

function setNextEvents<T extends AnyActorLogic, TSnapshot extends SnapshotFrom<T>>(
    nextMap: Y.Map<any>,
    actorLogic: T,
    snapshot: TSnapshot,
) {
    const nextEvents = getAllOwnEventDescriptors(snapshot);
    console.debug("setnext", nextEvents);
    nextMap.doc?.transact(() => {
        nextEvents.forEach(event => {
            nextMap.set(event, {
                type: event,
                // @ts-ignore
                meta: actorLogic.config?.states?.[snapshot.value]?.on?.[event]?.meta,
            });
        });
        // cleanup
        nextMap.forEach((_, key) => {
            if (!nextEvents.includes(key)) {
                nextMap.delete(key);
            }
        });
    });
    console.log("next-map", nextMap.toJSON());

    function getAllOwnEventDescriptors<TSnapshot extends SnapshotFrom<AnyStateMachine>>(
        snapshot: TSnapshot,
    ): EventDescriptor<EventFromLogic<T>>[] {
        console.log("nodes", snapshot._nodes);
        return [...new Set([...snapshot._nodes?.flatMap(sn => sn.ownEvents) || []])];
    }
}

export default machine as ServiceController;
