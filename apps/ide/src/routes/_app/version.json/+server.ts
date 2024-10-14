
export function GET(): ReturnType<import('./$types').RequestHandler> {
    return new Response(
        JSON.stringify({"version":"1728836195366"}),
        {
            headers: {
                'content-type': 'application/json; charset=utf-8',
                'cache-control': 'public, max-age=31536000, immutable',
            }
        }
    )
}