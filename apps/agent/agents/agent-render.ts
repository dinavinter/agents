import 'atomico/ssr/load';
import {html} from "atomico";
import {VNode, VNodeAny} from "atomico/types/vnode";
import {ActionArgs, emit, EventObject, MachineContext, type ParameterizedObject} from "xstate";
import {EventMessage} from "fastify-sse-v2";


export type StreamOptions ={
    href:string
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
        connect: streamElements(workflow).connect
    }
}
export function streamElements(workflow: string, type?: string | undefined):StreamOptions {
    const href = `${workflow}${type ? `/events/${type}` : ''}`;
     return {
         href, 
         connect(options)  {
             const {event, swap}= options ||{ }
             return {
                 'hx-swap': swap || 'beforeend' ,
                 'sse-swap':event || type,
                 'sse-connect': `${workflow}/events`,
                 'ext':'sse'
             }
             
         }
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
        return {
            type: type,
            event: type,
            data: rendered?.toString(),
        } satisfies EventMessage & { type: typeof type, event: string } 
    }


}