import {withYPartyProvider, YDocsManager} from "~/htmx";


export default eventHandler((event) => {

    const yjsUrl= useRuntimeConfig(event).yjsUrl;
    const room= getRouterParam(event, 'room')

    const docManger= withYPartyProvider(new YDocsManager(), yjsUrl, room);

    const doc = docManger.getOrCreateDoc();
    event.respondWith(new Response(doc.sse(), {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    }));

});
