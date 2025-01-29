import { Router } from "https://deno.land/x/oak/mod.ts";
import { WebSocketClient, WebSocketServer } from "https://deno.land/x/websocket/mod.ts";
import * as Y from "yjs";

const router = new Router();
const wss = new WebSocketServer(8080);
const doc = new Y.Doc();
const fragment = doc.getXmlFragment('html');

// WebSocket connection to sync YJS updates
wss.on("connection", (ws: WebSocketClient) => {
    ws.on("message", (message: string) => {
        try {
            const update = JSON.parse(message);
            if (update.type === 'update' && typeof update.content === 'string') {
                // Clear existing content
                while (fragment.length > 0) {
                    fragment.delete(0, 1);
                }
                
                // Add new content
                const container = new Y.XmlElement('div');
                container.setAttribute('class', 'container');
                container.push([new Y.XmlText(update.content)]);
                fragment.push([container]);
                
                // Broadcast update to all clients
                wss.clients.forEach((client) => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'update',
                            content: fragment.toJSON()
                        }));
                    }
                });
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });
});

// REST endpoint to get current HTML content
router.get("/html", (ctx) => {
    ctx.response.body = {
        content: fragment.toJSON()
    };
});

// REST endpoint to update HTML content
router.post("/html", async (ctx) => {
    const body = await ctx.request.body().value;
    if (body.content) {
        // Clear existing content
        while (fragment.length > 0) {
            fragment.delete(0, 1);
        }
        
        // Add new content
        const container = new Y.XmlElement('div');
        container.setAttribute('class', 'container');
        container.push([new Y.XmlText(body.content)]);
        fragment.push([container]);
        
        ctx.response.body = {
            status: "success",
            content: fragment.toJSON()
        };
    } else {
        ctx.response.status = 400;
        ctx.response.body = {
            status: "error",
            message: "Content is required"
        };
    }
});

export default router;
