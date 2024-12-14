import YProvider from "https://esm.sh/y-partykit/provider";
import { parseArgs } from "jsr:@std/cli/parse-args";

const flags = parseArgs(Deno.args, {
    string: ["url" , "room", "collection", "doc", "src", ],
});

export function connect() {
    flags.url = flags.url || Deno.env.get("yjs_url") ||  "ws://localhost:1999";

    function doc() {
        return (flags.doc || flags.collection) && new Y.Doc({
            guid: flags.doc,
            collectionid: flags.collection,
            gc: false,
            autoLoad: true
        });
    }

    const provider = new YProvider(flags.url, flags.room, doc(), {
        disableBc: true,
        WebSocketPolyfill: WebSocket,
    });


    provider.on("wsconnected", () => {
        console.log(`Connected!: ${flags.url}\t room: ${provider.roomName}\t doc: ${provider.doc.guid}\t synced: ${provider.synced}`);
    })
    provider.connect();
    provider.doc.load()
    return provider;
}
