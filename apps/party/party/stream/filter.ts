import {EventObject} from "xstate";
// filter ts playground, not in use - filterAsync, filterEventAsync  that in used are in ./monads.ts 

type When<T, Predicate extends (value: T) => boolean> = T extends Predicate ? T : never;

type Filtered<Filter extends (value:any) => boolean, TIn =Parameters<Filter>[0], TOut = When<TIn, Filter> >= {
    in: TIn,
    out: TOut
}

export async function * filterAsync<TFilter extends (value:any) => boolean, T extends Filtered<TFilter>["in"]=Filtered<TFilter>["in"]>(stream: AsyncIterable<T>, filterFn: TFilter  ): AsyncGenerator<Filtered<TFilter>["out"]> {
    for await (const event of stream) {
        if (filterFn(event)) {
            yield event as Filtered<TFilter>["out"]; 
        }
    }
}


export async function * filterEventAsync<T extends EventObject, TType extends T["type"]>(stream: AsyncIterable<T>, ...type: TType[]) {
    function isType(event: T): event is  T & { type: TType } {
        return type.includes(event.type as TType);
    }

    yield* filterAsync(stream, isType);
}