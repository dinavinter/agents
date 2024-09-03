import {AnyActorLogic, AnyActorRef, InspectionEvent} from "xstate";
import fs from "node:fs";


export function withLogging<T extends AnyActorLogic>(actorLogic: T) {
    return {
        ...actorLogic,
        transition: (state, event, actorCtx) => {
            console.log('Event:', state.value, event.type, {
                id: actorCtx.id,
                sessionId: actorCtx.sessionId,
                selfID: actorCtx.self?.id
            });
            const transitioned = actorLogic.transition(state, event, actorCtx);
            return transitioned;
        },
    } satisfies T;
}

export const loggerFsInspector= {
    next: (s: InspectionEvent) => { 
        fs.writeFileSync('log.json', JSON.stringify(s.actorRef?.getPersistedSnapshot(), null, 2))

        if(s.type === "@xstate.snapshot"){
             fs.writeFileSync("log/"+s.actorRef.id +"."+ s.actorRef?.getSnapshot()?.value, JSON.stringify(s.actorRef?.getPersistedSnapshot(), null, 2))

        }
        if(s.type === "@xstate.event"){
            fs.appendFileSync("log/"+'event.jsonl', JSON.stringify(s.event) + "\n")
        } 

    }
}
export function logger(actor: AnyActorRef) {
    actor.subscribe({
        next: (s) => {
            console.log('Type:', s.e);
            console.log('State:', s.value);
            console.log(
                'Context:',
                JSON.stringify(
                    s.context,
                    (k, v) => {
                        if (typeof v === 'string') {
                            // truncate if longer than 50 chars
                            return v.length > 50 ? `${v.slice(0, 50)}...` : v;
                        }
                        return v;
                    },
                    2
                )
            );
            if(s.event){
                console.log(
                    'Event:',
                    JSON.stringify(
                        s.event,
                        (k, v) => {
                            if (typeof v === 'string') {
                                // truncate if longer than 50 chars
                                return v.length > 50 ? `${v.slice(0, 50)}...` : v;
                            }
                            return v;
                        },
                        2
                    )
                );
            }
           
        },
        complete: () => {
            actor.getSnapshot().output &&
            console.log('Output:', actor.getSnapshot().output);

        },
        error: (err: any) => {
            console.error(err);
        },
    });
}
