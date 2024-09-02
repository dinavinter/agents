import {Schema, streamObject, streamText} from "ai";
import {PromptTemplate} from "@langchain/core/prompts";
import {z} from "zod";


export type OneOf<T,T2, Key extends string> =  Key extends keyof T ? T[Key] :  Key extends keyof T2 ? T2[Key] : any;

export type StreamTextOptions = Parameters<typeof streamText>[0]  & {template?: string};
export type StreamObjectOptions<OBJECT>= Omit<Parameters<typeof streamObject<OBJECT>>[0], "output">  & {template?: string};

export type FromDefault<TOptions, TDefault extends Partial<TOptions>> =
    Omit<TOptions ,keyof TDefault> extends Omit<TOptions, "template" | "prompt">?  {
        template?: string,
        prompt?: string
    }  :
        Omit<TOptions ,keyof TDefault> &
        Partial<TOptions> ;




export async function aiOptions<TOptions extends StreamTextOptions | StreamObjectOptions<any> = StreamTextOptions,TDefaultOptions extends Partial<TOptions> =Partial<TOptions>>(context:  any, defaultOptions: TDefaultOptions | undefined, input:FromDefault<TOptions, TDefaultOptions> | string ) {

    const options = typeof input === 'object' ? input : {template: input}
    const resolvedOptions = {
        ...defaultOptions,
        ...options
    } ;
    const {template, prompt } = resolvedOptions;

    resolvedOptions.prompt = template && await PromptTemplate.fromTemplate(template as unknown as string, {
        templateFormat: 'mustache',
    }).format(context) || prompt;
    // console.log('aiOptions', resolvedOptions.prompt);
    return resolvedOptions as unknown as TOptions ;
}
