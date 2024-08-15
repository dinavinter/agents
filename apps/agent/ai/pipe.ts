import {CoreTool, streamText, TextStreamPart} from "ai";
import {ObservableActorLogic} from "xstate";
import {aiOptions, FromDefault, OneOf, StreamTextOptions} from "./options";
import {fromEventAsyncGenerator} from "../stream";

type PipeToAIStreamInput =StreamTextOptions & {stream: AsyncGenerator<any> }

export function historyFormat(history: { input: any; ai: TextStreamPart<any>[] }[]) {
    return history.map(({input, ai}) => ({
        tools: ai.reduce((acc, a) => {
            if(a.type == "tool-result"){
                acc[a.toolName] = {
                    ...(acc[a.toolName] || {}),
                    args: a.args,
                    result: a.result
                }
            }
            if(a.type == "tool-call"){
                acc[a.toolName] = {
                    ...(acc[a.toolName] || {}),
                    args: a.args
                }
            }  
            return acc;
        }, {} as Record<string, {args: any, result: any}>),
        text: ai.filter(a => a.type == "text-delta").map(a => a.textDelta).join(""),
        input
  })) .filter(({text, tools})=>text || Object.keys(tools).length)
}

export async function waitForHistory(history:{input:any, ai:TextStreamPart<any>[]}[]) {
    for (const {input, ai} of history) {
      while (!ai.find(a => a.type == "finish")) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
}
    

export const history = (maximumSize:number = 10)=>{
    const history:{input:any, ai:TextStreamPart<any>[]}[] = [];
    return {
        push(input: any) {
            const chunkHistory={input, ai:[] as TextStreamPart<any>[]};
            history.push(chunkHistory);
            if(chunkHistory.ai.length>maximumSize){
                history.shift();
            }
            return chunkHistory;
        } ,
        format(){
            return historyFormat(history);
        },
        history
    }
        
}

export function pipeToAI<TDefaultOptions extends Partial<PipeToAIStreamInput>, TOptions extends FromDefault<PipeToAIStreamInput, TDefaultOptions > =FromDefault<PipeToAIStreamInput, TDefaultOptions >, TTools extends OneOf<TOptions, TDefaultOptions, "tools" > & Record<string, CoreTool<any, any>> =OneOf<TOptions, TDefaultOptions, "tools" > & Record<string, CoreTool<any, any>>>( defaultOptions?: TDefaultOptions) {
    return fromEventAsyncGenerator(async function* ({input, self}) {
        const {stream} = await aiOptions<PipeToAIStreamInput>({
            ...self._parent?.getSnapshot()?.context,
            stream: "",
            history: "[]"
        }, defaultOptions, input)

        const history:{input:string, ai:TextStreamPart<any>[]}[] = [];
        for await (const chunk of stream as unknown as AsyncGenerator<any>) {
            const resolvedOptions = await aiOptions<PipeToAIStreamInput>({
                ...self._parent?.getSnapshot()?.context,
                stream: chunk,
                history: historyFormat(history)
            }, defaultOptions, input);
            
            const chunkHistory={input:chunk, ai:[] as TextStreamPart<any>[]};
            history.push(chunkHistory);
            if(chunkHistory.ai.length>10){
                history.shift();
            }
            
            const {fullStream} = await streamText(resolvedOptions);
            
           

            for await (const part of fullStream) {
                yield {
                    ...part,
                    chunk
                };
                chunkHistory.ai.push(part)
            } 

        }
    }) satisfies ObservableActorLogic<TextStreamPart<TTools> | { type: "output", output: string }, TOptions | string, {
        type: "text-delta",
        data: string
    }>
}
