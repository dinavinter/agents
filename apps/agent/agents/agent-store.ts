import {ActorRefFrom, AnyStateMachine, createActor} from "xstate";
import {serviceMachine} from "../inspect/inspector";

export const services: Map<string,
    ActorRefFrom<typeof serviceMachine>
> = new Map();

export const agents: Map<string, {
    machine: AnyStateMachine
}> = new Map();


export function createActorInstance( agent: string, workflow: string,machine: AnyStateMachine) {
    const service = createActor(serviceMachine, {
        id: workflow,
        input: {
            name: agent,
            logic: machine
        }
    })
    service.on("*", (event) => {
        console.log(`${agent} Event:`, event);
    })
    return service;
}

export async function getOrCreateWorkflow(agent: string, workflow: string) {
    if (!services.has(workflow)) {
        services.set(workflow, await createWorkflow(agent, workflow));
    }
    return services.get(workflow)!;

    async function createWorkflow(agent: string, workflow: string) {
        const {machine} = agents.get(agent) || await import(`../agents/${agent}.ts`) as { machine: AnyStateMachine };
        return createActorInstance( agent, workflow, machine);

    }
}
