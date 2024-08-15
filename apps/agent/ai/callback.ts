import {CoreTool, streamText, TextStreamPart} from "ai";
import {CallbackActorLogic, fromCallback} from "xstate";
import {aiOptions, FromDefault, OneOf, StreamTextOptions} from "./options";
import {history, waitForHistory} from "./pipe";
type CallbackInput =StreamTextOptions & {type: string }
export function fromAIEventCallback<TDefaultOptions extends Partial<CallbackInput>, TOptions extends FromDefault<CallbackInput, TDefaultOptions > =FromDefault<CallbackInput, TDefaultOptions >, TTools extends OneOf<TOptions, TDefaultOptions, "tools" > & Record<string, CoreTool> =OneOf<TOptions, TDefaultOptions, "tools" > & Record<string, CoreTool>>( defaultOptions?: TDefaultOptions) {
    return fromCallback(  ({input, receive, sendBack, self}) => {
      
        const chatHistory=history();
        receive(event => {
            const stream = async () => {

                const context = self._parent?.getSnapshot()?.context;
                await waitForHistory(chatHistory.history);

                const {type, ...options} = await aiOptions ({
                    ...context,
                    ...event,
                    history: chatHistory.format()
                }, defaultOptions, input  );


                if (event.type ===  type) { 
                    console.log("ai-callback", {
                        prompt: options.prompt,
                        history: chatHistory.format()
                    });

                    const historyChunk=chatHistory.push(event);
                    const {fullStream, text} = await streamText(options);
                    for await (const part of fullStream) { 
                        sendBack(part);
                        historyChunk.ai.push(part);
                    }
                    
                    sendBack({
                        type: 'output',
                        output: await text
                    })
                }
            }

            const _ =stream(); 
        })
    }) satisfies CallbackActorLogic<TextStreamPart<TTools> | { type: "output", output: string }, FromDefault<CallbackInput, TDefaultOptions>   >
}
