import {EventObject} from "xstate";
import {filterAsync} from "@/iterator";

export async function * filterEventAsync<T extends EventObject, TType extends T["type"], TFiltered extends  T & {type:TType}>(stream: AsyncIterable<T>, ...type: TType[]): AsyncGenerator<TFiltered> {
    function isType(event: T): event is TFiltered {
        return type.includes(event.type as TType);
    }
    yield * filterAsync(stream, isType);
}