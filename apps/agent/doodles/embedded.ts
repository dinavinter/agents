import {cosineSimilarity, embed, embedMany, tool} from 'ai';
import { openai } from '@ai-sdk/openai';
import {embedding} from "../providers/openai";
import { z } from 'zod';

import doodles from "./index.json";

const generateChunks = (input: string): string[] => {
    return input
        .trim()
        .split('.')
        .filter(i => i !== '');
};

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

       // console.log(
       //     `cosine similarity: ${cosineSimilarity(embeddings[0].embedding, embeddings[1].embedding)}`,
       // );
       //  console.log('queryEmbedding', queryEmbedding)
       
        const distances = embeddings.map(({ embedding }) => cosineSimilarity(
            queryEmbedding.embedding,
            embedding,
         ));
        // console.log('distances', distances)
        const closestIndex = distances.indexOf(Math.max(...distances));
        // console.log('closestIndex', embeddings[closestIndex])
        return embeddings[closestIndex].content
   }
 })