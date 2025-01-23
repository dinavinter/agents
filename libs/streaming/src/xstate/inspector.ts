import {
    Actor,
    AnyActorLogic,
    AnyActorRef,
    AnyStateMachine,
    createActor,
    enqueueActions,
    EventDescriptor,
    EventFromLogic,
    EventObject, forwardTo, fromEventObservable,
    InspectionEvent,
    setup,
    SnapshotFrom, StateMachine
} from "xstate";
import {createYjsHub, type serviceHub} from "./hub";
import * as Y from "yjs";
import {EventMessage} from "@/iterator";
import  {yArrayIterator} from "@/yjs";
type CreateServiceMachineOptions<TLogic extends AnyActorLogic> = {
    logic: TLogic,
    name?: string,
    doc?: Y.Doc,
    hub?: serviceHub
} & Parameters<typeof createActor<TLogic>>[1]
    & Record<string, any>

type Context = {
    service: AnyActorRef,
    hub: serviceHub
}

type Event = InspectionEvent
type Input = CreateServiceMachineOptions<AnyActorLogic>
export type ServiceMachine<T extends AnyActorLogic= AnyActorLogic> =  StateMachine<Context, Event, any, any, any, any, any, any, any, CreateServiceMachineOptions<T>, any, any, any, any>

// export type ServiceMachine= StateMachine<Context, Event, Input, AnyStateMachine>

const serviceMachineSetup = setup({
    actors:{
        events: fromEventObservable(({input}:{input:Y.Doc})=> yArrayIterator(input.getArray<EventObject>("events")))
    },
    types: {
        input: {} as CreateServiceMachineOptions<AnyActorLogic>,
        events: {} as InspectionEvent ,
        context: {} as {
            service: AnyActorRef,
            hub: serviceHub
        }
    } 
})
const serviceMachine=serviceMachineSetup.createMachine({ 
    context: ({input: {logic,doc,hub, ...options}, spawn, self}) => {
        hub = hub ?? createYjsHub(doc);
        const snapshotMap = hub.doc.getMap('state').toJSON() as SnapshotFrom<typeof logic>;

        const service =createActor(withInspector(logic,hub), {
            id: self.id,
            logger: (s) => {},
            snapshot:  snapshotMap.status ? snapshotMap : undefined,
            ...options,
            // inspect: {
            //     next:(e) => {
            //        // e.type === '@xstate.event' && hub.inspected.push(e)
            //     } 
            // }
        }); 
          
        return {
             ...options,
            hub,
            service: service,
         }
    },
    invoke:{
        src: fromEventObservable(({input}:{input:Y.Doc})=> yArrayIterator(input.getArray<EventObject>("events"))), 
        input: ({context:{hub}}) => hub.doc,
            
    },

    entry: enqueueActions(({context: {service, hub}, enqueue}) => {
        service.on("*", (event: EventMessage & EventObject) => {
            hub.emitted.push({
                ...event 
            }); 
        }) 
        service.start();
        
        // enqueue(({context:{service, hub}}) => {
        //         hub.doc.getArray<EventObject>("events").observe((event) => {
        //             service.send(event);
        //         }) 
        //     })
    }),
   
    on:{
       "*": {
           actions:  forwardTo(({context: {service}}) => service)
       }
        // "*" : {
        //     actions: log (({event, context: {service}}) => {
        //         return  {type: event.type, id: service.id, sessionId: service.sessionId}
        //     })
        // }
    }
    
})



function withInspector<T extends AnyActorLogic>(actorLogic: T,  hub:serviceHub):T {
    if(actorLogic == undefined) {
        debugger;
        throw new Error("actorLogic is undefined")
    }
    
    // return actorLogic;
    const transition = actorLogic.transition.bind(actorLogic);
    
    actorLogic.transition = (state, event, actorCtx) => {
        // hub.inspected.push(event);
        // console.log('Inspected', event.type);
        const newState= transition(state, event, actorCtx);
        const snapshotMap = hub.doc.getMap('state');
        Object.entries(actorCtx.self.getPersistedSnapshot()).forEach(([key, value]) => {
            snapshotMap.set(key, value);
        })

        const snapshot = actorCtx.self.getSnapshot();
        hub.state = {
            next: getAllOwnEventDescriptors(snapshot).join(","),
            state: snapshot.value,
            event: event?.type,
            context: snapshot.context
        };
        Object.entries(newState.children)?.forEach(([service, ref]) => {
            const {isNew, hub: serviceHub} = hub.child(service)
            if (isNew) {

                if (ref instanceof Actor) {
                    ref.on("*", (event) => {
                        //todo: decide either to push to the service hub or the main hub
                        serviceHub.emitted.push({
                            ...event,
                            type: event.type
                        }); 
                        hub.emitted.push({
                            ...event,
                            type: `@${service}.${event.type}`
                        });
                    }) 
                    ref.subscribe((snapshot) => {
                        serviceHub.snapshot.push(snapshot);
                    })
                }
            }
        })

        return newState;
    }
    
    return actorLogic;
    function getAllOwnEventDescriptors<TSnapshot extends SnapshotFrom<AnyStateMachine>>(snapshot:TSnapshot):EventDescriptor<EventFromLogic<T>>[] {
        return [...new Set([...snapshot._nodes?.flatMap(sn => sn.ownEvents)])];
    }
}


export default serviceMachine as ServiceMachine;