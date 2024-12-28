import * as Y from "yjs";
import {FastifyBaseLogger} from "fastify";

export type Logger = Pick<Console, "log" | "debug" | "trace" | "info"> | FastifyBaseLogger;
export interface YjsDocManager { 

    get url(): string;
    
    getOrCreate(id: string, doc?: Y.Doc | undefined, connect?: boolean): Y.Doc;

    get(id: string): Y.Doc | undefined;
}