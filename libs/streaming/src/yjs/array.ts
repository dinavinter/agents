import * as Y from "yjs";
import {YMapEvent} from "yjs";
export interface Subscribable<T> {
    subscribe(observer: Observer<T>): Subscription;
    subscribe(next: (value: T) => void, error?: (error: any) => void, complete?: () => void): Subscription;
}
export type Observer<T> = {
    next?: (value: T) => void;
    error?: (err: unknown) => void;
    complete?: () => void;
};
export type Handler<T> = (value: T) => void;
export interface Subscription {
    unsubscribe(): void;
}
function toObserver<T =any>(nextHandler:Observer<T> | Handler<T>, errorHandler?: Observer<T>["error"], completionHandler?: Observer<T>["complete"]) {
    const isObserver = typeof nextHandler === 'object';
    const self = isObserver ? nextHandler : undefined;
    return {
        next: (isObserver ? nextHandler.next : nextHandler)?.bind(self),
        error: (isObserver ? nextHandler.error : errorHandler)?.bind(self),
        complete: (isObserver ? nextHandler.complete : completionHandler)?.bind(self)
    };
}
export type YIterator<T> = AsyncIterable<T> & Subscribable<T> & { push(e: T): any, raw: Y.Array<T> , readableStream: (abortSignal: AbortSignal) => ReadableStream<T>};


type ArrayEvent<T>= {
    index: number;
    value: T | undefined;
}
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
        // function transformNew<T>(value:T, index:number):ArrayEvent<T> {
        //     return {
        //         index:startIndex + index,
        //         value
        //     }
        // }
        function transformNew(value:T)  {
            return  value;
        }
        return new Promise((resolve) => {
            if (startIndex < array.length) {
                resolve([array.slice(startIndex).map(transformNew), array.length]);
            } else {
                const callback = (event: Y.YArrayEvent<T>) => {
                    const newItems = event.delta.flatMap(d => d.insert).filter(Boolean);
                    resolve([newItems.map(transformNew), startIndex + newItems.length]);
                    array.unobserve(callback);
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
        push: (e: T) => array.push([e]),
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

        subscribe: (observerOrCallback:Observer<any > |Handler<any>) => {
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


