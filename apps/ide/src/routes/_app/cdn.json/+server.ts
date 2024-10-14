

export function GET(): ReturnType<import('./$types').RequestHandler> {
    return new Response(
        JSON.stringify({"version":"1.1.2-dev-20241013191650","dist-tag":"dev","git-sha":"3987bf579e3bdc5be295c6e2969b0988bdb28a53","imports":{},"packages":{}}),
        {
            headers: {
                'content-type': 'application/json; charset=utf-8',
                'cache-control': 'public, max-age=31536000, immutable',
            },
        },
    )
}
