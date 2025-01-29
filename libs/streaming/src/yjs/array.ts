import * as Y from "yjs";
import { Subscribable, toObserver } from "xstate";
  
 
export type YIterator<T> = AsyncIterable<T> & Subscribable<T> & {length: number, push(e: T): any, raw: Y.Array<T>,pop():T , readableStream: (abortSignal: AbortSignal) => ReadableStream<T>};

export function yArrayIterator<T>(array: Y.Array<T>): YIterator<T> {

    async function* iterateArrayItems() {
        let currentIndex = 0;

        while (true) {
            const [items, nextIndex] = await getNextItems(currentIndex);
            yield* items;
            currentIndex = nextIndex;
        }
    }

    function getNextItems(startIndex: number): Promise<[T[], number]> {
        return new Promise((resolve) => {
            if (startIndex < array.length) {
                resolve([array.slice(startIndex), array.length]);
            } else {
                const callback = (event: Y.YArrayEvent<T>) => {
                    const newItems = event.delta.flatMap(d => d.insert).filter(Boolean);
                    if (newItems.length > 0) {
                        array.unobserve(callback);
                        resolve([newItems, startIndex + newItems.length]);
                    }
                };
                array.observe(callback);
            }
        });
    }

    async function* iterator() {
        yield* iterateArrayItems();
    }
    
    
    
 
    return {
        raw: array,
        length: array.length,
        push: (e: T) => array.push([e]),
        pop: () => array.get(array.length - 1),
        [Symbol.asyncIterator]: iterator,
        readableStream: (abortSignal) => {
            const abortController =  new AbortController()
            function abort() {
                abortController.abort();
                abortSignal.removeEventListener('abort', abort);
            }
            abortSignal.addEventListener('abort', abort);
            
            
            return new ReadableStream<T>({
                async start(controller) { 
                    for await (const event of iterateArrayItems()) {
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
        },
                    
        subscribe: (observerOrCallback) => {
            const observer = toObserver(observerOrCallback);
            const callback = (event: Y.YArrayEvent<T>) => {
                const newItems = event.delta.flatMap(d => d.insert).filter(Boolean);
                newItems.forEach(item => observer.next?.(item));
            };
            array.observe(callback);
            return {
                unsubscribe() {
                    array.unobserve(callback);
                }
            };
        }
    };
}
 


type DeltaItr<T>= {
    index: number;
    value: T | undefined;
    type: "add" | "update" | "delete";
}

function deltaReducer<T>(delta:Y.YArrayEvent<T>["delta"]) {
    return delta.reduce<{
        index: number;
        events: DeltaItr<T>[];
    }>((acc, d) => {
        if (d.retain) {
            acc.index += d.retain;
        }
        for (const insert of d.insert as Array<T> || d.insert as T? [d.insert as T] : []) {
            acc.events.push({
                index: acc.index,
                value: insert,
                type: "add"
            });
            acc.index++;
        }


        for (let i = 0; i < (d.delete || 0); i++) {
            acc.events.push({
                index: acc.index,
                value: undefined,
                type: "delete"
            });
        }


        return acc;
    }, {} as {
        index: number;
        events: DeltaItr<T>[];
    });

}


