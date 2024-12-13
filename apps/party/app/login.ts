import PartySocket from "partysocket";
import type {StoreElement} from "./store";

export  class LoginButton extends HTMLElement {
     constructor() {
        super();
        const shadowRoot =this.attachShadow({ mode: 'open' });
        shadowRoot.innerHTML = `
            <slot>
                <button>Login</button>
            </slot>
        `;
        
        this.addEventListener("click", this.login);
    }


    private async login() {
        const store = document.querySelector('y-store') as StoreElement;

        console.log("login:click");
        const partySocket = new PartySocket({
            host: store.url,
            room: store.room
        });

        // await fetch("/party/catalog/login", {
        //     method: "POST",
        //     headers: {
        //         "Content-Type": "application/json"
        //     },
        //     body: JSON.stringify({token: "1234"})
        // })

        const yEvents = store.doc.getArray("events");
        yEvents.push([{
            type: "user.login", 
            date: new Date().toISOString(),
            token: new Date().toISOString()
        }]);

        partySocket.send("user.login");

    }
}

customElements.define('login-button', LoginButton);