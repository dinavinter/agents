import {ActorRefFrom, ActorSystem, AnyEventObject, ObservableActorLogic} from "xstate";
import { fromEventAsyncGenerator, mapAsync} from "./async-generator";


type MergeEvents<TIn , TOut > = {
    (events: TIn[]): TOut
}


type AsyncBatchEventsInput<TIn extends AnyEventObject, TOut extends AnyEventObject> = {
    merge?: MergeEvents<TIn, TOut>;
}& BatchAsyncParams<TIn>

type AsyncBatchEventsGenerator<TIn extends AnyEventObject=AnyEventObject, TOut extends AnyEventObject=AnyEventObject, TInput extends AsyncBatchEventsInput<TIn, TOut>=AsyncBatchEventsInput<TIn, TOut> >= {
    ({input, system, self, emit}:{
        input: TInput;
        system: ActorSystem<any>;
        self:  ActorRefFrom<ObservableActorLogic<TOut, TInput>>;
        emit: (emitted: AnyEventObject) => void;
    }):AsyncGenerator<TIn> | Promise<AsyncGenerator<TIn>>
}

function defaultMerge<TIn>( events: TIn[]) {
    return {
        type: `batch`,
        batch: events
    }
}

export function fromAsyncBatchEventGenerator<TIn extends AnyEventObject=AnyEventObject, TOut extends AnyEventObject=AnyEventObject, TInput extends AsyncBatchEventsInput<TIn, TOut>=AsyncBatchEventsInput<TIn, TOut>>(generator:  ({input, system, self, emit}: {
    input: TInput;
    system: ActorSystem<any>;
    self:  ActorRefFrom<ObservableActorLogic<TOut, TInput>>;
    emit: (emitted: AnyEventObject) => void;
})=> AsyncGenerator<TIn>  | Promise<AsyncGenerator<TIn>>) {
    return fromEventAsyncGenerator<TOut, TInput>(async function* ({input, system, self, emit}) {
        const merge = input.merge || defaultMerge  as unknown as MergeEvents<TIn, TOut>

        yield* mapAsync(batchAsync(await generator({input, system, self, emit}),
                input.split),
            merge)

    })

}
export const asyncBatchEvents = fromAsyncBatchEventGenerator( async function* ({input}) {
    for await (const event of input.stream) {
        yield event;
    }
})


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