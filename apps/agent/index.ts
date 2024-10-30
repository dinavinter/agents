import readline from "node:readline/promises";
import { tokenService } from "sap-ai-token";
import {AnyActorRef, AnyStateMachine, createActor, fromCallback, fromPromise, waitFor} from "xstate";
import { argv } from "node:process";
import {getOrCreateWorkflow} from "./agents/agent-store";

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
    const actor = await getOrCreateWorkflow (agent, agent);
    
    
    // logger(actor)
    actor.start();
    await waitToComplete(actor);

}
    
main().catch(console.error).finally(() =>{
    terminal.close();
    process.exit(0);
} );