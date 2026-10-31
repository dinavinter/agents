import { azure } from "@ai-sdk/azure";
import {    
    fromAIElementStream,
    fromAIEventCallback,
    fromAIEventStream,
    pipeToAI,
} from "./";
import { type AnyStateMachine } from "xstate";
import {asyncBatchEvents, asyncEventGenerator} from "@/xstate";
 
export type Actors = {
    stream: ReturnType<typeof fromAIEventStream>;
    batch:  typeof asyncBatchEvents;
    aiElementStream: ReturnType<typeof fromAIElementStream>;
    aiStream: ReturnType<typeof fromAIEventStream>;
};



type StateMachineWithAI<T extends AnyStateMachine = AnyStateMachine> = T & {
    implementations: {
        actors: T["implementations"]["actors"] & Actors
    }
};


export default function <T extends AnyStateMachine>(machine: T) {
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
    }) as StateMachineWithAI<T>;
}

