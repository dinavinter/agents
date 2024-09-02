import {c, useRef, css, usePromise, html} from "atomico";
import {useSlot} from "@atomico/hooks/use-slot";

export const UserFetch = c(
    () => {
        const refSlotTemplateUser = useRef();
        const [Template] = useSlot(refSlotTemplateUser);
        const promise = usePromise(
            () =>
                fetch("https://jsonplaceholder.typicode.com/users").then((res) =>
                    res.json()
                ),
            [],
            true
        );

        return (html`
                    <host shadowDom>
                        <slot name="template" ref=${refSlotTemplateUser}/>
                        <div class="list">
                            ${promise.fulfilled
                                    ? !!Template &&
                                    promise.result.map((props) => html`<${Template} ${{...props}} cloneNode/>`)
                                    : "Pending..."}
                        </div>
                    </host>`
        );
    },
    {
        styles: css`
			.list {
				display: grid;
				grid-gap: 1rem;
				padding: 1rem;
			}

			[name="template"] {
				display: none;
			}
        `,
    }
);

customElements.define("component-user-fetch", UserFetch);
