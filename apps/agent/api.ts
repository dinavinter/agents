// Import the framework and instantiate it
import 'atomico/ssr/load';
import {html} from 'atomico';
import Fastify, {FastifyReply} from 'fastify' 
import {tokenService} from "sap-ai-token";
import {routes} from "./ui/routes";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {sendHtml} from "./ui/html";

tokenService.credentialsFromEnv();
 
const fastify = Fastify({
    logger: true
})

// @ts-ignore
const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory
console.log(__dirname);
console.log(path.join(__dirname, 'ui', "components"));

//static js files
fastify.register(fastifyStatic, {
    root: path.join(__dirname, 'ui', "components"),
    prefix: '/ui/components', // optional: default '/'
    // constraints: {  } ,// optional: default {}
    // prefixAvoidTrailingSlash: true,
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
fastify.get('/', async function handler(request, reply) {
    const agents = ['simple',  'news', 'support',   'tictac',  'raffle',  "github"]
    sendHtml(reply, html`
        <h1>AI AGents</h1>
           ${agents.map(agent => html`<a href="/agents/${agent}">${agent}</a>`)}
       </div>
    `)
})
 

routes(fastify);

try {
    await fastify.listen({port: 5002})
} catch (err) {
    fastify.log.error(err)
    process.exit(1)
}