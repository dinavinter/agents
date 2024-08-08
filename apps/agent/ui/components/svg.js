import {c, css, html, useEffect, usePromise, useRef, useState} from "atomico";


export const SVG=c(function ({src}) {

     const svgContainer =useRef();
     const refTemplate = useRef();
     const [svgElement, setSvgElement] = useState();
     
     const [animation, setAnimation] = useState();
    async function fetchSvg() {
        const res = await fetch(src);
        return await res.text(); 
    } 
    const svg = usePromise( fetchSvg, [src], true);
    
    useEffect(()=> {
        if (svg.fulfilled) {
            svgContainer.current.innerHTML = svg.result;
            const paths = svgContainer.current.querySelectorAll('path');
            console.log("update paths", paths)
            paths.forEach(path => {
                const length = path.getTotalLength();
                // path.classList.remove(path.classList);
                path.style.stroke = 'black';
                path.style.strokeDasharray = length;
                path.style.strokeDashoffset = length;
                path.style.strokeWidth = 7;
                path.style.fill = 'white';

            });
            setSvgElement(svgContainer.current);

        }
    },[svg, svgContainer.current])

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
    
    

    return html`<host  >
        <template ref="${refTemplate}"><div ref=${svgContainer}></div></template>
        ${svgElement && html`<${svgElement}  />`}
    </host>`

},{
    props:{
        anime: { type: Object, value: {} },
        src: { type: String},
        alt: { type: String},
    },
    styles:css`
        :host {
            display: inline-block;
            position: relative;
            width: 100%;
            height: 100%;
        }
	    div {
		    width: 100%;
		    height: 100%;
	    }
	    svg {
		    width: 100%;
		    height: 100%;
		    display: block;
		    object-fit: contain;
	    }


    `
})

 

customElements.define("c-svg",SVG)
 