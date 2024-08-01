#!/usr/bin/env ts-node
import {config} from 'dotenv';
import {baseUrl, tokenService} from "sap-ai-token";
import {env} from "node:process";
import "cheerio";

import {ChatOpenAI, OpenAIEmbeddings} from "@langchain/openai";
import {MemoryVectorStore} from "langchain/vectorstores/memory";
import {CheerioWebBaseLoader} from "@langchain/community/document_loaders/web/cheerio";
import {RecursiveCharacterTextSplitter} from "langchain/text_splitter";
import {DocumentInterface} from "@langchain/core/documents";
import {createStuffDocumentsChain} from "langchain/chains/combine_documents";
import {pull} from "langchain/hub";
import {ChatPromptTemplate} from "@langchain/core/prompts";
import {StringOutputParser} from "@langchain/core/output_parsers";


config()
config({path: '../../.env'})



//rag + langchainjs https://js.langchain.com/v0.2/docs/tutorials/rag


async function main() {

    tokenService.credentialsFromEnv();

    //setup models

    const llm = new ChatOpenAI({
        temperature: 0,
        modelName: env.SAP_AI_MODEL_NAME,
        openAIApiKey: await tokenService.accessToken(),
        configuration: {
            baseURL: baseUrl(process.env.SAP_AI_API_URL, process.env.SAP_AI_DEPLOYMENT_ID),
            defaultQuery: {
                'api-version': env.OPENAI_API_VERSION,
            },
            dangerouslyAllowBrowser: true,
            maxRetries: 1,
            timeout: 5000,
            defaultHeaders: {
                'ai-resource-group': 'default',
            }
        }
    })


    const embeddings = new OpenAIEmbeddings({
        modelName: env.SAP_AI_EMBEDDINGS_MODEL_NAME,
        openAIApiKey: await tokenService.accessToken(),
        configuration: {
            baseURL: `${env.SAP_AI_API_URL}/v2/inference/deployments/${env.SAP_AI_EMBEDDINGS_DEPLOYMENT_ID}`,
            defaultQuery: {
                'api-version': env.OPENAI_API_VERSION,
            },
            dangerouslyAllowBrowser: true,
            maxRetries: 1,
            timeout: 1000,
            defaultHeaders: {
                'ai-resource-group': 'default',
            }
        }
    })


    //rag chain setup, rag is a model that can generate answers to questions based on a context of documents
    const ragChain = await createStuffDocumentsChain({
        llm,
        prompt: await pull<ChatPromptTemplate>("rlm/rag-prompt"),
        outputParser: new StringOutputParser(),
    });


    //Load the content of the blog post into a vector store
    const vectorStore = await MemoryVectorStore.fromDocuments(
        await cheerioLoad("https://lilianweng.github.io/posts/2023-06-23-agent/"),
        embeddings)

    // Search in the documents for similarities, uses the similarity search capabilities of a vector store to facilitate retrieval
    const similarity = await vectorStore
        .asRetriever({k: 6, searchType: "similarity"})
        .invoke("What is task decomposition?");

    console.log("Vector: https://lilianweng.github.io/posts/2023-06-23-agent/")
    console.log("Query: What is task decomposition")
    console.log("========Context========\n ", JSON.stringify(similarity.map(docLog).slice(0, 2)) + "\n........");

    // Ask the AI about the task decomposition, uses the retrieved documents from similarity search as a context
    console.log("===========================")
    console.log(`AI: ${
        await ragChain.invoke({
            question: "What is task decomposition?",
            context: similarity,
        })
    }`);


    async function cheerioLoad(url: string) {

        /* load  web url content */
        const loader = new CheerioWebBaseLoader(
            url
        );
        const docs = await loader.load();

        //  split the content into chunks
        const textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });

        return await textSplitter.splitDocuments(docs);
    }


}

function docLog(e: DocumentInterface<Record<string, any>>) {
    return {
        page: `${e.pageContent.slice(0, 100)}..`,
        source: e.metadata.source,
        loc: JSON.stringify(e.metadata.loc)
    };
}




main().catch(console.error);

