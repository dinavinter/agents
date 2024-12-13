import type {Pushable} from "it-pushable";

interface EventMessage {
    /**
     * Message payload
     */
    data?: string;

    /**
     * Message identifier, if set, client will send `Last-Event-ID: <id>` header on reconnect
     */
    id?: string;

    /**
     * Message type
     */
    event?: string;

    /**
     * Update client reconnect interval (how long will client wait before trying to reconnect).
     */
    retry?: number;

    /**
     * Message comment
     */
    comment?: string;
}

interface SSEReply {
    sseContext: { source: Pushable<EventMessage> };
    sse(source: AsyncIterable<EventMessage> | EventMessage): void;
}
export async function* transformAsyncIterable(
    source: AsyncIterable<EventMessage>
): AsyncIterable<string> {
    for await (const message of source) {
        yield serializeSSEEvent(message);
    }
}

var htmlEncoder =new TextEncoder();
export function serializeSSEEvent(chunk: EventMessage): string {
    let payload = "";
    if (chunk.id) {
        payload += `id: ${chunk.id}\n`;
    }
    if (chunk.event) {
        payload += `event: ${chunk.event}\n`;
    }
    if (chunk.data) {
        payload += `data: ${chunk.data.replace(/\s+/g, " ").replace('\n', '')}\n`;
    }
    if (chunk.retry) {
        payload += `retry: ${chunk.retry}\n`;
    }
    if (chunk.comment) {
        payload += `:${chunk.comment}\n`;
    }
    if (!payload) {
        return "";
    }
    payload += "\n";
    return payload;
}
