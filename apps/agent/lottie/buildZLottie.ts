import {jsonSchemaToZod} from "json-schema-to-zod";
import {resolveRefs} from "json-refs";
import {format} from "prettier";
import jsonSchema from "./lottie.schema.json";
import fs from "node:fs";


export async function zLottie (){
    const { resolved } = await resolveRefs(jsonSchema);
    const code = jsonSchemaToZod(resolved,{
        module:"esm",
        name: "Lottie",
        type: "module"
    });
    return await format(code, {parser: "typescript"});


}

const code = await zLottie();
console.log(code)
fs.writeFileSync("zLottie.ts", code);