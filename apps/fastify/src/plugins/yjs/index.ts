import * as Y from "yjs";
import {YjsDocManager} from "@/plugins/yjs/docManager.ts";

declare module "fastify"{
    interface FastifyInstance {
        doc: Y.Doc,
        debug: string,
        docs: YjsDocManager

    }
}