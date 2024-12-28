import {fileURLToPath} from "node:url";
import path from "node:path";
import {FastifyPluginAsync} from "fastify";
import fastifyStatic from "@fastify/static";
import fp from "fastify-plugin";

export const staticPlugin: FastifyPluginAsync = async function fastify(fastify, opts) {
    const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
    const __dirname = path.dirname(__filename)// get the name of the directory
    console.log("static-plugin", path.join(__dirname,"../..", "node_modules"))
    
    //static js files
    fastify.register(fastifyStatic, {
        root: path.join(__dirname,"../..", "node_modules"),
        // prefix: '/node_modules', // optional: default '/'
        extensions: ['js'],
        setHeaders: (res, path,) => {
            console.log(path);
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Access-Control-Allow-Methods', 'GET')
            res.setHeader('Access-Control-Allow-Headers', 'content-type')
            res.setHeader('content-type', 'application/javascript')
        }
    })
}

export default fp(staticPlugin);
