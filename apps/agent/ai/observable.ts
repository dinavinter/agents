import {CoreTool, streamText, TextStreamPart} from "ai";
import {ObservableActorLogic} from "xstate";
import {fromEventAsyncGenerator} from "../stream";
import {aiOptions, FromDefault, OneOf, StreamTextOptions} from "./options";


export function fromAIEventStream<TDefaultOptions extends Partial<StreamTextOptions>, TOptions extends FromDefault<StreamTextOptions, TDefaultOptions > =FromDefault<StreamTextOptions, TDefaultOptions >, TTools extends OneOf<TOptions, TDefaultOptions, "tools" > & Record<string, CoreTool> =OneOf<TOptions, TDefaultOptions, "tools" > & Record<string, CoreTool>>( defaultOptions?: TDefaultOptions){
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