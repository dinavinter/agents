import {c, css, html, useEffect, usePromise, useRef, useState} from "atomico";
import {useRender} from "@atomico/hooks";


export const SVG=c(function ({src}) {
    const [svgElement, setSvgElement] = useState(document.createElement('div')); 
    const [animation, setAnimation] = useState();
    const svg = usePromise(fetchSvg, [src], true);

    async function fetchSvg() {
        const res = await fetch(src);
        return await res.text(); 
    } 
    
    useEffect(()=> {
        if (svg.fulfilled) {
            const doc = new DOMParser();
            const dom=doc.parseFromString(svg.result, 'image/svg+xml');
            const paths = dom.querySelectorAll('path');
            paths.forEach(path => {
                const length = path.getTotalLength();
                path.style.stroke = 'black';
                path.style.strokeDasharray = length;
                path.style.strokeDashoffset = length;
                path.style.strokeWidth = 7;
                path.style.fill = 'white';

            });
            setSvgElement(dom.firstChild);

        }
    },[svg?.fulfilled])

    useEffect(() => {
        svgElement && animate()
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
    }, [svgElement])


    useEffect(()=>{
       animation?.play()
    }, [animation])

    useRender(() => {
        console.debug("svg:useRender", svgElement)
        return html`<${svgElement}  />` 
    }, [svgElement])

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
 