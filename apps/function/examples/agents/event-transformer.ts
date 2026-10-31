import { AnyEventObject } from "https://esm.sh/xstate@^5.19.0";

export interface BaseEvent {
  id?: string;
  type?: string;
  data: unknown;
}

export interface HTMXEvent {
  data: string;
  type?: string;
  id?: string;
  timestamp?: number;
  offset?: number;
}

export type TransformOptions = {
  wrapInArticle?: boolean;
  swapStrategy?: 'innerHTML' | 'outerHTML' | 'beforeend' | 'afterbegin';
  customWrapper?: (content: string) => string;
}

export class EventTransformer {
  private static defaultOptions: TransformOptions = {
    wrapInArticle: true,
    swapStrategy: 'innerHTML',
  };

  /**
   * Transforms a simple event or data into an HTMX+SSE compatible event
   */
  static transform(event: BaseEvent | unknown, options: TransformOptions = {}): HTMXEvent {
    const opts = { ...this.defaultOptions, ...options };
    const baseEvent = this.normalizeEvent(event);
    
    let content: string;
    
    // Handle different types of data
    if (typeof baseEvent.data === 'string') {
      content = baseEvent.data;
    } else {
      content = JSON.stringify(baseEvent.data, null, 2);
    }

    // Apply HTMX attributes and wrapping
    if (opts.wrapInArticle) {
      content = this.wrapInArticle(content, baseEvent.id, opts.swapStrategy);
    } else if (opts.customWrapper) {
      content = opts.customWrapper(content);
    }

    return {
      data: content,
      type: baseEvent.type,
      id: baseEvent.id,
      timestamp: Date.now(),
      offset: 0, // Can be calculated if needed
    };
  }

  /**
   * Creates a stream transformer that can be used with async generators
   */
  static createStreamTransformer(options: TransformOptions = {}) {
    return async function* (source: AsyncGenerator<unknown>) {
      for await (const event of source) {
        yield EventTransformer.transform(event, options);
      }
    };
  }

  private static normalizeEvent(event: BaseEvent | unknown): BaseEvent {
    if (this.isBaseEvent(event)) {
      return event;
    }
    
    return {
      id: crypto.randomUUID(),
      type: 'event',
      data: event,
    };
  }

  private static isBaseEvent(event: unknown): event is BaseEvent {
    return typeof event === 'object' && event !== null && 'data' in event;
  }

  private static wrapInArticle(content: string, id?: string, swapStrategy: string = 'innerHTML'): string {
    const sseSwap = id ? `sse-swap="${id}"` : '';
    const hxSwap = `hx-swap="${swapStrategy}"`;
    
    return `<article class="shadow">
      <code ${sseSwap} ${hxSwap} lang="json">${content}</code>
    </article>`;
  }
}

// Example usage:
/*
const simpleEvent = {
  data: { message: "Hello World" },
  id: "123",
  type: "greeting"
};

const transformed = EventTransformer.transform(simpleEvent);

// Or with a stream:
async function* eventStream() {
  yield "Simple string event";
  yield { data: "Object event" };
  yield { id: "custom-id", data: { complex: "data" } };
}

const transformer = EventTransformer.createStreamTransformer();
const transformedStream = transformer(eventStream());
*/
