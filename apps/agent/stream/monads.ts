import {pushable, Pushable} from "it-pushable";
import {EventObject} from "xstate";


export async function * mapAsync<T, U>(stream: AsyncIterable<T>, mapFn: (value: T) => U): AsyncGenerator<U> {
    for await (const event of stream) {
        yield mapFn(event);
    }
}

export async function * cloneAsync<T>(stream: AsyncIterable<T>, target: Pushable<T>): AsyncGenerator<T> {
    for await (const event of stream) {
        target.push(event);
        yield event;
    }
}
export   function teeAsync<T>(stream: AsyncIterable<T>): [AsyncIterable<T>,AsyncIterable<T>] {
    const target = pushable<T>({objectMode: true}) ;
    return [cloneAsync(stream, target), target[Symbol.asyncIterator]()];
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

export async function * filterEventAsync<T extends EventObject, TType extends T["type"], TFiltered extends  T & {type:TType}>(stream: AsyncIterable<T>, ...type: TType[]): AsyncGenerator<TFiltered> {
    function isType(event: T): event is TFiltered {
        return type.includes(event.type as TType);
    }
    yield * filterAsync(stream, isType);
}


export type BatchAsyncParams<T>={stream: AsyncIterable<T>, split?:(i:T)=> boolean}
export async function * batchAsync< T extends  any,TIterable extends AsyncIterable<T>=AsyncIterable<T>>(stream: TIterable, split?:(i:T)=> boolean ): AsyncGenerator<T[]> {
    const buffer:T[] = [];
    for await (const event of stream) {
        buffer.push(event);
        if (typeof split == "undefined" || split(event)) {
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
