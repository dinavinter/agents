import {VNodeAny} from "atomico/types/vnode";
import {CallbackActorLogic, fromPromise, PromiseActorLogic} from "xstate";
import {LottiePlayer} from "lottie-web";
import { z } from "zod";
import {jsonSchemaToZod} from "json-schema-to-zod";
import {EventMessage} from "fastify-sse-v2";
import {TextStream} from "./components/text";
import {Streamable} from "./components/streamable";
import {Atomico} from "atomico/types/dom";

export type html<R = any>={(
        strings: TemplateStringsArray,
        ...values: any[]
    ): R;}

export type streamOptions={href: string, htmlStream: Atomico<any,any, any> ; textStream:Atomico<any,any, any> ; }
export type streamFactory= (id?: string, 
                            map?: (e:any)=> string | undefined) => streamOptions;
export type stream = streamFactory & streamOptions & {
    service:streamFactory; 
    event:(type:string,parse?:(e:any)=>EventMessage)=>streamOptions
 
};
export type render= {
    (html: html, stream:stream ): VNodeAny;
}

export type RenderEvent = {
    type: "render";
    node?: VNodeAny;
    render: render;
}
export type renderActor = PromiseActorLogic< void, {render:render}  >;
// const render:renderActor = fromPromise(({input:{render}})=> {
//     return new Promise((resolve) => {
//         controller.enqueue(render(html).render());
//         resolve()
//     })
// })

export type renderCallbackActor = CallbackActorLogic< RenderEvent  , {
    render?:render,
    slug?:string
} | undefined>;

export type animateCallbackActor = CallbackActorLogic< {type: "animate", lottie: LottiePlayer }  >;

export type StreamActorLogic=CallbackActorLogic<EventMessage & {type: "event"} > & {
    href: string;
}
