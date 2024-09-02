import {ChatOpenAI, OpenAIEmbeddings} from "@langchain/openai";
import { env } from "node:process";
import {baseUrl, tokenService} from "sap-ai-token";
import {VectorStore} from "@langchain/core/vectorstores";
import {Document, DocumentInterface} from "@langchain/core/documents";
import {MemoryVectorStore} from "langchain/vectorstores/memory";


async function syncDocIntoStore(vectorStore: VectorStore  , doc: AsyncGenerator<Document[]>) {
    for await (const docs of doc) {
        await vectorStore.addDocuments(docs) 
    }
}

export const docStore = async (doc:AsyncGenerator<Document[]>):Promise<VectorStore> => {
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
    const vectorStore = await MemoryVectorStore.fromDocuments([], embeddings)

    syncDocIntoStore(vectorStore, doc).then(() => console.log('Vector store is synced')).catch(console.error);
    return vectorStore;
 
}
    

