import {EventObject, fromPromise, PromiseActorLogic} from "xstate";

export function fromAsyncEventEmitter <TInput extends AsyncIterable<TEmitted>, TEmitted extends EventObject = EventObject>() {
    return fromPromise(async ({input, system, self, emit}) => {
            for await (const event of input) {
                console.log('emitting', event)
                emit(event);
            }
        }
    ) satisfies PromiseActorLogic<void, TInput, TEmitted>
}

const asyncEventEmitter = fromAsyncEventEmitter<AsyncGenerator<EventObject>>();

