import {c, css, html} from "atomico";

export const ChatBubble = c(({content, name, img, swap }) => {
    return html`<div  class="flex items-start gap-2.5  p-2 m-2 w-full">
            <img class="w-12 h-12 rounded-full" src=${img} alt=${name} />
            <div class="flex flex-col gap-1 w-full">
                <div class="flex items center space-x-2 rtl:space-x-reverse">
                    <span class="sm:text-sm md:text-lg lg:text-2xl font-semibold text-gray-900 dark:text-white">${name}</span>
                    <span class="text-sm  lg:text-lg font-normal text-gray-500 dark:text-gray-400">${new Date(Date.now()).toLocaleTimeString()}</span>
                </div>
                <div class="leading-1.5 p-4 border-gray-200 bg-gray-100 rounded-e-xl rounded-es-xl dark:bg-gray-700 flex-grow ">
                  <pre class="text-lg text-slate-900 inline text-wrap" sse-swap="${swap}">${content}</pre>
                </div>
            </div>
        </div>
    `;
},{
    props: {
        swap: {
            type: String,
            reflect: true
        },
        content: {
            type: String,
            reflect: true
        },
        name: {
            type: String,
            reflect: true
        },
        img: {
            type: String,
            reflect: true
        }
    },
    styles: css`
        @tailwind base;
        @tailwind components;
        @tailwind utilities;
        @tailwind screens;
        
        :host {
            display: block;
            width: 100%;
        }
    `
});


customElements.define('chat-bubble', ChatBubble);
