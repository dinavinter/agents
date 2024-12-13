import fp from "fastify-plugin";
import * as Y from "yjs";
import YProvider from "y-partykit/provider";
import ws from "ws";
import {env} from "node:process";
import {Doc} from "yjs";
import {FastifyInstance} from "fastify";

declare module "fastify"{
    interface FastifyInstance {
        doc: Y.Doc , 
        docs: {
            getOrCreate: (id:string, create?:()=>Y.Doc |undefined, connect?:boolean)=> Y.Doc
            get: (id:string)=> Y.Doc | undefined
        }
    }
}

const defaults= {yjsUrl: env.YJS_URL! || "ws://localhost:1999" , room:"main" , doc: new Y.Doc({guid: "main", collectionid: "agents", gc: false, autoLoad: true})};
export const yjsProviderPlugin = fp(async (fastify, options: { doc?: Y.Doc; yjsUrl: string , room?:string}) => {
    const { doc, yjsUrl, room } = {...defaults, ...(options ||{})}

    
    
    // Store providers for subdocuments
    const subDocProviders = new Map<string, YProvider>();

    // Create a new provider for a subdocument
    function createSubDocProvider(doc: Y.Doc, parent:Y.Doc): YProvider {
        const provider = new YProvider(yjsUrl, parent.guid, new Y.Doc({
            guid: doc.guid,
            collectionid: doc.collectionid,
            gc: false,
            autoLoad: true,
            meta: {
                ...doc.meta,
                parent: parent.guid
            }
            
        }),{
            disableBc: true,
            WebSocketPolyfill: ws,
        });
        
        console.log(`Yjs subdoc provider created: ${yjsUrl}\t\n\tparent:${parent.guid}\n\t\troom: ${provider.roomname}\t collection:${provider.doc.collectionid}\t doc: ${provider.doc.guid}\t connected: ${provider.wsconnected}\t party:${provider.id}`);
        provider.on("wsconnected", () => {
            fastify.log.info(`Yjs subdoc provider connected: ${yjsUrl}\t room: ${provider.roomname}\t doc: ${provider.doc.guid}\t connected: ${provider.wsconnected}\t party:${provider.id}`);
        })
        
        provider.doc.on("subdocs", onSubdocs);

        // // Sync changes between the main doc and the subdoc
        provider.doc.on("update", () => {
            const stateVector = Y.encodeStateVector(doc);
            const diff = Y.encodeStateAsUpdate(provider.doc, stateVector);
            Y.applyUpdate(doc, diff);
        });

        doc.on("update", () => {
            const stateVector = Y.encodeStateVector(provider.doc);
            const diff = Y.encodeStateAsUpdate(doc, stateVector);
            Y.applyUpdate(provider.doc, diff);
        });
        
        provider.connect();
        
        

        return provider;
    }

    const mainProvider = new YProvider(yjsUrl, room, doc, {
        connect: false,
        disableBc: true,
        WebSocketPolyfill: ws
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
    mainProvider.doc.on("subdocs", onSubdocs);

    // Create the main provider

    fastify.register(yjsProviderSubdocPlugin, {doc, yjsUrl, room});
    fastify.log.info(`Yjs main provider created: ${yjsUrl} room: ${mainProvider.roomname} doc: ${mainProvider.doc.guid} connected: ${mainProvider.wsconnected}`);

    mainProvider.on("wsconnected", () => {
        fastify.log.info(`Yjs main provider created: ${yjsUrl} room: ${mainProvider.roomname} doc: ${mainProvider.doc.guid} synced: ${mainProvider.synced}`);
    })
    
    mainProvider.connect();


    fastify.decorate("doc", {
        getter(){
            return mainProvider.doc
        }
    });

    fastify.decorate("room", {
        getter(){
            return mainProvider.roomname
        }
    });

    fastify.decorate("awareness", {
        getter(){
            return mainProvider.awareness
        }
    });
 });


class docsManager {
    providers = new Map<string, YProvider>();
    discovery: Y.Doc;
    local: Y.Doc;
    
    constructor(private yjsUrl: string, private log:FastifyInstance["log"]) {
        console.log("Yjs docs manager created", yjsUrl);
        this.discovery = this.getOrCreate(":::discovery");
        this.local =  new Y.Doc({guid: "##local", collectionid: "agents", gc: false, autoLoad: true});
        

    } 
    
    create( id: string, create:()=>(Y.Doc |undefined) = () =>  undefined, connect:boolean=false): YProvider {
        
        const provider= new YProvider(this.yjsUrl, id, create(), {
            disableBc: true,
            WebSocketPolyfill: ws
        });
         
        // this.discovery.getArray().push([{
        //     client: provider.id,
        //     room: provider.roomname,
        //     doc: provider.doc.guid
        // }]);
        
        // this.local.subdocs.add(provider.doc);
        
        this.log.trace(`Yjs main provider created: ${this.yjsUrl}\t room: ${provider.roomname}\t doc: ${provider.doc.guid}\t connected: ${provider.wsconnected}`);

        provider.on("wsconnected", () => {
            this.log.info(`Connected!: ${this.yjsUrl}\t room: ${provider.roomname}\t doc: ${provider.doc.guid}\t synced: ${provider.synced}`);
        })
        
        if(connect) {
            provider.connect();
        }
        
        return provider; 
    }
    
    getOrCreate(id: string, create:()=>(Y.Doc |undefined) = () =>  undefined, connect:boolean=true): Y.Doc {
        if (!this.providers.has(id)) {
            this.providers.set(id, this.create(id, create, connect));

        }
        return this.providers.get(id)!.doc

    }
    
    get(id: string) {
        return this.providers.get(id)?.doc
    }
}

export const yjsPartyProviderPlugin = fp(async (fastify, options: { doc?: Y.Doc; yjsUrl?: string }) => {
    const {doc, yjsUrl} = {...defaults, ...(options || {})} 
    
    fastify.decorate("docs", new docsManager(yjsUrl, fastify.log));

    fastify.decorate("doc", {
        getter() {
            return fastify.docs.getOrCreate(doc?.guid, ()=>doc)
        }
    });

});

export const yjsProviderSubdocPlugin = fp(async (fastify, options: { doc?: Y.Doc; yjsUrl?: string , room?:string}) => {
    const { doc, yjsUrl, room } = {...defaults, ...(options ||{})}

    function watchDoc(doc: Y.Doc){
        const subDocProviders = new Map<string, YProvider>();
        doc.on("subdocs", onSubdocs);
        function onSubdocs({ loaded, added, removed }: { loaded: Set<Y.Doc>, added: Set<Y.Doc>, removed: Set<Y.Doc> }) {
            // Handle newly added subdocuments
            for (const subDoc of loaded) { 
                const id=`${doc.guid}/${subDoc.collectionid}/${subDoc.guid}`;
                if (!subDocProviders.has(id)) {
                    const provider = new YProvider(yjsUrl, subDoc.guid, subDoc);
                    subDocProviders.set(id, provider);
                    console.log(`Yjs subdoc provider created: ${yjsUrl}\t\n\tparent:${doc.guid}\n\t\troom: ${provider.roomname}\t collection:${provider.doc.collectionid}\t doc: ${provider.doc.guid}\t connected: ${provider.wsconnected}\t party:${provider.id}`);
                    provider.on("wsconnected", () => {
                        fastify.log.info(`Yjs subdoc provider connected: ${yjsUrl}\t room: ${provider.roomname}\t doc: ${provider.doc.guid}\t connected: ${provider.wsconnected}\t party:${provider.id}`);
                    })
                    
                    // watchDoc(subDoc);

                    provider.connect(); 
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


    }
 
 
    function watchSubDoc(subdoc: Y.Doc) {
        function onSubdocs({ loaded, added, removed }: { loaded: Set<Y.Doc>, added: Set<Y.Doc>, removed: Set<Y.Doc> }){
            for (const subDoc of loaded) {
                doc.subdocs.add(subDoc);
            }
 
        }
        subdoc.on("subdocs", onSubdocs);
    }
        
 

    watchDoc(doc);


    fastify.decorate("subdocs", {
        getter(){
            return doc.subdocs
        }
    });

 

   
});

export default yjsPartyProviderPlugin;
