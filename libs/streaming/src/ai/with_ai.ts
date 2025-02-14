import { azure } from "https://esm.sh/@ai-sdk/azure";
import {
    asyncBatchEvents,
    asyncEventGenerator,
    fromAIElementStream,
    fromAIEventCallback,
    fromAIEventStream,
    fromEventAsyncGenerator,
    pipeToAI,
} from "https://esm.sh/@cxai/stream@1.0.17?target=esnext&yjs=13.6.20";
import { type AnyStateMachine } from "https://esm.sh/xstate@5.19.w?target=esnext";
export type Actors = {
    stream: ReturnType<typeof fromAIEventStream>;
    batch: ReturnType<typeof asyncBatchEvents>;
    aiElementStream: ReturnType<typeof fromAIElementStream>;
    aiStream: ReturnType<typeof fromAIEventStream>;
};

export type Actions = {
    push: (context: { doc: Y.Doc }, params: string) => void;
    appandText: (context: { doc: Y.Doc }, params: string) => void;
};

export default function (machine: AnyStateMachine): AnyStateMachine {
    return machine.provide({
        actors: {
            stream: asyncEventGenerator,
            batch: asyncBatchEvents,
            aiElementStream: fromAIElementStream({
                model: azure("gpt-4o"),
                temperature: 0.9,
            }),
            aiStream: fromAIEventStream({
                model: azure("gpt-4o"),
                temperature: 0.9,
            }),
            aiCallback: fromAIEventCallback({
                model: azure("gpt-4o"),
                temperature: 0.9,
            }),
            aiPipe: pipeToAI({
                model: azure("gpt-4o"),
                temperature: 0.9,
            }),
        },
    });
}

