import {VNodeAny} from "atomico/types/vnode";
import {CallbackActorLogic, fromPromise, PromiseActorLogic} from "xstate";

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
