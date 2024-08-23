import {c, html} from "atomico";
import {TextStream} from "./components/text";
import {Streamable} from "./components/streamable";
import {Atomico} from "atomico/types/dom";
import {VNode, VNodeAny} from "atomico/types/vnode";
import {ActionArgs, emit, EventObject, MachineContext, type ParameterizedObject, sendTo} from "xstate";
import {EventMessage} from "fastify-sse-v2";
import {JsonStream, JsonStreamLog} from "./components/json";


export type StreamOptions ={ html: Atomico<any,any, any> ; text:Atomico<any,any, any> ; json:Atomico<any,any, any> ; href:string};
export type RenderStream = StreamOptions & {
    service:(id?: string) => RenderStream;
    event:(type:string)=>StreamOptions

};

export function agentStream(agent:string, workflow: string ):RenderStream {
    const href = `/agents/${agent}/${workflow}`;
    return {
        href,
        event: (type: string) => streamElements(workflow, `${href}/events/${type}`),
        service: (id?: string) => workflowStream(`${href}/${id}` ),
        html: streamElements(href).html,
        text: streamElements(href).text,
        json: streamElements(href).json
    }
}
export function workflowStream(workflow: string ):RenderStream {
    return {
        href: workflow,
        event: (type: string) => streamElements(workflow, `events/${type}`),
        service: (id?: string) => workflowStream(`${workflow}/${id}` ),
        html: streamElements(workflow).html,
        text: streamElements(workflow).text,
        json: streamElements(workflow).json
    }
}
export function streamElements(workflow: string, slug?: string | undefined):StreamOptions {
    const href = `${workflow}${slug ? `/${slug}` : ''}`;

     return {
         href,
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
        }),
         json:c(({src}) => html`
          <host shadowDom>${src}</host>`, {
             props: {
                 src: {type: String, reflect: true, value: href}
             },
             base: JsonStream
         }),
    }
}



//render action

export type Html<R = any>={(
        strings: TemplateStringsArray,
        ...values: any[]
    ): R;}


export type NodeExpression<TContext extends MachineContext, TExpressionEvent extends EventObject, TParams extends ParameterizedObject['params'] | undefined, TEvent extends EventObject>=(args:ActionArgs<TContext, TExpressionEvent, TEvent> & {stream:RenderStream , html:Html},params:TParams) => VNodeAny;

export function render<TContext extends MachineContext & {stream?: RenderStream }, TExpressionEvent extends EventObject, TParams extends ParameterizedObject['params'] | undefined, TEvent extends EventObject >( nodeOrExpr:NodeExpression<TContext, TExpressionEvent, TParams, TEvent>  | VNodeAny, ) {
    return renderTo('render', nodeOrExpr)
}




export function renderTo<TContext extends MachineContext & {stream?: RenderStream }, TExpressionEvent extends EventObject, TParams extends ParameterizedObject['params'] | undefined, TEvent extends EventObject >(type:string, nodeOrExpr:NodeExpression<TContext, TExpressionEvent, TParams, TEvent>  | VNodeAny, ) {
    const expr = typeof nodeOrExpr === 'function' ? nodeOrExpr : () => nodeOrExpr;
    return emit(({context, self, ...args}: ActionArgs<TContext, TExpressionEvent, TEvent>, params: TParams) => {
        const selfId = self.id;
        const node = expr({
            stream: context?.stream || workflowStream(selfId),
            self,
            html, ...args,
            context: context
        }, params);
        return renderEvent(type,node);
    })

    function renderEvent(type:string, node:VNode<Element>) {
        const rendered = node.render() as unknown as {
            type: string,
            name: string,
            nodeName: string,
            attributes: any,
            innerHTML: string,
            outerHTML: string,
        };
        const event = {
            type: type,
            event: type,
            data: rendered.toString(),
        } satisfies EventMessage & { type: typeof type, event: string}
        console.log(event);
        return event 
    }


}