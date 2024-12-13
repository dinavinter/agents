import fp from "fastify-plugin";
import * as Y from "yjs";
import YProvider from "y-partykit/provider";
// import ws from "ws";
import {env} from "node:process";
import {HocuspocusProvider} from "@hocuspocus/provider";

declare module "fastify"{
    interface FastifyInstance {
        doc: Y.Doc ,
        room: string
    }
}

const defaults= {yjsUrl: env.YJS_URL! || "ws://localhost:1999" , room:"index" , mainDoc: new Y.Doc({guid: "catalog", collectionid: "agents", gc: false, autoLoad: true})};
export const yjsProviderPlugin = fp(async (fastify, options: { mainDoc?: Y.Doc; yjsUrl: string , room?:string}) => {
    const { mainDoc, yjsUrl, room } = {...defaults, ...(options ||{})}

    // Store providers for subdocuments
    const subDocProviders = new Map<string, HocuspocusProvider>();

    // Create a new provider for a subdocument
    function createSubDocProvider(doc: Y.Doc, parent:Y.Doc): HocuspocusProvider {
        
        const provider = new HocuspocusProvider({
            name: "yjs",
            url: yjsUrl,
            broadcast:false,
            document: new Y.Doc({
                guid: doc.guid,
                collectionid: doc.collectionid,
                gc: false,
                autoLoad: true,
                meta: {
                    ...doc.meta,
                    parent: parent.guid
                }
            }) 
        })
        
         
        
        console.log(`Yjs subdoc provider created:  ${yjsUrl}\t \t doc: ${provider.document.guid}\t connected: ${provider.isConnected} `);
        provider.on("wsconnected", () => {
            fastify.log.info(`Yjs subdoc provider connected: ${yjsUrl}\t \t doc: ${provider.document.guid}\t connected: ${provider.isConnected} `);
        })
        
        provider.document.on("subdocs", onSubdocs);

        // // Sync changes between the main doc and the subdoc
        // provider.doc.on("update", () => {
        //     const stateVector = Y.encodeStateVector(doc);
        //     const diff = Y.encodeStateAsUpdate(provider.doc, stateVector);
        //     Y.applyUpdate(doc, diff);
        // });

        doc.on("update", () => {
            const stateVector = Y.encodeStateVector(provider.document);
            const diff = Y.encodeStateAsUpdate(doc, stateVector);
            Y.applyUpdate(provider.document, diff);
        });
        
        provider.connect();
        
        

        return provider;
    }

    const mainProvider =  new HocuspocusProvider({
        name: "yjs",
        url: yjsUrl,
        broadcast:false,
        document: mainDoc
    });

    function onSubdocs({ loaded, added, removed }: { loaded: Set<Y.Doc>, added: Set<Y.Doc>, removed: Set<Y.Doc> }, doc: Y.Doc) {
        // Handle newly added subdocuments
        for (const subDoc of added) {

            const id=`${doc.guid}/${subDoc.collectionid}/${subDoc.guid}`;
            if (!subDocProviders.has(id)) {
                const provider = createSubDocProvider(subDoc, doc);
                subDocProviders.set(id, provider);
            }
        }

        // Cleanup removed subdocuments
        for (const subDoc of removed) {
            const id=`${doc.guid}/${subDoc.collectionid}/${subDoc.guid}`;

            const provider = subDocProviders.get(id)
            if (provider) {
                provider.disconnect();
                subDocProviders.delete(id);
                fastify.log.info(`Subdoc disconnected: ${id}`);
            }
        }
    }

  // Observe for subdocuments and create providers for new ones
    mainProvider.document.on("subdocs", onSubdocs);

    // Create the main provider

    fastify.log.info(`Yjs main provider created: ${yjsUrl} doc: ${mainProvider.document.guid} connected: ${mainProvider.isConnected}`);

    mainProvider.on("wsconnected", () => {
        fastify.log.info(`Yjs main provider connected: ${yjsUrl} ${mainProvider.document.guid} connected: ${mainProvider.isConnected}`);
    })
    
    mainProvider.connect().catch((e) => {
        fastify.log.error(`Yjs main provider connect error: ${e}`);
    });


    fastify.decorate("doc", {
        getter(){
            return mainProvider.document
        }
    });

    fastify.decorate("room", {
        getter(){
            return mainProvider.document.guid
        }
    });

    fastify.decorate("awareness", {
        getter(){
            return mainProvider.awareness
        }
    });
 });

export default yjsProviderPlugin;
