import {fromEventObservable, ObservableActorLogic, toObserver} from "xstate";
import * as Y from "yjs";

export const yTextObservable:ObservableActorLogic<{
    type: "text-delta",
    source: string,
    transaction: Y.Transaction,
    event: Y.YTextEvent
} ,  Y.Text> =fromEventObservable( ({input}:{input: Y.Text}) => {
        return {
            subscribe(observerOrCallback) {
                const observer = toObserver(observerOrCallback);
                const callback = (event: Y.YTextEvent) => {
                    observer.next && observer.next({
                        type: 'text-delta',
                        source: input.toJSON(),
                        transaction: event.transaction,
                        event: event
                    });
                };

                input.observe(callback);
                return {
                    unsubscribe() {
                        input.unobserve(callback);
                    }
                }
            }
        }
    }
)