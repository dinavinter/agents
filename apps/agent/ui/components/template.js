import {useEffect, useRef} from "atomico";
import {useSlot} from "@atomico/hooks";

export const CTemplate = c(function ({props}) {
    const refSlotTemplate = useRef();
    const Templates = useSlot(refSlotTemplate, el => el instanceof Element);

    useEffect(() => {
        console.debug("YTemplate:reflecting properties", {props, Templates})
        Templates.forEach((Template) => {
            Object.assign(Template, props)
        })
    }, [props, Templates])

    return <host shadowDom>
        <slot ref={refSlotTemplate}/>
    </host>

}, {
    props: { 
        props: {
            type: Object,
            reflect: false
        }
    }
})

export default CTemplate;
customElements.define("c-template", CTemplate)