import {CoreTool, streamText, TextStreamPart} from "ai";
import {fromEventAsyncGenerator} from "./async-generator";
import {ObservableActorLogic} from "xstate";
import {PromptTemplate} from "@langchain/core/prompts";
   



export function fromAIEventStream<TDefaultOptions extends Partial<StreamingWithTemplate>, TOptions extends FromDefault<StreamingWithTemplate, TDefaultOptions > =FromDefault<StreamingWithTemplate, TDefaultOptions >, TTools extends OneOf<TOptions, TDefaultOptions, "tools" > & Record<string, CoreTool<any, any>> =OneOf<TOptions, TDefaultOptions, "tools" > & Record<string, CoreTool<any, any>>>( defaultOptions?: TDefaultOptions){
    return fromEventAsyncGenerator( async function * ({input, self}){
        console.log('context context', self._parent?.getSnapshot()?.context)
        const resolvedOptions = await resolveOptions(self._parent?.getSnapshot()?.context, defaultOptions, input);
        const {fullStream, text} = await streamText(resolvedOptions);
        for await (const part of fullStream){
            yield part;
        }
        yield  {
            type: 'done',
            output: await text
        } 
    }) satisfies ObservableActorLogic<TextStreamPart<TTools>| {type:"done", output:string}, TOptions | string, TextStreamPart<TTools> >

}
async function resolveOptions<TDefaultOptions extends Partial<StreamingWithTemplate>>(context:  any, defaultOptions: TDefaultOptions | undefined, input:FromDefault<StreamingWithTemplate, TDefaultOptions> | string ) {

    const options = typeof input === 'string' ? {template: input} : input;
    const resolvedOptions = {
        ...defaultOptions,
        ...options
    } as StreamingWithTemplate;


    const {template, prompt } = resolvedOptions; 
    
        
    resolvedOptions.prompt = template && await PromptTemplate.fromTemplate(template as unknown as string).format( context) || prompt;
    return resolvedOptions;
}


export type OneOf<T,T2, Key extends string> =  Key extends keyof T ? T[Key] :  Key extends keyof T2 ? T2[Key] : any;

type StreamTextOptions = Parameters<typeof streamText>[0];

type StreamingWithTemplate= StreamTextOptions & {template?: string} ;

type FromDefault<TOptions, TDefault extends Partial<TOptions>> =  Omit<TOptions ,keyof TDefault> & Partial<TOptions>;








/*
extending logic actor example:
function withLogging<T extends AnyActorLogic>(actorLogic: T) {
const enhancedLogic = {
...actorLogic,
transition: (state, event, actorCtx) => {
  console.log('State:', state);
  return actorLogic.transition(state, event, actorCtx);
},
} satisfies T;

return enhancedLogic;
}*/
       

     