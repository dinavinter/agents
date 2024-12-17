import {YjsDocManager} from "../provider/hp.ts";
import {parseArgs} from "jsr:@std/cli/parse-args";

const flags = parseArgs(Deno.args, {
    string: ["url" , "room", "collection", "doc", "src", ],
});
const docManager = new YjsDocManager(flags.url);
const src = flags.src ||  "./examples/simple.ts"
console.log("src", src)
 const doc  =docManager.getOrCreate(flags.room || src.split("/").pop() || src);
doc.getMap().set("src",  await Deno.readTextFile(src));
 
console.log("done", doc.toJSON())
