import {type AssistantStreamEvent } from "openai/resources/beta";
import {type RunCreateParamsBaseStream} from "openai/src/lib/AssistantStream";
import {z} from "zod";
import {IndexByProp} from "xstate/dist/declarations/src/types";
import {FromDefault} from "./options";
import {azureOpenAI} from "./providers/openai";
import {fromEventAsyncGenerator} from "../stream";
import {ObservableActorLogic} from "xstate";
export type AssistantStreamEventMap =   IndexByProp<AssistantStreamEvent, "event">
type ThreadMessageCompleted = AssistantStreamEventMap["thread.message.completed"];
type ThreadMessageDelta = AssistantStreamEventMap["thread.message.delta"];
type AssitantOptions = RunCreateParamsBaseStream  & {thread_id: string};
type AssistantEventObject =  AssistantStreamEvent extends {event: infer Event, data: infer Data} ? {
    type: Event;
} & Data : never;

type AssistantEmittedEventObject =  {type:"text-delta", event: string, data: string} | {type: "image-url", event: string, data: string} | {type: "image-file", event: string, data: string} | {type: "thread.run.requires_action", event: string, data: {id: string, required_action: {type: "submit_tool_outputs", submit_tool_outputs: {tool_calls: {function: {name: string, arguments: string}}[]}}}} | {type: "thread.message.delta", event: string, data: ThreadMessageDelta} | {type: "thread.message.completed", event: string, data: ThreadMessageCompleted} | {type: "thread.run.completed", event: string, data: {id: string, output: string}} | {type: "thread.run.requires_action", event: string, data: {id: string, required_action: {type: "submit_tool_outputs", submit_tool_outputs: {tool_calls: {function: {name: string, arguments: string}}[]}}}} | {type: "thread.run.completed", event: string, data: {id: string, output: string}};

export function fromOpenAIAssistant <TDefaultOptions extends Partial<AssitantOptions>, TOptions extends FromDefault<AssitantOptions, TDefaultOptions > =FromDefault<AssitantOptions, TDefaultOptions > , TEvent extends AssistantEventObject =AssistantEventObject>(defaultOptions?: TDefaultOptions){
    const client =azureOpenAI();

    function* emitMessageDelta(data: ThreadMessageDelta["data"], emit: (emitted: AssistantEmittedEventObject) => void) {
        if (data.delta.content) {
            for (const delta of data.delta.content) {
                if (delta.type === 'text') {
                    emit({type: 'text-delta', event: `@${data.id}.text-delta`, data: delta.text!.value!})
                }
                if (delta.type === 'image_url') {
                    emit({type: 'image-url', event: `@${data.id}.image-url`, data: delta.image_url!.url!})
                }
                if (delta.type === 'image_file') {
                    emit({
                        type: 'image-url',
                        event: `@${data.id}.image_file`,
                        data: delta.image_file!.file_id!
                    })
                }
            }
        }
    }

    return fromEventAsyncGenerator(async function * ({input, self, emit, system}){

        const {thread_id, ...options} = {
            ...defaultOptions,
            ...(input || {})
        } as AssitantOptions;

        const stream = client.beta.threads.runs.stream(thread_id,  options);
        for await (const {event, data, ...part} of stream) {
            yield {
                ...data,
                type: event,
                ...part
            }
            if (event === 'thread.message.delta') {
                emitMessageDelta(data, emit);
            }

            if (event === 'thread.run.requires_action' && data?.required_action?.type === 'submit_tool_outputs') {
                const tool_outputs = data.required_action.submit_tool_outputs.tool_calls.map((toolCall: any) => {
                    return system.get(toolCall.function.name)?.send(JSON.parse(toolCall.function.arguments));
                });

                client.beta.threads.runs.submitToolOutputsStream(
                    thread_id,
                    data?.id,
                    {tool_outputs},
                )
            }
        }
    }) satisfies ObservableActorLogic<AssistantEventObject, TOptions, AssistantEmittedEventObject>
}