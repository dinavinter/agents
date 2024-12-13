function trimLastSlash(requestURL: URL):string {
    return requestURL.href.endsWith("/") ? requestURL.href.slice(0, -1) : requestURL.href
    
}

const ssePrefix = "/sse"

export default defineEventHandler((event) => {
    const url = getRequestURL(event)
    
    console.log(event.headers.get("accept"), event.path, url.href)
    
    if (!event.headers.get("accept")?.includes("text/event-stream") && !event.path.startsWith(ssePrefix) && event.headers.get("accept")?.includes("text/html")  ) {
        ``
        const src=`${url.origin}${ssePrefix}?url=${encodeURIComponent(url.href)}`
        console.log("src", src)
        return new Response(`<embed type="text/html"  src="${src}" style="width:100%;height:100%;" />`, {
            headers: {
                "content-type": "text/html",
                "cache-control": "no-cache,no-transform"
            }
        })

        // return new Response(`<html>
        //             <head>
        //                  <script src="https://unpkg.com/htmx.org@2.0.2"></script>
        //                  <script src="https://unpkg.com/htmx-ext-sse@2.2.2/sse.js"></script>
        //                 <script src="https://cdn.tailwindcss.com?plugins=forms,typography,aspect-ratio,line-clamp,container-queries"></script>
        //             </head>
        //             <body>  
        //                  <div hx-ext="sse" sse-connect="${url}/sse" sse-close="done" hx-ext="sse" sse-swap="message" hx-swap="beforeend" class="h-screen w-screen"/>
        //             </body>
        //             </html> `, {
        //     headers: {
        //         "content-type": "text/html",
        //         "cache-control": "no-cache,no-transform"
        //     }
        // })
    }
    
   
});