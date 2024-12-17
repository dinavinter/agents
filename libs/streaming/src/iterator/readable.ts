 
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
