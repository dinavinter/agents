import {AnyActorRef} from "xstate";

export function logger(actor: AnyActorRef) {
    actor.subscribe({
        next: (s) => {
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
