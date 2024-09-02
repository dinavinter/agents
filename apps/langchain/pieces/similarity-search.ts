import {VectorStore} from "@langchain/core/vectorstores";
import {DocumentInterface} from "@langchain/core/documents";

export async function similaritySearch(vectorStore: VectorStore, query: string) {
    let docs: DocumentInterface<Record<string, any>>[] =[]
    while (docs.length === 0) {

        docs = await vectorStore
            .asRetriever({k: 6, searchType: "similarity"})
            .invoke(query);

        console.log("Store: ", docs.map(e => ({
            page: `${e.pageContent.slice(0, 100)}..`,
            source: e.metadata.source,
            loc: JSON.stringify(e.metadata.loc)
        })));
    }

    return  docs;
}
