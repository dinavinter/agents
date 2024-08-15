import {
    ActorSystem,
    AnyEventObject,
    EventObject,
    fromEventObservable,
    fromObservable, fromPromise,
    NonReducibleUnknown,
    ObservableActorLogic,
    ObservableActorRef,
    Observer,
    PromiseActorLogic,
    type Subscription,
    toObserver
} from "xstate";
import {pushable,Pushable} from "it-pushable";


 
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

    
export function fromEventAsyncGenerator <TContext extends EventObject, TInput extends NonReducibleUnknown, TEmitted extends EventObject = EventObject>(generatorCreator: ({ input, system, self,emit }: {
    input: TInput;
    system: ActorSystem<any>;
    self: ObservableActorRef<TContext>;
    emit: (emitted: TEmitted) => void;
}) => AsyncGenerator<TContext> | Promise<AsyncGenerator<TContext>>): ObservableActorLogic<TContext, TInput, TEmitted> {
    return fromEventObservable((actionArgs) => {
        const iterator = generatorCreator(actionArgs);
        const observers = new Set<Observer<TContext>>();
        (async () => {
            for await (const event of await iterator) {
                for (const observer of observers) {
                    observer.next?.call(observer, event);
                }
            }
            for (const observer of observers) {
                observer.complete?.call(observer);
            }
        })();

        return {
            subscribe(callback): Subscription {
                const observer = toObserver(callback);
                observers.add(observer);
                return {
                    unsubscribe() {
                        observers.delete(observer);
                    }
                }
            }
        };
    })
}

export const asyncEventGenerator = fromEventAsyncGenerator(async function* ({ input }:{input:AsyncIterable<AnyEventObject>}) {
    yield* input;
})


export function fromAsyncGenerator <TContext, TInput extends NonReducibleUnknown, TEmitted extends EventObject = EventObject>(generatorCreator: ({ input, system, self }: {
    input: TInput;
    system: ActorSystem<any>;
    self: ObservableActorRef<TContext>;
    emit: (emitted: TEmitted) => void;
}) => AsyncGenerator<TContext>): ObservableActorLogic<TContext, TInput, TEmitted> {
    return  fromObservable((actionArgs) => {
        const iterator = generatorCreator(actionArgs);
        const observers = new Set<Observer<TContext>>();
        (async () => {
            for await (const event of iterator) {
                for (const observer of observers) {
                    observer.next?.call(observer, event);
                }
            }
            for (const observer of observers) {
                observer.complete?.call(observer);
            }
        })();

        return {
            subscribe(callback ): Subscription {
                const observer= toObserver(callback);
                observers.add(observer);
                return {
                    unsubscribe() {
                        observers.delete(observer);
                    }
                }
            }
        };
    })
}
export const asyncGenerator = fromAsyncGenerator(async function* ({ input }:{input:AsyncIterable<any>}) {
    yield* input;
})






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


export async function * filterEventAsync<T extends EventObject, TType extends T["type"], TFiltered extends  T & {type:TType}>(stream: AsyncIterable<T>, ...type: TType[]): AsyncGenerator<TFiltered> {
    function isType(event: T): event is TFiltered {
        return type.includes(event.type as TType);
    }
    yield * filterAsync(stream, isType);
}
