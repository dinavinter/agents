import {teeAsync} from "./monads";

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