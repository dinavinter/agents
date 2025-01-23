import {
    Actor, ActorRef,
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
    SnapshotFrom
} from "xstate";
import {createYjsHub, Emitted, type serviceHub} from "../stream/hub.ts";
import * as Y from "yjs";
import  {yArrayIterator} from "../stream/yjs.ts";
type CreateServiceMachineOptions<TLogic extends AnyActorLogic> = {
    logic: TLogic,
    name?: string,
    doc?: Y.Doc,
    hub?: serviceHub
} & Parameters<typeof createActor<TLogic>>[1]
    & Record<string, any>



export const serviceMachine = setup({
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
}).createMachine({ 
    context: ({input: {logic,doc,hub, ...options}, spawn, self}) => {
        hub = hub ?? createYjsHub(doc);
        const snapshotMap = hub.doc.getMap('state').toJSON() as SnapshotFrom<typeof logic>;

        const service =createActor(withTimeline(withInspector(logic,hub),hub), {
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
        service.on("*", (event: Emitted) => {
            hub.emitted.push({
                timestamp:  Date.now(),
                offset: Date.now()- (hub.emitted.raw.get(0)?.timestamp ?? Date.now()),
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


export function withMarks<T extends AnyActorLogic>(actorLogic: T,  hub:serviceHub) {
    if(actorLogic == undefined) {
        throw new Error("actorLogic is undefined")
    }
    const transition = actorLogic.transition.bind(actorLogic);
    actorLogic.transition = (state, event, actorCtx) => {
        const marks = hub.doc.getMap<number>("marks");
        const timestamp = Date.now();
        if (event.type === "@xstate.init") {
            marks.set("started", timestamp);
        }
        if (event.type === "@xstate.stop") {
            marks.set("stopped", timestamp);
        }

        const before = actorCtx.self.getSnapshot();
        const newState = transition(state, event, actorCtx);
        const snapshot = actorCtx.self.getSnapshot();
        if (snapshot.value !== before.value) {
            marks.set(`start:${snapshot.value}`, timestamp);
            marks.set(`end:${before.value}`, timestamp);
        }

        return newState;
    }



}

export function withTimeline<T extends AnyActorLogic>(actorLogic: T,  hub:serviceHub) {
  if(actorLogic == undefined) {
       throw new Error("actorLogic is undefined")
  }
    const transition = actorLogic.transition.bind(actorLogic);
    actorLogic.transition = (state, event, actorCtx) => {
        const timestamp = Date.now();
        const before = actorCtx.self.getSnapshot(); 
        const last = before.events?.[before.events.length - 1]?.timestamp ?? before.event?.timestamp ?? 0;
        const offset = last ? timestamp - last : 0;
        console.log('offset', before.value, offset, last, timestamp,before.events, before.event);
        const newState = transition(state, {
            timestamp,
            offset,
            id: offset,
            ...event
        } , actorCtx);
        const snapshot = actorCtx.self.getSnapshot();

        //persist timeline
        const timeline = hub.doc.getMap("timeline");
        timeline.doc?.transact(() => {
            if (snapshot.value !== before.value) {
                timeline.set(`${timestamp}`, actorCtx.self.getPersistedSnapshot());
            }
        }) 
        return newState;
    }
        
    return actorLogic;
          
    
} 

function withInspector<T extends AnyActorLogic>(actorLogic: T,  hub:serviceHub):T {
    if(actorLogic == undefined) {
        debugger;
        throw new Error("actorLogic is undefined")
    }
    
    // return actorLogic;
    const transition = actorLogic.transition.bind(actorLogic);
    const serviceMap =new Map<string, ActorRef>();
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
            if (ref instanceof Actor) { 
               
              hub.doc.getMap('services').get(service) || hub.doc.getMap('services').set(service, {
                    id: ref.id,
                    sessionId: ref.sessionId,
                    created: Date.now(),
                    status: ref.getSnapshot()?.status,
                    started: Date.now()
                })  
                    
                 
                  if(!serviceMap.get(service, ref)) {
                      ref.on("*", (event: Emitted) => {
                          hub.emitted.push({
                              timestamp: Date.now(),
                              offset: Date.now()- (hub.emitted.raw.get(0)?.timestamp ?? Date.now()),
                              ...event,
                              type: `@${service}.${event.type}`
                          });
                      })
                      serviceMap.set(service, ref);
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



//todo: decide either to push to the service hub or the main hub
// serviceHub.emitted.push({
//     timestamp:  Date.now(),
//     offset: Date.now() - (hub.doc.getMap<number>("timeline")?.get("started") ?? 0),
//     ...event,
//     type: event.type
// }); 

// ref.subscribe((snapshot) => {
//     serviceHub.snapshot.push(snapshot);
// })
