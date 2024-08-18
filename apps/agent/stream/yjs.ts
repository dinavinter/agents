import {Subscribable, toObserver} from "xstate";
import * as Y from "yjs";

export type YIterator<T> = AsyncIterable<T> & Subscribable<T> &{push(e:T): any, raw:Y.Array<T>};
export function yArrayIterator<T>(array:Y.Array<T>):YIterator<T> {
    async function * newItems() {
        while (true) {
            const newItems = await new Promise<T[]>((resolve) => {
                const callback = (event: Y.YArrayEvent<T>) => {
                    const newItems = event.delta.flatMap(d => d.insert).filter(i => i);
                    if (newItems.length > 0) {
                        array.unobserve(callback)
                        resolve(newItems);
                    }
                }
                array.observe(callback)
            })

            for (const item of newItems) {
                yield item;
            }
        }
    }
    async  function  * iterator() {
        for (let i = 0; i < array.length; i++) {
            yield array.get(i);
        }

        yield * newItems();

    }
    return {
        raw: array,
        push: (e:T) => array.push([e]),
        [Symbol.asyncIterator]:  iterator,
        subscribe: (observerOrCallback) => {
            const observer = toObserver(observerOrCallback);
            const callback = (event: Y.YArrayEvent<T>) => {
                for (const item of event.delta.flatMap(d => d.insert)) {
                    if (item && observer.next)
                        observer.next(item);
                }
            }
            array.observe(callback)
            return {
                unsubscribe() {
                    array.unobserve(callback)
                }
            }
        }
    }
}