import * as Y from "yjs";
import ws from "ws";

import {env} from "node:process";
import fp from "fastify-plugin";
import {DocumentManager, getOrCreateDocAndToken} from "@y-sweet/sdk";
import {createYjsProvider} from "@y-sweet/client";
import {debuggerUrl} from "@y-sweet/client";
// import { createYjsProvider } from '@y-sweet/client'

const defaults= {yjsUrl: env.YJS_URL! || "ys://127.0.0.1:8080"  , doc: new Y.Doc({guid: "catalog", collectionid: "agents", gc: false, autoLoad: true})};

export const yjsProviderPlugin = fp(async (fastify, options: { doc?: Y.Doc; yjsUrl?: string }) => {
    const {doc, yjsUrl} = {...defaults, ...(options || {})} 
    console.log("yjsProviderPlugin", doc.guid, yjsUrl)
    const docManager = new DocumentManager(yjsUrl)
    async function getClientToken() {
        // In a production app, this is where you'd authenticate the user
        // and check that they are authorized to access the doc.
        return await docManager.getOrCreateDocAndToken(doc.guid);
    }
    
    const provider= await createYjsProvider(doc, doc?.guid, " http://localhost:3002/api/auth", {
         disableBc: true,
         WebSocketPolyfill: ws

     })

 
    provider.connect();
    
    // const docConnection=await docManager.getDocConnection(doc.guid);
    // doc.on("update", (update, origin) => {
    //    
    // });
    // const token= await docManager.getOrCreateDocAndToken(doc.guid);

    const debugUrl= debuggerUrl(await getClientToken());
    console.log("debugUrl", debugUrl)
    fastify.decorate("doc", {
        getter: () => doc

    })
    fastify.decorate("auth", {
        getter: () =>  docManager.getOrCreateDocAndToken(doc.guid)
    })
    
    fastify.decorate("debug", {
        getter: () => debugUrl
    })

})

export default yjsProviderPlugin