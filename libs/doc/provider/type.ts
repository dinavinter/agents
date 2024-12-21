import type * as Y from "yjs";
import type {FastifyBaseLogger} from "https://esm.sh/fastify";

export type Logger = Pick<Console, "log" | "debug" | "trace" | "info"> | FastifyBaseLogger;

export type ConnectOptions<T = Record<string | number | symbol, never>> = {
    doc: Y.Doc | string,
    connect: true
} & T;
 

export interface YjsDocManager<T = Record<string | number | symbol, never> >{ 

    connect(options: ConnectOptions<T>): Y.Doc;

    get(id: string): Y.Doc | undefined;
}