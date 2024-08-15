import {c, html} from "atomico";
import {TextStream} from "./components/text";
import {Streamable} from "./components/streamable";
import {Atomico} from "atomico/types/dom";
import {VNodeAny} from "atomico/types/vnode";
import {ActionArgs, emit, EventObject, MachineContext, type ParameterizedObject} from "xstate";


export type StreamOptions ={ html: Atomico<any,any, any> ; text:Atomico<any,any, any> ; }
export type RenderStream = StreamOptions & {
    service:(id?: string) => RenderStream;
    event:(type:string)=>StreamOptions

};

export function workflowStream(workflow: string ):RenderStream {
    return {
        event: (type: string) => streamElements(workflow, `events/${type}`),
        service: (id?: string) => workflowStream(`${workflow}/${id}` ),
        html: streamElements(workflow).html,
        text: streamElements(workflow).text
    }
}
export function streamElements(workflow: string, slug?: string | undefined):StreamOptions {
    const href = `${workflow}${slug ? `/${slug}` : ''}`;

     return { 
         text:c(({src}) => html`
          <host shadowDom>${src}</host>`, {
            props: {
                src: {type: String, reflect: true, value: href}
            },
            base: TextStream
        }), 
         html:c(({src}) => html`
          <host shadowDom>${src}</host>`, {
            props: {
                src: {type: String, reflect: true, value: href}
            },
            base: Streamable
        })
    }
}



//render action

export type Html<R = any>={(
        strings: TemplateStringsArray,
        ...values: any[]
    ): R;}



export type RenderEvent = {
    type: "render";
    node?: VNodeAny;
}

export type NodeExpression<TContext extends MachineContext, TExpressionEvent extends EventObject, TParams extends ParameterizedObject['params'] | undefined, TEvent extends EventObject>=(args:ActionArgs<TContext, TExpressionEvent, TEvent> & {stream:RenderStream , html:Html},params:TParams) => VNodeAny;

export function render<TContext extends MachineContext & {stream?: RenderStream }, TExpressionEvent extends EventObject, TParams extends ParameterizedObject['params'] | undefined, TEvent extends EventObject >( nodeOrExpr:NodeExpression<TContext, TExpressionEvent, TParams, TEvent>  | VNodeAny) {
    const expr = typeof nodeOrExpr === 'function' ? nodeOrExpr : () => nodeOrExpr;
    return  emit(({context, self,...args}: ActionArgs<TContext, TExpressionEvent, TEvent>, params:TParams) => ({
        type: 'render',
        node:  expr({stream:context?.stream || workflowStream(self.id) ,self, html, ...args, context:context}, params)
    }) satisfies RenderEvent)
}  