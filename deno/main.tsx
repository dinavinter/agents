/** @jsx jsx */
/** @jsxImportSource hono/jsx */
import { Hono } from "jsr:hono";
import { jsx  } from "https://deno.land/x/hono@v4.3.11/jsx/base.ts";
import { jsxRenderer  } from "https://deno.land/x/hono@v4.3.11/middleware/jsx-renderer/index.ts";
import {h} from "https://deno.land/x/hono@v4.3.11/jsx/h.ts";

declare module 'https://deno.land/x/hono@v4.3.11/mod.ts' {
    interface ContextRenderer {
        (
            content: string | Promise<string>,
            props: { apiKey:string, domain:string, ip?:string , gigyaSig?:string },
        ): Response
    }
}

const app = new Hono();

app.get(
    "/page/*",
    jsxRenderer(({ children, domain,apiKey, ip,gigyaSig  }) => {
        return (
            <html> 
            <body>
            <header>
                <nav>
                    <a href="/page/il3">IL3</a>
                    <a href="/page/us1">US1</a>
                </nav>
            </header>
             <div> 
                <form action={"/test"} target="#target">
                    <input type="text" name="domain" placeholder="domain" value={domain} />
                    <input type="text" name="apiKey" placeholder="apiKey" value={apiKey} />
                    <input type="text" name="ip" placeholder="ip" value={ip} />
                    <input type="text" name="gigyaSig" placeholder="gigyaSig"  value={gigyaSig}/>
                    <button type="submit">Submit</button>
                </form>
                 
                 <iframe id={"target"}/>
                 
                 {children}
             </div>
            </body>
            </html>
        );
    }),
) ;

app.post("/test", async (c) => {
    const {domain, apiKey, ip, gigyaSig} = await c.req.json<{ apiKey:string, domain:string, ip:string; gigyaSig:string }>();
    const url = encodeURIComponent(`https://${c.req.header("origin")}/login_result`);
    return c.redirect(`https://${domain}/accounts.socialLogin?x_provider=testnetwork3&client_id=${apiKey}&redirect_uri=${url}&response_type=token`)
})


app.get("/page/il3", (c) => {
    return c.render(
        <div>
            IL#
        </div>, {
            domain: "il3.gigya.com",
            apiKey: "6_2_xt-AzHlXthGu0raG0CMupw",
            ip: "109.108.40.0" ,
            gigyaSig: "Q]CUqR=V"
        }
    );
});

app.get("/page/us1", (c) => {
    return c.render(
        <div>
            US1
        </div>, {
            domain: "accounts.gigya.com",
            apiKey: "4_k_tZDGc87b65mIRvdzUQAQ",
            ip: "109.108.40.0",
            gigyaSig: "Q]CUqR=V"
        }
    )
});



 Deno.serve(app.fetch);

async function test(
  domain: string,
  apiKey: string,
  ip: string,
  gigyaSig: string,
) {
  const gmid = await getGmid(
    await fetch(
      `https://${domain}/accounts.webSdkBootstrap?apiKey=${apiKey}&pageURL=&context=TestContext&format=json&callback=gigya.callback&authMode=cookie&apikey=${apiKey}&httpStatusCodes=true`,
    ),
  );
  const url = encodeURIComponent("http://localhost/login_result");
  const init = await fetch(
    `https://${domain}/accounts.socialLogin?x_provider=testnetwork3&client_id=${apiKey}&redirect_uri=${url}&response_type=token`,
    {
      redirect: "manual",
      headers: {
        "cookie": `gmid=${gmid}`,
        "X-FORWARDED-FOR": ip,
        "X-GIGYA-SIG": gigyaSig,
      },
      credentials: "include",
      mode: "cors",
    },
  );
  const state = new URL(init.headers.get("location")).searchParams.get("state");
  const code = btoa(JSON.stringify({
    type: "code",
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    testProfile: JSON.stringify({
      firstName: "test",
      id: "test",
    }),
  }));

  return await fetch(
    `https://${domain}/socialize.finalizelogin?code=${code}&state=${state}`,
    {
      headers: {
        "cookie": `gmid=${gmid}`,
        "X-FORWARDED-FOR": ip,
        "X-GIGYA-SIG": gigyaSig,
      },

      credentials: "include",
      mode: "cors",
    },
  );
}


Deno.serve(async (req: Request) => {
  if (req.method == "GET") {
    return new Response(
      `
          <html>
             <body>
                <form method="POST">
                  <input type="text" name="domain" placeholder="domain" autocomplete="domain">
                  <input type="text" name="apiKey" placeholder="apiKey" autocomplete="apiKey">
                  <input type="text" name="ip" placeholder="ip" autocomplete="ip">
                  <input type="text" name="gigyaSig" placeholder="gigyaSig" autocomplete="gigyaSig">
                  <button type="submit">Submit</button>
                </form>
                </body>
            </html>
     `,
      {
        headers: {
          "content-type": "text/html",
        },
      },
    );
  } else {
    const formData = await req.formData();
    return new Response(
      `
          <html>
             <body>
                 <script>
                    ${test}
                    test("${formData.get("domain")}", "${
        formData.get("apiKey")
      }", "${formData.get("ip")}", "${formData.get("gigyaSig")}")
                  </script>
                </body>
            </html>
     `,
      {
        headers: {
          "content-type": "text/html",
        },
      },
    );
  }
});

async function printResponse(response: Response) {
  console.log("Request:", response.url);
  console.log(JSON.stringify(Object.fromEntries(response.headers), null, 2));
  console.log("===============================\n\n\n");
  console.log("Response:", response.status, response.statusText);
  console.log(
    "LogDog: ",
    `https://logdog.gigya.net/?callID=${response.headers.get("x-callid")}`,
  );
  console.log("Body:");
  console.log(await response.text());
  console.log("Headers:");
  console.log(JSON.stringify(Object.fromEntries(response.headers), null, 2));
  console.log("===============================\n\n\n");
  return response;
}

async function pipeLog({ status, ...response }: Response) {
  if (status !== 200 && status !== 0) {
    return await printResponse({
      status,
      ...response,
    });
  }
  return response;
}

async function getGmid(response: Response) {
  await pipeLog(response);
  return response.headers?.get("set-cookie")?.match(/gmid=(.*?);/) ? [1] : "";
}
