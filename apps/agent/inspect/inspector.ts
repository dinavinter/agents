import {
    Actor, AnyActorLogic,
    AnyActorRef, createActor,
    enqueueActions, EventObject, InspectionEvent, log,
    setup
} from "xstate";
import {EventMessage} from "fastify-sse-v2";
import {createYjsHub, serviceHub} from "../stream/hub";
type CreateServiceMachineOptions<TLogic extends AnyActorLogic> = {
    logic: TLogic,
    name?: string
} & Parameters<typeof createActor<TLogic>>[1]
    & Record<string, any>




export const serviceMachine = setup({
    types: {
        input: {} as CreateServiceMachineOptions<AnyActorLogic>,
        events: {} as InspectionEvent ,
        context: {} as {
            service: AnyActorRef,
            hub: serviceHub
        }
    } 
}).createMachine({ 
    context: ({input: {logic, ...options}, spawn, self}) => {
        const hub = createYjsHub();
        const service =createActor(withInspector(logic,hub), {
            id: self.id,
            logger: (s) => {},
            ...options,
            inspect: {
                next:(e) => {
                    e.type === '@xstate.event' && hub.inspected.push(e)
                } 
            }
        }); 
        return {
            ...options,
            hub,
            service: service,
         }
    },

    entry: enqueueActions(({context: {service, hub}, enqueue}) => {
        service.on("*", (event: EventMessage & EventObject) => {
            hub.emitted.push(event);
            
        })  
    }),
   
    on:{
        "*" : {
            actions: log (({event, context: {service}}) => {
                return  {type: event.type, id: service.id, sessionId: service.sessionId}
            })
        }
    }
    
})



function withInspector<T extends AnyActorLogic>(actorLogic: T,  hub:serviceHub):T {
    const transition = actorLogic.transition;
    actorLogic.transition = (state, event, actorCtx) => {
        // hub.inspected.push(event);
        const newState= transition(state, event, actorCtx);
        hub.snapshot.push(actorCtx.self.getSnapshot());
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
   
}
