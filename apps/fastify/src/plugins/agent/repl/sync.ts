import fp from "fastify-plugin";
import {Code} from "./revision";
import { t } from "../yjs.type";
import * as Y from "yjs";
import {VM} from "./auto";


declare module "fastify" {
    interface Agent{
        liveSnapshot: ()=> {
            stop: ()=>void
        }
    }
}

export const syncAgentRevisions = fp(async (fastify) => {
     // const revisionMap= revisions.getMap<VM>();
    fastify["agent.extensions"].push( function (agent) {
         return {
             liveSnapshot() {
                 const source = t<Code>(agent.getMap());
                 source.observe(callback);

                 function callback(e: Y.YMapEvent<any>) {
                     if (e.keysChanged.has("rev")) {
                         agent.createSnapshot();
                     }
                 }

                 return {
                     stop() {
                         source.unobserve(callback)
                     }
                 }
             }
         }
    })
    
 });

export default syncAgentRevisions;