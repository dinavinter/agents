#!/usr/bin/env ts-node
import { CoreMessage, streamText } from 'ai';
import {config} from 'dotenv';
import * as readline from 'node:readline/promises';
import {sapAIFetch, baseUrl, tokenService} from "sap-ai-token";
import {createOpenAI} from "@ai-sdk/openai";

config()
config({path: '../../.env'})

const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const messages: CoreMessage[] = [];

async function main() {

    tokenService.credentialsFromEnv();
    
    const openaiGP4o = createOpenAI({
        apiKey: ' value dummy: ai sdk will faill the call if no is provided',
        baseURL: baseUrl(process.env.SAP_AI_API_URL, process.env.SAP_AI_DEPLOYMENT_ID),
        fetch: sapAIFetch
    }).chat('gpt-4o')

    while (true) {
        const userInput = await terminal.question('You: ');

        messages.push({ role: 'user', content: userInput });

        const result = await streamText({
            model: openaiGP4o,
            system: `You are a helpful, respectful and honest assistant.`,
            messages,
        });

        let fullResponse = '';
        process.stdout.write('\nAssistant: ');
        for await (const delta of result.textStream) {
            fullResponse += delta;
            process.stdout.write(delta);
        }
        process.stdout.write('\n\n');

        messages.push({ role: 'assistant', content: fullResponse });
    }
}

main().catch(console.error);