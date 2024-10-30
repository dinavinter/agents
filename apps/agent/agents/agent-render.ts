import {c, html} from "atomico";
import {Atomico} from "atomico/types/dom";
import {VNode, VNodeAny} from "atomico/types/vnode";
import {ActionArgs, emit, EventObject, MachineContext, type ParameterizedObject, sendTo} from "xstate";
import {EventMessage} from "fastify-sse-v2";
import {JsonStream, TextStream} from "../components";


export type StreamOptions ={ html: Atomico<any,any, any> ; text:Atomico<any,any, any> ; json:Atomico<any,any, any> ; href:string
   connect: (options?:{event?:string, swap?:string}) => Record<string,any>
};
export type RenderStream = StreamOptions & {
    service:(id?: string) => RenderStream;
    event:(type:string)=>StreamOptions

};

export function workflowStream(workflow: string ):RenderStream {
    return {
        href: workflow,
        event: (type: string) => streamElements(workflow, type),
        service: (id?: string) => workflowStream(`${workflow}/${id}` ),
        html: streamElements(workflow).html,
        text: streamElements(workflow).text,
        json: streamElements(workflow).json,
        connect: streamElements(workflow).connect
    }
}
export function streamElements(workflow: string, type?: string | undefined):StreamOptions {
    const href = `${workflow}${type ? `/events/${type}` : ''}`;

     return {
         href,
         text:c(({src}) => html`
          <host shadowDom>${src}</host>`, {
            props: {
                src: {type: String, reflect: true, value: href}
            },
            base: TextStream
        }), 
         connect(options)  {
             const {event, swap}= options ||{ }
             return {
                 'hx-swap': swap || 'beforeend' ,
                 'sse-swap':event || type,
                 'sse-connect': `${workflow}/events`,
                 'ext':'sse'
             }
             
         },
         html:c(({workflow,type}) => html` <host   ext="sse" sse-connect="${workflow}/events" sse-swap="${type}" hx-swap="beforeend" />`, {
            props: {
                workflow: {type: String, reflect: true, value: workflow},
                type: {type: String, reflect: true, value: type}
            } 
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
         if(!node?.render) {
             console.log('No render method',type, node);
             debugger;
             return {
                 type: type,
                 event: type,
                 data: node.toString(),
             };
         }
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
            data: rendered?.toString(),
        } satisfies EventMessage & { type: typeof type, event: string}
        console.log(event, node);
        return event 
    }


}