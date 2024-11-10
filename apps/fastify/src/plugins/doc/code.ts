import {FastifyPluginAsync} from "fastify";
import beautify from "js-beautify";
import {z} from "zod";
import fp from "fastify-plugin";

function prettyPrint(fn: Function) {
    return beautify.js(fn.toString(), {
        indent_size: 2,
        space_in_empty_paren: false,
        space_after_named_function: true,
        space_after_anon_function: true,
        brace_style: 'collapse',
        templating: ['django', 'erb', 'handlebars', 'php', 'smarty', 'angular']
    })
}

function sourceCode(handler: Function) {
    return `
\`\`\`javascript title="source"
${prettyPrint(handler)}
\`\`\`

`;
}


//hardcoded source code for the client usage examples
function sseUsages(routeOptions: {path: string, url: string}) {
    return `
<details open>
        <summary>Client Usages Examples </summary>
         
- EventSource 
\`\`\`javascript title="EventSource"
new EventSource('${routeOptions.url}').onmessage = console.log
\`\`\`
- Htmx Append
\`\`\`html title="HTMX Append"
<pre class="text-pretty" hx-ext="sse" sse-connect="${routeOptions.path}"  sse-swap="message" hx-swap="beforeend" sse-close="done"></pre>
\`\`\`
- Htmx Replace 
\`\`\`html title="HTMX Replace"
<div class="text-pretty" hx-ext="sse" sse-connect="${routeOptions.path}"  sse-swap="message" hx-swap="textContent transition:true swap:1s settle:1s" sse-close="done" />
\`\`\`

</details>
`;
}

const sourceCodeDoc: FastifyPluginAsync<any> = async function (fastify) {

    //hook to add source code to the route schema 
    fastify.addHook('onRoute', (routeOptions) => {
        if (routeOptions.schema && routeOptions.schema.description && !("x-source" in routeOptions.schema)) {
            const handler = routeOptions.handler;
            // @ts-ignore
            routeOptions.schema["x-source"] = sourceCode(handler)
            // @ts-ignore
            routeOptions.schema.description = `${(routeOptions.schema.description || "")}${routeOptions.schema["x-source"]}`

            if (routeOptions.schema?.produces?.includes('text/event-stream') && routeOptions.schema?.response instanceof Object && 200 in routeOptions.schema?.response && routeOptions.schema?.response?.[200] instanceof z.ZodSchema) {
                routeOptions.schema.response![200] = routeOptions.schema.response![200].describe(`${routeOptions.schema.response![200].description || "Server Sent Events (SSE)"}:: 
                      ${sseUsages(routeOptions)}`)
            }
        }

    })

}


export default fp(sourceCodeDoc);