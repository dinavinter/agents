import rootLogger  from "cf-nodejs-logging-support";
import type {FastifyPluginAsyncZod} from "fastify-type-provider-zod";
import fp from "fastify-plugin";

const logPlugin: FastifyPluginAsyncZod = async function (fastify ) {

    rootLogger.setLoggingLevel('Silly');
    rootLogger.logMessage('Silly', `Log level is set to Silly`);

    rootLogger.setSinkFunction((_level, message) => {
        try {
            const parsed = JSON.parse(message);
            const reduced = {
                msg: parsed.msg,
                level: parsed.level
            }
            console.info(JSON.stringify(reduced, undefined, 2));
        } catch (e) {
            console.error(message, e);
        }
    });

    

}


export default fp(logPlugin);