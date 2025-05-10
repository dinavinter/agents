import {generateObject} from "ai";
import {Account} from "@/user/actor.ts";
import {azure} from "ai-sdk";
import {z} from "zod";
import * as Y from "yjs";
accountsDoc.getMap("account").observe(async function (event:Y.MapEvent<Account>){
    for(const [key, value] in Array.from(event.keys.entries())){
        const {action , newValue:account} = value ||{};
        if(!avatarMap.has(key) && account){
            console.log("gen for ", account.uid)
            const { object: { outerHTML } } = await generateObject<{ outerHTML: string }>({
                model: azure("gpt-4o"),
                system: `You are an expert in fun avatars generation. , response with valid html as svg , keep it fun and simple.`,
                schema: z.object({
                    outerHTML: z.string(),
                }),
                prompt: `generate a fun avatars for  the user, consider its attributes """${JSON.stringify(account)}."""`,
                temperature: 0.9,
            });

            doc.transact(()=>{
                avatarMap.set(key, "done")
                avatars.push([{uid, outerHTML}])
            })
        }
    }
})