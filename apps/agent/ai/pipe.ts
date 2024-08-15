import {CoreTool, streamText, TextStreamPart} from "ai";
import {ObservableActorLogic} from "xstate";
import {aiOptions, FromDefault, OneOf, StreamTextOptions} from "./options";
import {fromEventAsyncGenerator} from "../stream";

type PipeToAIStreamInput =StreamTextOptions & {stream: AsyncGenerator<any> }

function historyFormat(history: { input: string; ai: TextStreamPart<any>[] }[]) {
    return JSON.stringify(history.map(({input, ai}) => ({
            input,
            ai: {
                text: ai.filter(a => a.type == "text-delta").map(a => a.textDelta).join(""),
                tools: ai.filter(a => a.type == "tool-result").map(a => ({
                    tool: a.toolName,
                    args: a.args,
                    result: a.result
                }))
            }
        }
    )));
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
