import {c, css, html} from "atomico";

export const ChatBubble = c(({ content, name, img, swap }) => {
    return html`<div class="flex items-start gap-4 p-4 m-4 w-full bg-gray-50 dark:bg-gray-800 rounded-lg shadow">
        <img class="w-12 h-12 rounded-full" src=${img} alt=${name}  />
        <div class="flex flex-col gap-2 w-full">
            <div class="flex items-center space-x-2 rtl:space-x-reverse">
                <span class="text-lg font-semibold text-gray-900 dark:text-white"  sse-swap="@${swap}.name" hx-swap="innerHTML">${name}</span>
                <span class="text-sm font-normal text-gray-500 dark:text-gray-400" sse-swap="@${swap}.status" hx-swap="innerHTML"></span>
            </div>
            <div class="p-4 border border-gray-200 bg-white dark:bg-gray-700 rounded-lg">
                <pre class="text-sm text-gray-900 dark:text-gray-300 whitespace-pre-wrap" sse-swap="${swap}" hx-swap="innerHTML">${content}</pre>
            </div>
        </div>
    </div>`;
}, {
    props: {
        swap: {
            type: String,
            reflect: true,
        },
        content: {
            type: String,
            reflect: true,
        },
        name: {
            type: String,
            reflect: true,
        },
        img: {
            type: String,
            reflect: true,
        },
    },
    styles: css`
		@tailwind base;
		@tailwind components;
		@tailwind utilities;

		:host {
			display: block;
			width: 100%;
		}
    `,
});

customElements.define("chat-bubble", ChatBubble);

