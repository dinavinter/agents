// 'use client';
import {c, html, useEffect, useState} from "atomico";
import { useAttributes } from "@atomico/hooks/use-attributes";
// import {useScript} from "@atomico/use-script";

  // import {setDashoffset} from "animejs";

//@jsdoc
/**
 * @typedef {Object} AnimeProps
 * @property {a.AnimeParams} anime 
 */

export const Anime=c(function () {

    const attrs = useAttributes();
    async function animate() {
        console.log('animate', attrs)
        const {default: animejs} = await import("animejs");
        animejs({
            targets: '.lines path', 
            strokeDashoffset: [animejs.setDashoffset, 0],
            delay: function(el, i) { return i * 250 },

            // ...options,
            ...(attrs || {}),

        })
    }
    
    useEffect(()=>{
        const _ =animate()
    },[attrs])
    
    
    
    return html`<host shadowDom> 
        <slot>
            <svg viewBox="0 0 280 100">
                <g fill="none" fill-rule="evenodd" stroke="currentColor" stroke-width="1" class="lines">
                    <path class="el" d="M58 80V50.12C57.7 41.6 51.14 35 43 35a15 15 0 0 0 0 30h7.5v15H43a30 30 0 1 1 0-60c16.42 0 29.5 13.23 30 29.89V80H58z"/>
                    <path class="el" d="M73 80V20H58v60h15z"/>
                    <path class="el" d="M58 80V49.77C58.5 33.23 71.58 20 88 20a30 30 0 0 1 30 30v30h-15V50a15 15 0 0 0-15-15c-8.14 0-14.7 6.6-15 15.12V80H58zm75 0V20h-15v60h15z"/>
                    <path class="el" d="M118 80V49.77C118.5 33.23 131.58 20 148 20a30 30 0 0 1 30 30v30h-15V50a15 15 0 0 0-15-15c-8.14 0-14.7 6.6-15 15.12V80h-15zm-7.5-60a7.5 7.5 0 1 1-7.48 8v-1c.25-3.9 3.5-7 7.48-7z"/>
                    <path class="el" d="M133 65a15 15 0 0 1-15-15v-7.5h-15V50a30 30 0 0 0 30 30V65zm30 15V49.77C163.5 33.23 176.58 20 193 20a30 30 0 0 1 30 30v30h-15V50a15 15 0 0 0-15-15c-8.14 0-14.7 6.6-15 15.12V80h-15z"/>
                    <path class="el" d="M238 65a15 15 0 0 1 0-30c8.1 0 14.63 6.53 15 15h-15v15h30V49.89C267.5 33.23 254.42 20 238 20a30 30 0 0 0 0 60V65z"/>
                    <path class="el" d="M260.48 65a7.5 7.5 0 1 1-7.48 8v-1c.26-3.9 3.5-7 7.48-7z"/>
                </g>
            </svg>
        </slot>

    </host>`
    
})

customElements.define("c-animate",Anime)