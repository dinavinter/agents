import readline from "node:readline/promises";
import { tokenService } from "sap-ai-token";
import {AnyActorRef, AnyStateMachine, createActor, fromPromise, waitFor} from "xstate";
import {logger, loggerInspector} from "./logger";
import { argv } from "node:process";

const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});


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

    console.log(argv, "arguments", arguments)
    argv.forEach((v) => console.log(v))
    const agent = argv[2] || await terminal.question('What agent to run? (simple, news, support, tictac,  raffle) ');
    const create = await import(`./agents/${agent}.ts`).then((m) => m.default) as (create:typeof  createActor<AnyStateMachine>) => AnyActorRef;
    const actor = create((logic, options) => createActor(
        logic.provide({
            actors: {
                terminal: fromPromise( ({input}:{input:string}) =>  terminal.question(input))
            }
        }), {
            ...options,
            inspect:loggerInspector
        }));
    
    
    // logger(actor)
    actor.start();
    await waitToComplete(actor);

}
    
main().catch(console.error).finally(() =>{
    terminal.close();
    process.exit(0);
} );