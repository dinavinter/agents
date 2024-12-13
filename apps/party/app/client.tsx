import "./styles.css";
// import type {GalleryElement} from "@y-block/gallery";
import YProvider from "y-partykit/provider";
import * as Y from "yjs";
// import '@y-block/gallery';
import './store';
import './login';
import './analysis';
import './ydocs';
import type {StoreElement} from "./store";


export function setupCatalog(element:HTMLDivElement) {
    // element.innerHTML = `<div hx-ext="sse" sse-connect="${document.location.origin}/events/catalog" sse-swap="catalog"></div>`

    // element.innerHTML = `  <div hx-ext="sse" sse-connect="/events/catalog"  hx-ext="sse"  hx-swap="beforeend"  class="flex flex-wrap shadow-md p-80 h-full	text-wrap overflow-wrap max-w-screen break-normal justify-center justify-items-center text-prettytruncate hover:text-clip overflow-y-scroll">  </div>`
    
}
 
 


if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/worker.js", {
        type: "module"
    }).then((registration) => {
        console.log("ServiceWorker registration successful with scope: ", registration.scope);

    }).catch((err) => {
        console.log("ServiceWorker registration failed: ", err);
    });

    navigator.serviceWorker.ready.then((registration) => {
        setupCatalog(document.querySelector("#app") as HTMLDivElement);
    })
}
    
else {
    console.log("ServiceWorker not supported");
}