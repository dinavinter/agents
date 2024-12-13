import type {FastifyPluginAsyncZod} from "fastify-type-provider-zod";
import fp from "fastify-plugin";
import rootLogger, {CustomFieldsFormat, CustomFieldsTypeConversion, Framework} from 'cf-nodejs-logging-support'

rootLogger.setFramework(Framework.Fastify);
// rootLogger.enableTracing()
rootLogger.setCustomFieldsFormat(CustomFieldsFormat.All);
rootLogger.setCustomFieldsTypeConversion(CustomFieldsTypeConversion.Retain)

const logPlugin: FastifyPluginAsyncZod = async function (fastify ) {
 
    // Add the logger middleware to write access logs
    fastify.addHook("onRequest", rootLogger.logNetwork)

    fastify.addHook ('onError', (request, _reply, error, done) => {
        request.log.error('Request failed.', { "_error": error, stack: error.stack});
        rootLogger.logMessage("error", 'Unexpected error occured',{ "_error": error , stack: error.stack});
        done();
    });

    // Handle '/log-test' path
    fastify.get("/log-test", (request, reply) => {
        // Write a log message bound to request context
        request.log.info(`Sending a greeting`)
        reply.send("Hello Fastify")
    })


}
 

    
export default fp(logPlugin);