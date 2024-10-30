import {ActorRefFrom, ActorSystem, AnyEventObject, ObservableActorLogic} from "xstate";
import { fromEventAsyncGenerator} from "./generator";
import {batchAsync, BatchAsyncParams, mapAsync} from "./monads";


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


