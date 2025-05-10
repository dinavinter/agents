/** @jsxImportSource npm:hono/jsx */
import { streamSSE} from "npm:hono/streaming";

import {createImageModel} from "https://esm.town/v/dinavinter/azure";
import {azure} from "npm:@ai-sdk/azure";
import {getOrCreateDoc} from "https://esm.town/v/dinavinter/doc";


import {renderer} from "https://esm.town/v/dinavinter/htmx_layout";
import {experimental_generateImage as generateImage, Message, streamText, tool} from "npm:ai";
import {Hono} from "npm:hono";
import {cors} from "npm:hono/cors";
import {z} from "npm:zod";
const model = createImageModel("dall-e-3", {
    maxImagesPerCall: 1
});

async function* generateImageFromMessages() {
    try {
        const result = await generateImage({
            model: model,
            prompt: "create a beautiful image of a cat",
            // size: "256X256",
            providerOptions: {
                openai: { style: 'natural', quality: 'standard' },
            },
            abortSignal: AbortSignal.timeout(3000), // Abort after 3 second

        });
        doc.getMap("images").set("cat", result.image.base64);
        console.log("image", result);

    }
    catch (e) {
        console.error("failed to gen image",e);
    }
}
generateImageFromMessages()
const doc = getOrCreateDoc("temp-img-test");
const app = new Hono();

app.use("*", cors({origin: "*"}));
app.get("*", renderer());

app.get("/", async (c) => {
     
    return c.render(
        <div
            hx-ext="sse"
            sse-connect="images"
            sse-swap="image"
            hx-swap="beforeend transitions:true swap:1s settle:1s"
            class="h-screen w-screen"
        >
            <div class="h-64 w-64 p-6 m-2 object-fit">loading...</div>
        </div>,
    );

 

});

app.get("/request", async (c) => {
    const result = await streamText({
        maxSteps: 1,
        model: azure("gpt-40"),
        toolChoice: 'required', // force the model to call a tool

        messages: [
            {
                role: "user",
                content: [
                    {type: "text", text: "Generate an protait image based on my images"},
                    {type: "image", image: new URL(`https://i.postimg.cc/NM3v22gk/IMG-20240702-WA0003-1.jpg`)},
                ],
            },
        ],
        tools: {
            generateImage: tool({
                description: "Generate an image",
                parameters: z.object({
                    name: z.string().describe("The name of the image to generate, max 6 letters"),
                    prompt: z.string().describe("The prompt to generate the image from"),
                }),
                execute: async ({prompt, name}) => {
                    let result = null;
                    console.log("gen image", prompt, name);
                    try {
                        result = await generateImage({
                            model,
                            prompt,
                            // size: "256x256",
                            abortSignal: AbortSignal.timeout(3000), // Abort after 3 second

                        });
                        console.log("ressssult", result);
                        doc.getMap("images").set(name, result.image.base64);
                        // in production, save this image to blob storage and return a URL
                        return {image: result.image.base64, prompt};
                    } catch (e) {
                        console.error(e, result);
                        throw e;
                    }
                },
            }),
        },
    });
    return c.render(
        <div
            hx-ext="sse"
            sse-connect="images"
            sse-swap="image"
            hx-swap="beforeend transitions:true swap:1s settle:1s"
            class="h-screen w-screen"
        >
            <pre>{await result.text}</pre>
            <div class="h-64 w-64 p-6 m-2 object-fit">loading...</div>
        </div>,
    );

    // console.log(model);
    // const result = await generateImage({
    //     model: model,
    //     prompt: "create a beautiful image of a cat",
    //     size: "1024x1024",
    //     providerOptions: {
    //         openai: { style: 'vivid', quality: 'hd' },
    //     }
    //     // abortSignal: AbortSignal.timeout(1000), // Abort after 1 second
    //
    // });
    // return c.html(<img src={`data:image/png;base64,${result.image.base64}`} />);

});

// app.get(
//     "/",
//     (c) =>
//         c.render(
//             <div
//                 hx-ext="sse"
//                 sse-connect="images"
//                 sse-swap="image"
//                 hx-swap="beforeend transitions:true swap:1s settle:1s"
//                 class="h-screen w-screen"
//             >
//                 <div class="h-64 w-64 p-6 m-2 object-fit">loading...</div>
//             </div>,
//         ),
// );

app.get("/images", c => {
    return streamSSE(c, async (stream) => { 
        const callback = async (events) => {
            for (const [key, {action, newValue, oldValue}] of events) {
                if (newValue) {
                    await stream.writeSSE({
                        event: "image",
                        data: `<img src="data:image/png;base64,${newValue}" class="h-64 w-64 p-6 m-2 object-fit" />`,
                        id: key,
                    });
                }
            }
        };
        doc.getMap("images").observe(callback);
        stream.onAbort(() => {
            doc.getMap("images").unobserve(callback);
        });
        
        while (true) {
            await new Promise((r) => setTimeout(r, 1000));
        }

    }); 
});
export default app;