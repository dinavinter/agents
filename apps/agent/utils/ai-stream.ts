import {CoreTool, streamText, TextStreamPart} from "ai";
import {fromEventAsyncGenerator} from "./async-generator";
import {CallbackActorLogic, fromCallback, ObservableActorLogic} from "xstate";
import {PromptTemplate} from "@langchain/core/prompts";
   
        
export function fromAIEventStream<TDefaultOptions extends Partial<StreamTextOptions>, TOptions extends FromDefault<StreamTextOptions, TDefaultOptions > =FromDefault<StreamTextOptions, TDefaultOptions >, TTools extends OneOf<TOptions, TDefaultOptions, "tools" > & Record<string, CoreTool<any, any>> =OneOf<TOptions, TDefaultOptions, "tools" > & Record<string, CoreTool<any, any>>>( defaultOptions?: TDefaultOptions){
    return fromEventAsyncGenerator( async function * ({input, self, emit}){
        const resolvedOptions = await aiOptions(self._parent?.getSnapshot()?.context, defaultOptions, input);
        const {fullStream, text} = await streamText(resolvedOptions);
        for await (const part of fullStream){
            yield part;
            if(part.type=="text-delta"){
                emit({
                    type: 'text-delta',
                    data: part.textDelta
                }) 
            }
        }
        yield  {
            type: 'output',
            output: await text
        } 
    }) satisfies ObservableActorLogic<TextStreamPart<TTools>| {type:"output", output:string}, TOptions | string, {type:"text-delta", data:string} >

}

type CallbackInput =StreamTextOptions & {type: string }
export function fromAIEventCallback<TDefaultOptions extends Partial<CallbackInput>, TOptions extends FromDefault<CallbackInput, TDefaultOptions > =FromDefault<CallbackInput, TDefaultOptions >, TTools extends OneOf<TOptions, TDefaultOptions, "tools" > & Record<string, CoreTool<any, any>> =OneOf<TOptions, TDefaultOptions, "tools" > & Record<string, CoreTool<any, any>>>( defaultOptions?: TDefaultOptions) {
    return fromCallback(  ({input, receive, sendBack, self, emit}) => {
        receive(event => { 
            const stream = async () => {

                const context = self._parent?.getSnapshot()?.context;
                const {type, ...options} = await aiOptions ({
                    ...context,
                    ...event
                }, defaultOptions, input  );


                if (event.type ===  type) {
                    const {fullStream, text} = await streamText(options);
                    for await (const part of fullStream) {

                        sendBack(part);
                    }
                    sendBack({
                        type: 'output',
                        output: await text
                    })
                }
            }

            stream();



        })
    }) satisfies CallbackActorLogic<TextStreamPart<TTools> | { type: "output", output: string }, FromDefault<CallbackInput, TDefaultOptions>   >
}

export async function aiOptions<TOptions extends StreamTextOptions = StreamTextOptions,TDefaultOptions extends Partial<TOptions> =Partial<TOptions>>(context:  any, defaultOptions: TDefaultOptions | undefined, input:FromDefault<TOptions, TDefaultOptions> | string ) {

    const options = typeof input === 'object' ? input : {template: input}
    const resolvedOptions = {
        ...defaultOptions,
        ...options
    } ; 
    const {template, prompt } = resolvedOptions;
      
    resolvedOptions.prompt = template && await PromptTemplate.fromTemplate(template as unknown as string, {
        templateFormat: 'mustache',
    }).format( context) || prompt;
    return resolvedOptions as TOptions ;
}


export type OneOf<T,T2, Key extends string> =  Key extends keyof T ? T[Key] :  Key extends keyof T2 ? T2[Key] : any;

export type StreamTextOptions = Parameters<typeof streamText>[0]  & {template?: string};


export type FromDefault<TOptions, TDefault extends Partial<TOptions>> =  
    Omit<TOptions ,keyof TDefault> extends Omit<TOptions, "template" | "prompt">?  {
        template?: string,
        prompt?: string
    } | string : 
        Omit<TOptions ,keyof TDefault> &   
        Partial<TOptions> ;









     