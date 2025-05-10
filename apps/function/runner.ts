import {continuousRun} from "./continuousRun.ts";


const {doc, revisions, getHandler,agent,agents} = continuousRun("editor-762");
Deno.serve({
    port: 8080,
},(req: Request, info) =>{ 
    if(req.url.endsWith( "/live")) {
        const handler = getHandler();
        if(handler) {
            return handler(req,info)
        } 
    }
    
    return new Response(`
<embed src="https://agents.cfapps.us10-001.hana.ondemand.com/agents/${agent}/ide" >
 <pre>${JSON.stringify(agents.getMap(agent).toJSON())}</pre>
 <pre>${JSON.stringify(doc.toJSON())}</pre>
`, {
    headers:{'content-type': "text/html"}
})})

