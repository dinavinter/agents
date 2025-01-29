import { azure } from "https://esm.sh/@ai-sdk/azure";
import { fromAIEventStream, fromAIElementStream, asyncBatchEvents, asyncEventGenerator } from "https://esm.sh/@cxai/stream";
import { ServiceController } from "https://esm.sh/@cxai/stream/xstate?target=esnext";
import * as Y from "https://esm.sh/yjs@^13.6.20?target=esnext";
import { type AnyActorLogic, AnyStateMachine, createActor } from "xstate";

export async function start(doc: Y.Doc) {
    doc.shouldLoad && doc.load();

    const logic = await getMachine(doc.getMap<string>().get("src")!);
    return createYjsActor(logic,doc);

    function createYjsActor(logic: AnyActorLogic) {
        return createActor(ServiceController, {
            id: 'service',
            input: {
                logic: logic,
                doc: doc
            }
        });
    }


    async function getMachine(code: string) {
        // code= code || example;
        const tempFilePath = await Deno.makeTempFile();
        await Deno.writeTextFile(tempFilePath, code);
        const env = Deno.env.toObject();
        const module = await import(tempFilePath);

        return module.default.provide({
            actors: {
                stream: asyncEventGenerator,
                batch: asyncBatchEvents,
                aiElementStream: fromAIElementStream({
                    model: azure('gpt-4o', {
                        // baseURL: baseUrl(env.SAP_AI_API_URL, env.SAP_AI_DEPLOYMENT_ID),
                        // fetch: sapAIFetch,
                    }),
                    temperature: 0.9
                }),
                aiStream: fromAIEventStream({
                    model: azure('gpt-4o', {
                        // baseURL: baseUrl(env.SAP_AI_API_URL, env.SAP_AI_DEPLOYMENT_ID),
                        // fetch: sapAIFetch, 
                    }),
                    temperature: 0.9,
                })
            }
        });
    }


}
