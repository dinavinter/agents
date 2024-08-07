import {c, css, html, useEffect, usePromise, useRef, useState} from "atomico";


export const SVG=c(function ({src}) {

     const svgContainer =useRef();
     
     const [animation, setAnimation] = useState();
    async function fetchSvg() {
        const div = document.createElement('div');
        const res = await fetch(src);
        return await res.text(); 
    }

    const svg = usePromise( fetchSvg, [src], true);
    useEffect(()=> {
        if (svg.fulfilled) {
            svgContainer.current.innerHTML = svg.result;
            animate()
        }
        async function animate() {
            const {default: animejs} = await import("animejs");
            const paths = svgContainer.current.querySelectorAll('path');
            paths.forEach(path => {
                const length = path.getTotalLength();
                path.style.stroke = 'black';
                path.style.strokeDasharray = length;
                path.style.strokeDashoffset = length;
                path.style.strokeWidth = 4;
                path.style.fill = 'white';
            });
            
            // const svg = svgContainer.current.querySelector('svg');
            // svg?.removeAttribute('viewBox');

            setAnimation(animejs({
                targets: 'svg path',
                strokeDashoffset: [animejs.setDashoffset, 0],
                easing: 'easeInOutSine',
                duration: 3000,
                delay: function(el, i) { return i * 100 },
                direction: 'normal',
                loop: true


            }))
        }
    },[svg, svgContainer.current])
    
    useEffect(()=>{
       animation?.play()
    }, [animation])
    


    return html`<host  >
        <div ref=${svgContainer}></div>
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
 