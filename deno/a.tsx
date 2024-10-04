/** @jsx h */
import { Handlers, PageProps } from "https://deno.land/x/fresh@1.7.1/server.ts";

interface PageParams {
    domain: string;
    apiKey: string;
    ip?: string;
    gigyaSig?: string;
}

const pages: Record<string, PageParams> = {
    il3: {
        domain: "il3.gigya.com",
        apiKey: "6_2_xt-AzHlXthGu0raG0CMupw",
        ip: "109.108.40.0",
        gigyaSig: "Q]CUqR=V",
    },
    us1: {
        domain: "accounts.gigya.com",
        apiKey: "4_k_tZDGc87b65mIRvdzUQAQ",
        ip: "109.108.40.0",
        gigyaSig: "Q]CUqR=V",
    },
};

export const handler: Handlers<PageParams | null> = {
    async GET(_, ctx) {
        const params = ctx.params.page || "il3";
        const pageData = pages[params] || null;
        return ctx.render(pageData);
    },

    async POST(req) {
        const formData = await req.formData();
        const domain = formData.get("domain") as string;
        const apiKey = formData.get("apiKey") as string;
        const ip = formData.get("ip") as string;
        const gigyaSig = formData.get("gigyaSig") as string;

        const redirectUrl = `https://${domain}/accounts.socialLogin?x_provider=testnetwork3&client_id=${apiKey}&redirect_uri=${encodeURIComponent("http://localhost/login_result")}&response_type=token`;

        return Response.redirect(redirectUrl, 302);
    },
};

export default function Home({ data }: PageProps<PageParams | null>) {
    const pageData = data || pages.il3;

    return (
        <html>
        <body>
        <header>
            <nav>
                <a href="/">IL3</a>
                <a href="/us1">US1</a>
            </nav>
        </header>
        <div>
            <form action="/" method="post" target="#target">
                <input
                    type="text"
                    name="domain"
                    placeholder="domain"
                    value={pageData.domain}
                    readonly
                />
                <input
                    type="text"
                    name="apiKey"
                    placeholder="apiKey"
                    value={pageData.apiKey}
                    readonly
                />
                <input type="text" name="ip" placeholder="ip" value={pageData.ip} />
                <input
                    type="text"
                    name="gigyaSig"
                    placeholder="gigyaSig"
                    value={pageData.gigyaSig}
                />
                <button type="submit">Submit</button>
            </form>

            <iframe id="target"></iframe>
        </div>
        </body>
        </html>
    );
}
