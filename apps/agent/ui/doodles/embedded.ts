import {cosineSimilarity, embed, embedMany, tool} from 'ai';
import {embedding} from "../../providers/openai";
import { z } from 'zod';

import doodles from "./index.json";

 

export const generateEmbeddings = async (): Promise<Array<{ embedding: number[]; content: {
    src: string;
    alt: string;
    } }>> => {
    
    const { embeddings } = await embedMany({
        model: embedding(),
        values: doodles.map(({ alt }) => alt),
    });
    
    return embeddings.map((e, i) => ({ content: doodles[i], embedding: e }));
};

const embeddings = await generateEmbeddings();




export const findDoodleTool =tool({
    description: 'Find a doodle that matches the given query',
    parameters: z.object(({
        query:  z.string().describe('The query to search for')
    })),
   async execute({query}) {
        console.log('query', query)
        const queryEmbedding = await embed({
            model: embedding(),
            value: query,
        });

       
        const distances = embeddings.map(({ embedding }) => cosineSimilarity(
            queryEmbedding.embedding,
            embedding,
         ));
        const closestIndex = distances.indexOf(Math.max(...distances));
        return embeddings[closestIndex].content
   }
 })