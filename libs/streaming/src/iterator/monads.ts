import {pushable, Pushable} from "it-pushable";


export async function * mapAsync<T, U>(stream: AsyncIterable<T>, mapFn: (value: T) => U | PromiseLike<U>): AsyncGenerator<U> {
    for await (const event of stream) {
        yield await mapFn(event);
     }
}

export async function * cloneAsync<T>(stream: AsyncIterable<T>, target: Pushable<T>): AsyncGenerator<T> {
    for await (const event of stream) {
        target.push(event);
        yield event;
    }
}

export async function * joinAsync(stream: AsyncIterable<string[]>, separator?:string ): AsyncGenerator<string> {
    return mapAsync(stream, (value) => value.join(separator));
}

export async function * splitAsync(stream: AsyncIterable<string>, ...separator: string[]): AsyncGenerator<string> {
    let buffer = '';
    for await (const event of stream) {
        buffer += event;
        const s=separator.filter(s=>event.includes(s));
        if(s.length > 0) {
            const parts = buffer.split(s[0]);
            yield parts.join('');
        }
    }
}






export async function * filterAsync<T, TFiltered extends T>(stream: AsyncIterable<T>, filterFn: (value: T) => value is TFiltered  ): AsyncGenerator<TFiltered> {
    for await (const event of stream) {
        if (filterFn(event)) {
            yield event;
        }
    }
}






export async function* castAsync<T>(e: AsyncIterable<any>) {
    for await (const value of e) {
        yield value as T;
    }
}

export type BatchAsyncParams<T>={stream: AsyncIterable<T>, split?:(i:T)=> boolean}
export async function * batchAsync< T extends  any,TIterable extends AsyncIterable<T>=AsyncIterable<T>>(stream: TIterable, split?:(current:T, buffer:T[])=> boolean ): AsyncGenerator<T[]> {
    const buffer:T[] = [];
    for await (const event of stream) {
        buffer.push(event);
        if (typeof split == "undefined" || split(event, buffer)) {
            yield buffer.splice(0, buffer.length - 1)
        }
    }
}

export async function * delayAsync<T>(stream: AsyncIterable<T>, ms= 50): AsyncGenerator<T> {
    for await (const value of stream) {
        await new Promise((resolve) => setTimeout(resolve, ms));
        yield value;
    }
}


/* in use? */
export   function teeAsync<T>(stream: AsyncIterable<T>): [AsyncIterable<T>,AsyncIterable<T>] {
    const target = pushable<T>({objectMode: true}) ;
    return [cloneAsync(stream, target), target[Symbol.asyncIterator]()];
}

export   function teePushableAsync<T>(stream: Pushable<T>): [AsyncIterable<T>, Pushable<T>] {
    const target = pushable<T>({objectMode: true}) ;
    return [cloneAsync(stream, target), target];
}



export  function concatAsync<T>(...streams: AsyncIterable<T>[]): AsyncGenerator<T> {
    const p = pushable<T>({objectMode: true});
    for (const stream of streams) {
        cloneAsync(stream, p);
    }
    return p;
}


export  function  flatAsync<T>(composed:AsyncGenerator<AsyncGenerator<T>>): AsyncGenerator<T> {
    const p = pushable<T>({objectMode: true});
    (async () => {
        for await (const stream of composed) {
            (async () => {
                for await (const value of stream) {
                    p.push(value);
                }
            })().catch(console.error);
        }
    })();
    return p;
}
