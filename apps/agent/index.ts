import readline from "node:readline/promises";
import { tokenService } from "sap-ai-token";
import {AnyActorRef, AnyStateMachine, createActor, fromPromise, waitFor} from "xstate";

const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});


function logger(actor: AnyActorRef) {
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

function waitToComplete(actor: AnyActorRef) {
    return new Promise((resolve) => {
        actor.subscribe({
            complete: () => {
                resolve(actor.getSnapshot());
            },
        });
    });
}

async function main() {
    tokenService.credentialsFromEnv();

    const agent = await terminal.question('What agent to run? (simple, news, support, tictac,  raffle) ');
    const create = await import(`./agents/${agent}.ts`).then((m) => m.default) as (create:typeof  createActor<AnyStateMachine>) => AnyActorRef;
    const actor = create((logic, options) => createActor(
        logic.provide({
            actors: {
                terminal: fromPromise( ({input}:{input:string}) =>  terminal.question(input))
            }
        }), options));
    
    
    logger(actor)
    actor.start();
    await waitToComplete(actor);

}
    
main().catch(console.error).finally(() =>{
    terminal.close();
    process.exit(0);
} );