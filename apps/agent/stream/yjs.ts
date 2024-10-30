import { Subscribable, toObserver } from "xstate";
import * as Y from "yjs";

export type YIterator<T> = AsyncIterable<T> & Subscribable<T> & { push(e: T): any, raw: Y.Array<T> };

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
        push: (e: T) => array.push([e]),
        [Symbol.asyncIterator]: iterator,
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
