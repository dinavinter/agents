import {createMachine, fromObservable} from "xstate";
import {AsyncGeneratorWithSetup} from "@langchain/core/dist/utils/stream";
import {VNodeAny} from "atomico/types/vnode";
import {fromAsyncGenerator} from "../utils/async-generator";

type RenderMachineInput<TNode =VNodeAny,T = any, TReturn =any, TNext = any> = {
    source: AsyncGenerator<T, TReturn, TNext>,
    render: (value: T) => TNode
    
}

type RenderMachineEmitter<TNode =VNodeAny> = {
    type: 'node',
    node: TNode
}
 
 
type RenderMachineContext<TNode = VNodeAny, T = any, TReturn = any, TNext = any> = {
    source: AsyncGenerator<T, TReturn, TNext>,
    render: (value: T) => TNode,
    node?: TNode
};
 

const renderMachine = createMachine<RenderMachineContext>({
    id: 'renderMachine',
    initial: 'idle',
    context:  ({input})=>input,
    states: {
         buffering: {
             invoke: {
                 src: fromAsyncGenerator ,
                 
                 input: ({context:{source}}) => source,
             }
    }
});

export default renderMachine;