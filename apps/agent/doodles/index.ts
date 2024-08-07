 import {z} from "zod";
import doodles from "./index.json";



 

 export  const zDoodles=
     doodles.slice(0.5).reduce((prev,  {src,alt}) =>  
         z.union([prev, z.object({
            src: z.literal(src).describe('The src of the doodle'),
            alt: z.literal(alt).describe('The alt of the doodle'),
        }) ]) 
     , z.never() as z.ZodTypeAny)

 export type Doodle =typeof doodles[number];