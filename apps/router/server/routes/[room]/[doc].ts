import {withYPartyProvider, YDocsManager} from "~/htmx";


export default eventHandler((event) => {

  const yjsUrl= useRuntimeConfig(event).yjsUrl;
  const room= getRouterParam(event, 'room')
  const docId= getRouterParam(event, 'doc')
  console.log("room", room, docId); 
   const docManger= withYPartyProvider(new YDocsManager(), yjsUrl, room, docId);
   
    const doc = docManger.getOrCreateDoc(docId || "default");
    event.respondWith(new Response(doc.sse(), {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      }
    }));
  
});
