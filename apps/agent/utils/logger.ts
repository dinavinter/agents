import {AnyActorRef, InspectionEvent} from "xstate";
import fs from "node:fs";

export const loggerInspector= {
    next: (s: InspectionEvent) => {
        // if(s.type ==="")
        // console.log('Type:', s.type);
        // console.log('State:', s.snapshot?.value || s.actorRef?.getSnapshot()?.value);
        // console.log(
        //     'Context:',
        //     JSON.stringify(
        //         s.context,
        //         (k, v) => {
        //             if (typeof v === 'string') {
        //                 // truncate if longer than 50 chars
        //                 return v.length > 50 ? `${v.slice(0, 50)}...` : v;
        //             }
        //             return v;
        //         },
        //         2
        //     )
        // );
        // fs.writeFileSync('log.json', JSON.stringify(s.actorRef?.getPersistedSnapshot(), null, 2))

        if(s.type === "@xstate.snapshot"){
             fs.writeFileSync("log/"+s.actorRef.id +"."+ s.actorRef?.getSnapshot()?.value, JSON.stringify(s.actorRef?.getPersistedSnapshot(), null, 2))

            // fs.writeFileSync('snapshot.json', JSON.stringify(s.snapshot.output, null, 2))
        }
        if(s.type === "@xstate.event"){
            fs.appendFileSync("log/"+'event.jsonl', JSON.stringify(s.event) + "\n")
        }
        if (s.type === '@xstate.event') {
            // console.log('Type:', s.type);
            console.log('State:',   s.actorRef?.getSnapshot()?.value);
            //
            // console.log(
            //     'Event:',
            //     JSON.stringify(
            //         s.event,
            //         (k, v) => {
            //             if (typeof v === 'string') {
            //                 // truncate if longer than 50 chars
            //                 return v.length > 50 ? `${v.slice(0, 50)}...` : v;
            //             }
            //             return v;
            //         },
            //         2
            //     )
            // );
        }

    }
}
export function logger(actor: AnyActorRef) {
    actor.subscribe({
        next: (s) => {
            console.log('Type:', s.e);
            console.log('State:', s.value);
            // console.log(
            //     'Context:',
            //     JSON.stringify(
            //         s.context,
            //         (k, v) => {
            //             if (typeof v === 'string') {
            //                 // truncate if longer than 50 chars
            //                 return v.length > 50 ? `${v.slice(0, 50)}...` : v;
            //             }
            //             return v;
            //         },
            //         2
            //     )
            // );
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