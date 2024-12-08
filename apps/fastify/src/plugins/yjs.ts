import fp from "fastify-plugin";
import * as Y from "yjs";
import YProvider from "y-partykit/provider";
import ws from "ws";
import {env} from "node:process";

declare module "fastify"{
    interface FastifyInstance {
        doc: Y.Doc 
    }
}

const defaults= {mainDoc : new Y.Doc(), yjsUrl: env.YJS_URL! || "ws://localhost:1999"};
export const yjsProviderPlugin = fp(async (fastify, options: { mainDoc: Y.Doc; yjsUrl: string }) => {
    const { mainDoc, yjsUrl } = {...defaults, ...(options ||{})}

    // Store providers for subdocuments
    const subDocProviders = new Map<string, YProvider>();

    // Create a new provider for a subdocument
    function createSubDocProvider(doc: Y.Doc): YProvider {
        const provider = new YProvider(yjsUrl, doc.guid, new Y.Doc(), {
            connect: true,
            disableBc: true,
            WebSocketPolyfill: ws,
        });

        // // Sync changes between the main doc and the subdoc
        // provider.doc.on("update", () => {
        //     const stateVector = Y.encodeStateVector(doc);
        //     const diff = Y.encodeStateAsUpdate(provider.doc, stateVector);
        //     Y.applyUpdate(doc, diff);
        // });

        doc.on("update", () => {
            const stateVector = Y.encodeStateVector(provider.doc);
            const diff = Y.encodeStateAsUpdate(doc, stateVector);
            Y.applyUpdate(provider.doc, diff);
        });

        return provider;
    }

    // Observe for subdocuments and create providers for new ones
    mainDoc.on("subdocs", ({ loaded, added, removed }) => {
        fastify.log.debug("Subdocs event detected", { loaded, added, removed });

        // Handle newly added subdocuments
        for (const subDoc of added) {
            if (!subDocProviders.has(subDoc.guid)) {
                const provider = createSubDocProvider(subDoc);
                subDocProviders.set(subDoc.guid, provider);
                fastify.log.info(`Provider created for subdoc: ${subDoc.guid}`);
            }
        }

        // Cleanup removed subdocuments
        for (const subDoc of removed) {
            const provider = subDocProviders.get(subDoc.guid);
            if (provider) {
                provider.disconnect();
                subDocProviders.delete(subDoc.guid);
                fastify.log.info(`Subdoc disconnected: ${subDoc.guid}`);
            }
        }
    });

    // Create the main provider
    const mainProvider = new YProvider(yjsUrl, mainDoc.guid, mainDoc, {
        connect: true,
        disableBc: true,
        WebSocketPolyfill: ws,
    });

    fastify.decorate("doc", {
        getter(){
            return mainProvider.doc
        }
    });

    fastify.decorate("awareness", {
        getter(){
            return mainProvider.awareness
        }
    });
    fastify.log.info(`Yjs main provider connected: ${mainProvider.wsconnected}`);
});

export default yjsProviderPlugin;
