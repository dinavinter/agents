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
