import {c, css, html, useEffect, usePromise, useRef, useState} from "atomico";
import {useRender} from "@atomico/hooks";


function styleSvgPath(dom) {
    const paths = dom.querySelectorAll('path');
    paths.forEach(path => {
        const length = path.getTotalLength();
        path.style.stroke = 'black';
        path.style.strokeDasharray = length;
        path.style.strokeDashoffset = length;
        path.style.strokeWidth = 7;
        path.style.fill = 'white';

    });
}

export const SVG=c(function ({src}) {
    const [animation, setAnimation] = useState();
    const svg = usePromise(fetchSvg, [src], true);

    async function fetchSvg() {
        const res = await fetch(src);
        const dom=new DOMParser().parseFromString(await res.text(), 'image/svg+xml');
        styleSvgPath(dom);
        return dom.firstChild;
    } 
    

    useEffect(() => {
        svg.fulfilled && animate()
        async function animate() {
            const {default: animejs} = await import("animejs");
            setAnimation(animejs({
                targets: 'svg path',
                strokeDashoffset: [animejs.setDashoffset, 0],
                easing: 'easeInOutSine',
                duration: 3000,
                delay: function (el, i) {
                    return i * 100
                },
                direction: 'normal',
                loop: true


            }))
        }
    }, [svg.fulfilled])


    useEffect(()=>{
       animation?.play()
    }, [animation])

    useRender(() => {
        console.debug("svg:useRender", svg.fulfilled, svg.result)
        return svg.fulfilled && html`<${svg.result }  />` 
    }, [svg.fulfilled])

    return html`<host shadowDom >
         <slot></slot>    
    </host>`

},{
    props:{
        anime: { type: Object, value: {} },
        src: { type: String, reflect: true},
        alt: { type: String, reflect: false },
    },
    styles:css`
        


    `
})

 

customElements.define("c-svg",SVG)
 