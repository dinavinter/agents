import { azure } from "https://esm.sh/@ai-sdk/azure";
import { fromAIEventStream, fromAIElementStream, asyncBatchEvents, asyncEventGenerator } from "https://esm.sh/@cxai/stream";
import { ServiceController } from "https://esm.sh/@cxai/stream@1.0.11";
import * as Y from "https://esm.sh/yjs";
import {   AnyStateMachine, createActor } from "https://esm.sh/xstate";
 



export function createYjsActor(machine: AnyStateMachine,doc: Y.Doc) {
    return createActor(ServiceController, {
        id: 'service',
        input: {
            doc: doc,
            logic: machine.provide({
                actors: {
                    stream: asyncEventGenerator,
                    batch: asyncBatchEvents,
                    aiElementStream: fromAIElementStream({
                        model: azure('gpt-4o'),
                        temperature: 0.9
                    }),
                    aiStream: fromAIEventStream({
                        model: azure('gpt-4o'),
                        temperature: 0.9,
                    })
                }
            })
        }
    });



}