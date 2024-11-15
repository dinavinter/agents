import {AnyStateMachine} from "xstate";
import {FastifyPluginAsyncJsonSchemaToTs} from "@fastify/type-provider-json-schema-to-ts";
import * as Y from "yjs";import fp from "fastify-plugin";
import { vm} from "../routes/vm";
import {createHash} from "node:crypto";
import {createYjsHub} from "agent/stream/hub";

 
declare module "fastify" {
    interface FastifyInstance {
         agent: typeof agent 
         agents: typeof agents
    } 
}


export type VM= {
    code:string,
    rev:string,
    timestamp:number,
    href:string,
    version:string,
    id:string,
    session:string
}

export class Code {
    public rev: string;
    public timestamp: number;

    constructor(public code: string) {
        this.rev = this.revisionHash(Buffer.from(code));
        this.timestamp = Date.now();
    }

    revisionHash(data: Uint8Array): string {
        return createHash('md5').update(data).digest('hex').slice(0, 10);
    }
}



export type AgentPluginOptions = {
    doc?: Y.Doc
}


function agent(this: { doc }, agent: string) { 
    const {doc} = this;
    const agents = doc.getMap('agents');
    const agentDoc = agents.get(agent) || agents.set(agent, new Y.Doc({
        guid: agent,
        collectionid: "agents",
        meta: {
            type: 'agent',
            id: agent,
            name: agent,
            logic: {
                id: agent,
                meta: {
                    name: agent,
                    version: 'draft'
                }
            }
        } as AnyStateMachine["config"] 
    }));
 
    return {
        vm: vmAsync.bind(null, agentDoc.getArray("src"), agentDoc.getMap("versions")),
        src: agentDoc.getArray<{ code: string, rev: string, timestamp: number }>("src") 
    }
}

async function vmAsync(codeArray: Y.Array<{code:string, rev:string, timestamp:number}>,  versionMap: Y.Map<any>):Promise<VM> {

    return codeArray.length ? await getVm(codeArray.get(codeArray.length - 1), codeArray.length - 1 ) : await new Promise<ReturnType<typeof getVm>>(function (resolve) {
        codeArray.observe(callback);

        function callback() {
            if (codeArray.length) {
                resolve(getVm(codeArray.get(codeArray.length - 1)))
            }
        }
    } )
    async function getVm({code,rev}:{code:string, rev:string}, index: number) {
        if (!versionMap.get(rev)) {
            const {href, hub} = await vm(code,
                createYjsHub(versionMap.set(rev,
                    new Y.Doc({
                        meta: {
                            type: 'version',
                            code,
                            rev,
                            timestamp: Date.now(),
                            version: index.toString()
                        },
                        collectionid: "versions",
                        guid: rev
                    }))));
 
             hub.doc.getMap("meta").set("href", href);
        }

        const version = versionMap.get(rev);

        return {
            ...version.meta,
            ...version.getMap("meta").toJSON()
        }
    }

}

function agents(this:{doc:Y.Doc}) {
    const {doc} = this;
    return Array.from(doc.getMap<Y.Doc>('agents')).map(([id, agentDoc]) => {
        return {
            versions: Array.from(agentDoc.getMap<Y.Doc>("versions")).map(([id, versionDoc]) => ({
                id,
                ...versionDoc.meta,
                ...versionDoc.getMap("meta").toJSON()
            })) || [],     
            id,
            ...agentDoc.meta,
            ...agentDoc.getMap("meta").toJSON() 
        }
    })
}


export const agentPlugin: FastifyPluginAsyncJsonSchemaToTs<AgentPluginOptions> = async function (instance, {doc}) {

    doc = doc ?? new Y.Doc({
        guid: 'agents',
        collectionid: 'stores'
    });

    instance.decorate("agents", agents.bind({
        doc
    }));

    instance.decorate('agent', agent.bind({
        doc
    }));


}
    
export default fp(agentPlugin);