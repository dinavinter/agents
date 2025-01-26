import {Buffer} from "buffer";
import { parseArgs } from "jsr:@std/cli/parse-args";
import {createHash} from "node:crypto";
import { YjsDocManager } from "../provider/hp.ts";
import {yArrayIterator,filterAsync} from "@cxai/stream";
import {Emitted} from "../stream/hub.ts";
import { } from "../stream/index.ts";


const flags = parseArgs(Deno.args, {
    string: ["url" , "room", "collection", "doc", "src", ],
});
 
console.log(flags, Deno.args)
const room = flags.room || Deno.env.get("ID") || "agv";

//render vento template events with context and state
if (import.meta.main) {
    const docManager = new YjsDocManager(flags.url);
    const agentDoc = docManager.getOrCreate(room);
    for await (const  {type, data, ...details} of yArrayIterator<Emitted>(agentDoc.getArray<Emitted>("emitted"))){
        console.log("vento", details
         
        
    } 
}
   
   