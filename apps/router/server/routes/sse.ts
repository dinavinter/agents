export default eventHandler((event) => {
    const url = getRequestURL(event);

    return new Response(`<html>
            <head>
                 <script src="https://unpkg.com/htmx.org@2.0.2"></script>
                 <script src="https://unpkg.com/htmx-ext-sse@2.2.2/sse.js"></script>
                <script src="https://cdn.tailwindcss.com?plugins=forms,typography,aspect-ratio,line-clamp,container-queries"></script>
            </head>
            <body>  
                 <div hx-ext="sse" sse-connect="${url.searchParams.get("url")}" sse-close="done" hx-ext="sse" sse-swap="message" hx-swap="beforeend" class="h-screen w-screen"/>
            </body>
            </html> `, {
        headers: {
            "content-type": "text/html",
            "cache-control": "no-cache,no-transform"
        }
    })
});