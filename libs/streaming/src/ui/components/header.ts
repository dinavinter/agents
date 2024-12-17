import {c, html} from "atomico";

export const Header =c(function Header({title}) {
    return html`<header class="sticky top-0 z-10 backdrop-filter backdrop-blur bg-opacity-30 border-b border-gray-200 flex h-6 md:h-14 items-center justify-center px-4 text-xs md:text-lg font-medium sm:px-6 lg:px-8">
                <slot>${title}</slot>
            </header> 
    `;
},{
    props: {
        title: String,
    }
})

customElements.define('c-header', Header);