import {VNodeAny} from "atomico/types/vnode";
import {CallbackActorLogic, fromPromise, PromiseActorLogic} from "xstate";
import {LottiePlayer} from "lottie-web";
import { z } from "zod";
import {jsonSchemaToZod} from "json-schema-to-zod";
import {EventMessage} from "fastify-sse-v2";

export type html<R = any>={(
        strings: TemplateStringsArray,
        ...values: any[]
    ): R;}

export type render= {
    (html: html): VNodeAny;
}
export type renderActor = PromiseActorLogic< void, {render:render}  >;
// const render:renderActor = fromPromise(({input:{render}})=> {
//     return new Promise((resolve) => {
//         controller.enqueue(render(html).render());
//         resolve()
//     })
// })

export type renderCallbackActor = CallbackActorLogic< {type: "render", node: VNodeAny }  >;

export type animateCallbackActor = CallbackActorLogic< {type: "animate", lottie: LottiePlayer }  >;

export type StreamActorLogic=CallbackActorLogic<EventMessage & {type: "event"} >
