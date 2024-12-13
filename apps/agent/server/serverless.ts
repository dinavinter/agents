'use strict' 
import Fastify   from "fastify";
import plugins from "./app";

export const config = {
    runtime: 'edge',
    supportsResponseStreaming: true,
    unstable_allowDynamic: [
        '/node_modules/**',
        '/src/**',
        '/../src/**',
    ]

};


// export const dynamic = 'force-dynamic'; // static by default, unless reading the request


const fastify=Fastify({logger: true});
fastify.register(plugins, { prefix: '/' });

async function fastifyReady() {
  await fastify.ready(); 
}
export default async function handler (req: Request, res: Response)  {
    try {
        await fastifyReady();
        fastify.server.emit('request', req, res);
    } catch (error) {
        console.error(error);
        return new Response('Internal Server Error', {
            status: 500,
            headers: {'Content-Type': 'text/plain', 'Error-Details': JSON.stringify(error)}
        });
    }
}
 