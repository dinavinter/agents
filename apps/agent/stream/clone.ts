import {teeAsync, teePushableAsync} from "./monads";
import {Pushable} from "it-pushable";

export type Clonable<T> =  T &{
    source: T
    clone(this:Clonable<T>): T;
}

export function cloneable<T >(source: AsyncIterable<T>):Clonable<AsyncIterable<T>> {
    const stream = {
        source: source ,
        ...source,
        clone(this:Clonable<AsyncIterable<T>>) {
            const [clone1, clone2] =  teeAsync<T>(this.source);
            this.source = clone2
            return clone1;
        }
    }

    stream.clone = stream.clone.bind(stream);
    return stream;

}


export type PushableCloneable<T> = {
    source: Pushable<T>;
    clone(this:PushableCloneable<T>): AsyncIterable<T>;
    push(value: T): Pushable<T>;
}

export function clonePushable<T >(source: Pushable<T>):PushableCloneable<T> {
    const stream = {
        source: source ,
        ...source,
        clone(this) {
            const [clone1, clone2] =  teePushableAsync(this.source);
            this.source = clone2
            return clone1;
        },
        push: (value: T) => {
            return  source.push(value);
        }
    } satisfies PushableCloneable<T>

    stream.clone = stream.clone.bind(stream);
    return stream;

}



