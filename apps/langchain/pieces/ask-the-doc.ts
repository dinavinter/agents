import {DocumentInterface} from "@langchain/core/documents";
import {ChatOpenAI} from "@langchain/openai";
import {env} from "node:process";
import {pull} from "langchain/hub";
import {ChatPromptTemplate} from "@langchain/core/prompts";
import {createStuffDocumentsChain} from "langchain/chains/combine_documents";
import {StringOutputParser} from "@langchain/core/output_parsers";
import {baseUrl, tokenService } from "sap-ai-token";

export async function askTheDoc(docs:DocumentInterface<Record<string, any>>[], query:string) {
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



    const ragChain = await createStuffDocumentsChain({
        llm,
        prompt:await pull<ChatPromptTemplate>("rlm/rag-prompt"),
        outputParser: new StringOutputParser(),
    });


    // Retrieve and generate using the relevant snippets of the blog.
    return await ragChain.invoke({
        question: query,
        context: docs,
    })

}