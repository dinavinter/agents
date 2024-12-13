import * as Y from "yjs";

declare module "fastify"{
    interface FastifyInstance {
        doc: Y.Doc,
        debug: string
    }
}