import {FastifyPluginAsync} from "fastify";
import {tokenService} from "sap-ai-token/dist/index";

declare module "fastify" { 
    interface FastifyReply {
        token: typeof tokenService;
    }
}

export const auth: FastifyPluginAsync = async function fastify(fastify, opts) {
    tokenService.credentialsFromEnv();
    fastify.decorateRequest('token', tokenService);
}