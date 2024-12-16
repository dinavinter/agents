import { type AnyActorRef } from "https://esm.sh/xstate";

 

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
