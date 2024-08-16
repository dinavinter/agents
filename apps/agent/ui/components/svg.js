import {c, css, html, useEffect, useRef, useState} from "atomico";

function styleSvgPath(path) {
    const length = path.getTotalLength();
    path.style.stroke = '#FF0000'; // Red stroke for high visibility
    path.style.strokeWidth = 2;
    path.style.fill = 'none'; // No fill initially to ensure stroke visibility
    // Set the stroke-dasharray and dashoffset to create the drawing effect
    path.style.strokeDasharray = length;
    path.style.strokeDashoffset = length;

    // Add the animation class to animate the stroke
    path.classList.add('draw-path');
}

async function* fetchSvgInBatches(src) {
    const response = await fetch(src);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    let svgContent = '';

    let yieldPaths = [];
    while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        svgContent += decoder.decode(value, { stream: !done });

        const dom = new DOMParser().parseFromString(svgContent, 'image/svg+xml');
        const paths = Array.from(dom.querySelectorAll('path'));

        for (const path of paths.filter(path => !yieldPaths.includes(path))) {
            yield {path, svgElement: dom.documentElement};
            yieldPaths.push(path);
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }
}

export const SVG = c(function ({ src }) {
    const [svgPaths, setSvgPaths] = useState([]);
    const svgElement = useRef();

    useEffect(() => {
        const loadSvg = async () => {
            for await (const { path, svgElement: elm } of fetchSvgInBatches(src)) {

                if(elm.getAttribute("viewBox") && svgElement.current.getAttribute("viewBox") !== elm.getAttribute("viewBox") ) {
                    svgElement.current.setAttribute("viewBox", elm.getAttribute("viewBox"));
                }

                styleSvgPath(path);
                setSvgPaths(prevPaths => [...prevPaths, path]);
            }
        };

        loadSvg();
    }, [src]);

    return html`<host shadowDom>
        <svg ref="${svgElement}" viewBox="0 0 100 100">
            ${svgPaths.map(path => html`<${path} />`) }
        </svg>
    </host>`;
}, {
    props: {
        src: { type: String, reflect: true },
        alt: { type: String, reflect: false },
    },
    styles: css`
		svg {
			width: 100%;
			height: 100%;
			display: inline;
		},
	:host {
		display: inline-block;
		width: 100%;
		height: 100%;
	}

		/* CSS Animation for Handwriting Effect */
		.draw-path {
			animation: draw 1s ease-in-out forwards;
		}

		@keyframes draw {
			from {
				stroke-dashoffset: 100%; /* Start with the stroke completely hidden */
			}
			to {
				stroke-dashoffset: 0%; /* Draw the stroke fully */
			}
		}
    `
});

customElements.define("c-svg", SVG);
