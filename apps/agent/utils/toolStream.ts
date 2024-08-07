import {
    AnyEventObject,
    CallbackActorLogic,
    CallbackSnapshot,
    EventObject, fromCallback,
    fromObservable, fromPromise,
    ObservableActorLogic,
    Observer, PromiseActorLogic,
    toObserver, Values
} from "xstate";
import {PromptTemplate} from "@langchain/core/prompts";
import {CoreTool, generateObject, streamObject, StreamObjectResult, streamText, StreamTextResult, tool} from "ai";
import {z} from "zod";


type InferTOfGenerateObject<T> = T extends StreamObjectResult<infer R> ? R : never;
export function fromGenerateObject<TOptions extends GenerateObjectOptions<any> =GenerateObjectOptions<any>>(): PromiseActorLogic<any, TOptions > {
    return fromPromise(async ({input: {template, prompt, ...input}, self}) => {

        console.log('generating', {template, prompt, ...input})

        const context = (self._parent?.getSnapshot()).context;
        console.log('generating with context', {context})


        const {partialObjectStream} = await streamObject({
            prompt: template && await PromptTemplate.fromTemplate(template as unknown as string).format(context) || prompt,
            maxRetries:2,
            timeout: 1000, 
            ...input
        });

        let object ; 
       for await (const part of partialObjectStream) {
           console.log('generated', part)
           object = part;
       }
           

        return object;

    }) satisfies PromiseActorLogic<InferTOfGenerateObject<TOptions>, TOptions>
}

export function fromToolCallback<TOptions extends StreamingWithTemplate>(): ToolCallbackActorLogic<TOptions > {
    return fromCallback(({ input: {template, prompt,filter, ...input}, self, sendBack, receive }) => {
        const context = (self._parent?.getSnapshot())?.context  || {};
        receive(async (event) => {
            console.log('callback:receive', event, context, "filter:", filter)

            // if(filter && event.type === filter) {
            console.log('callback:receive', event, context)
            const {toolCall} = await toolsStream(await streamText({
                prompt: template && await PromptTemplate.fromTemplate(template as unknown as string).format({
                    ...context,
                    ...event
                }) || prompt,
                ...input
            }))

            for await (const part of toolCall()) {
                sendBack(part);
            }

            return {done: true}
            // }
        })
    })
}
export function fromToolStream<TOptions extends StreamingWithTemplate, TToolCallEvent = ToolCallEvent<TOptions["tools"] > >(): ToolStreamActorLogic<TOptions >{

    return fromObservable(({ input: {template, prompt, ...input}, self }) => {
        const context = (self._parent?.getSnapshot()).context ;
        const observers = new Set<Observer<TToolCallEvent>>();
        (async () => {

            const result = await streamText({
                prompt: template && await  PromptTemplate.fromTemplate(template as unknown as string).format(context) || prompt,
                ...input
            });

            const {toolResult} =await toolsStream(result);

            // for await (const part of toolCall() ){
            //     observers.forEach((observer) => {
            //         observer.next?.(part);
            //     });
            // }
            for await (const part of toolResult() ){
                console.log('toolResult', part)
                observers.forEach((observer) => {
                    observer.next?.(part);
                });
            }
            for (const observables of observers)
                observables.complete && observables.complete()

        })();
        return {
            subscribe: (...args) => {
                // @ts-ignore
                const observer = toObserver(...args);
                observers.add(observer);
                return {
                    unsubscribe: () => {
                        observers.delete(observer);
                    }
                };
            }
        };
    })
}




export async function toolsStream< TOOLS extends Record<string, CoreTool>, TResult extends StreamTextResult<TOOLS>>(stream:TResult ){

    return {
        async * toolCall():AsyncGenerator<ToolCallEvent<TOOLS>>{
            for await (const part of stream.fullStream) {
                if (part.type === 'tool-call') {
                    yield {
                        ...part.args,
                        code: part.toolCallId,
                        type: part.toolName
                    };
                }
            }
        },
        async * toolResult():AsyncGenerator<ToolResultEvent<TOOLS>>{
            for await (const part of stream.fullStream) {
                if (part.type === 'tool-result') {
                    yield {
                        ...part.args,
                        ...part.result,
                        code: part.toolCallId,
                        type: part.toolName
                    };
                }
            }
        }
    }
}



//types
type GenerateObjectOptions<T>=  Parameters<typeof streamObject<T>>[0] & {template?: string};

type StreamingWithTemplate= StreamTextOptions & {template?: string, filter?:string};
type ToolCallbackActorLogic<TInput extends StreamingWithTemplate, TEmmited extends EventObject = ToolCallEvent<TInput["tools"]>> =CallbackActorLogic<AnyEventObject,   TInput, TEmmited>


type StreamTextOptions = Parameters<typeof streamText>[0];

type ToolStreamActorLogic<TInput extends StreamTextOptions  & {template?: string}, TEmmited extends EventObject = ToolCallEvent<TInput["tools"]>>
    = ObservableActorLogic<any,TInput, TEmmited  >



type ParamsFromTools<T extends CoreTool> = T extends CoreTool<infer P, infer R> ? z.infer<P> : never;
type ResultFromTool<T extends CoreTool> = T extends CoreTool<infer P, infer R> ? R : never;

type ToolCallEvent<Tools extends Record<string, CoreTool> | undefined> =  Tools extends Record<infer K, CoreTool> ? {
    type: K
} & ParamsFromTools<Tools[K]> : never



type ToolResultEvent<Tools extends Record<string, CoreTool>> =  Tools extends Record<infer K, CoreTool> ? {
    type: K
} & ResultFromTool<Tools[K]> : never