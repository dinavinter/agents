import {ActorRefFrom, AnyStateMachine, createActor} from "xstate";
import {serviceMachine} from "../inspect/inspector";

const services: Map<string,
    ActorRefFrom<typeof serviceMachine>
> = new Map();


export async function getOrCreateWorkflow(agent: string, workflow: string) {
    if (!services.has(workflow)) {
        services.set(workflow, await createWorkflow(agent, workflow));
    }
    return services.get(workflow)!;

    async function createWorkflow(agent: string, workflow: string) {
        const {machine} = await import(`../agents/${agent}.ts`) as { machine: AnyStateMachine };
        const service= createActor(serviceMachine, {
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
}
