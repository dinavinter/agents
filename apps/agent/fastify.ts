// Import the framework and instantiate it
import 'atomico/ssr/load';
 import Fastify, {FastifyReply} from 'fastify' 
import {tokenService} from "sap-ai-token";
import {routes} from "./api";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import {fileURLToPath} from "node:url";
 
tokenService.credentialsFromEnv();
 
const fastify = Fastify({
    logger: {
        level: 'warn',
    }
})

// @ts-ignore
const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory

//static js files
fastify.register(fastifyStatic, {
    root: path.join(__dirname, "agents",  "components"),
    prefix: '/components', // optional: default '/'
    extensions: ['js'],
    setHeaders: (res,path,) => {
        console.log(path);
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET')
        res.setHeader('Access-Control-Allow-Headers', 'content-type')
        res.setHeader('content-type' , 'application/javascript')
    }
})

//agent router 
routes(fastify);

try {
    await fastify.listen({port: 5002})
} catch (err) {
    fastify.log.error(err)
    process.exit(1)
}