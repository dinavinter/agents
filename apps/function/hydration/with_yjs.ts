import type {
    ActionArgs,
    ActionFunction,
    AnyEventObject,
    Assigner,
    LowInfer,
    MachineContext,
    ParameterizedObject,
    PropertyAssigner,
    ProvidedActor,
} from "https://deno.land/x/xstate";
import type {
    ActionWithArgs,
    AnyActorLogic,
    AnyStateMachine,
    CallbackActorLogic,
    EventObject,
    InspectionEvent,
    Observer,
    Snapshot,
} from "https://deno.land/x/xstate";
import { azure } from "https://esm.sh/@ai-sdk/azure";
import {
    fromEventAsyncGenerator,
    yArrayIterator,
} from "https://esm.sh/@cxai/stream@1.0.17?target=esnext&yjs=13.6.20";
import { createActor, fromCallback, initialTransition, transition } from "https://esm.sh/xstate@5.19.2?target=esnext";
import * as Y from "https://esm.sh/yjs@^13.6.20?target=esnext";
export type Actions = {
    type: "@yjs.array.push";
    params: string;
} | {
    type: "@yjs.text.append";
    params: string;
} | {
    type: "@yjs.map.set";
    params: string | {
        key:
            | string
            | YJSAssigner<string>;
        value: YJSAssigner<any> | any;
        map: string | YJSAssigner<string>;
    };
} | {
    type: "@yjs.map.delete";
    params: {
        response: string;
    };
};

export type YJSAssigner<T> = <
    TContext extends MachineContext,
    TExpressionEvent extends EventObject,
    TEvent extends EventObject,
>(args: YJSAssignArgs<TContext, TExpressionEvent, TEvent>) => T;

export interface YJSAssignArgs<
    TContext extends MachineContext,
    TExpressionEvent extends EventObject,
    TEvent extends EventObject,
> extends ActionArgs<TContext, TExpressionEvent, TEvent> {
    doc: Y.Doc;
}

export default function withYjs(machine: AnyStateMachine, doc: Y.Doc) {
    return machine.provide({
        actors: {
            "@yjs.sink": fromEventAsyncGenerator(async function*({ input }: { input: Y.Array<EventObject> }) {
                let i = 0;
                for await (const e of yArrayIterator<EventObject>(input)) {
                    yield {
                        id: i++,
                        timestamp: Date.now(),
                        ...e,
                    };
                }
            }),
            "@yjs.produce": fromCallback(async function*({ input, recive }) {
                recive(function(event: EventObject) {
                    input.push([event]);
                });
            }) as CallbackActorLogic<unknown, Y.Array<EventObject>>,
        },
        actions: {
            "@yjs.array.push": ({ event }, params: string) => {
                doc.getArray(params).push([event]);
            },
            "@yjs.text.append": ({ event: { textDelta, data } }, params: string) => {
                doc.getText(params).insert(doc.getText(params).length, textDelta || data);
            },
            "@yjs.map.set": <TEvent extends EventObject = EventObject, TContext = any>(
                { event, context }: { event: TEvent; context: TContext },
                params: {
                    path: string | ((args: { event: TEvent; context: TContext }) => string),
                    key: string | ((args: { event: TEvent; context: TContext }) => string);
                    value: (args: { event: TEvent; context: TContext }) => any | any;
                },
            ) => {
                const key =  typeof params.key === "string"
                        ? params.key
                        : params.key({ event, context });
                const value =   params.value instanceof Function
                        ? params.value({ event, context })
                        : event;
                
                 const path = typeof params.path  === "string" ?
                     params.path :
                         params.path({ event, context })
                doc.getMap(path).set(key, value);
            },
            "@yjs.map.delete": ({ event }, params: string) => {
                doc.getMap(params).delete(event.key);
            },
        },
    });
}