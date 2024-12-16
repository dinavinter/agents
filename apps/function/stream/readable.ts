import {EventMessage} from "./hub.ts";
import {transformAsyncIterable} from "./sse.ts";

export function readableStream<T>(iterator:AsyncGenerator<T> ,  abortSignal:AbortSignal)  {
    const abortController =  new AbortController()
    function abort() {
        abortController.abort();
        abortSignal.removeEventListener('abort', abort);
    }
    abortSignal.addEventListener('abort', abort);


    return new ReadableStream<T>({
        async start(controller) {
            for await (const event of iterator) {
                if (abortController.signal.aborted) {
                    return;
                }
                controller.enqueue(event);
            }
        },
        cancel() {
            abortController.abort();
        }
    })
}
export function sseReadableStream<T>(iterator:AsyncGenerator<EventMessage> ,  abortSignal:AbortSignal):ReadableStream  {
    const abortController =  new AbortController()
    function abort() {
        abortController.abort();
        abortSignal.removeEventListener('abort', abort);
    }
    abortSignal.addEventListener('abort', abort);

    const encoder = new TextEncoder();
    return new ReadableStream({
        start(controller) {
            async function pump() {
                for await (const line of transformAsyncIterable(iterator)) {
                    if (abortController.signal.aborted) {
                        return;
                    }
                    controller.enqueue(encoder.encode(line));
                }
            }

            pump().then(r => console.log("done", r)).catch(e => console.error("error", e));

        },
        cancel() {
            abortController.abort();
        }
    })
   

    // return new ReadableStream<T>({
    //     async start(controller) {
    //         for await (const event of iterator) {
    //             if (abortController.signal.aborted) {
    //                 return;
    //             }
    //             controller.enqueue(event);
    //         }
    //     },
    //     cancel() {
    //         abortController.abort();
    //     }
    // })
}
