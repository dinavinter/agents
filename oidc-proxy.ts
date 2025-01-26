import { Application, Router } from "https://deno.land/x/oak/mod.ts";
 

const app = new Application();
const router = new Router();

router.get("/:apiKey/oidc", (ctx) => {
  const apiKey = ctx.params.apiKey;
  ctx.response.body = `<!DOCTYPE html>
        <html xmlns="http://www.w3.org/1999/xhtml">
        <head>
        <title>Open ID Connect Proxy Page </title>
        <script type="text/javascript" lang="javascript" src="https://cdns.gigya.com/JS/gigya.js?apiKey=${apiKey}"></script>
        <script type="text/javascript" lang="javascript" src="https://cdns.gigya.com/JS/gigya.oidc.js?apiKey=${apiKey}">
            {
                loginURL: "/${apiKey}/login",
                consentURL:  "/${apiKey}/consent",
                errorURL:  "/${apiKey}/error"
            }
        </script>
        </head>
        <body>
          
        </body>
        </html>`;
});

router.get("/:apiKey/login", (ctx) => {
  const apiKey = ctx.params.apiKey;

  ctx.response.body = `  
                <html>
                <head>
                    <script type="text/javascript" src="https://cdns.gigya.com/js/gigya.js?apiKey=${apiKey}"></script>
                </head>
                <body>
                    <div id="container"></div>
                    <script>
                        function redirectToProxy() {
                            var url = gigya.utils.URL.addParamsToURL("${
    ctx.request.url.replace("login", "oidc")
  }",{
                                mode: 'afterLogin'
                            });
                            window.location.href = url;
                        }
                        gigya.socialize.addEventHandlers({
                            onLogin: function() {
                                redirectToProxy();
                            }
                        });
                        gigya.accounts.showScreenSet({
                                screenSet: 'Default-RegistrationLogin',
                                containerID: "container",
                                sessionExpiration: '14400' // 4 hours
                        });
                    </script>
                </body>
                </html> `;
});

router.get("/:apiKey/error", (ctx) => {
  ctx.response.body = `<!DOCTYPE html>
                    <head>
                    <title>OP Error Page</title>
                    </head>
                    <body>
                    <div class="responseDiv" id="responseDiv" style="width: 50%; height: 50%; overflow: auto; text-align: left; margin: 0px auto;">
                    </div>
                    <script>
                        thisUri = window.location.href;
                        decodedUri = decodeURIComponent(thisUri);
                        decodedUri = decodedUri.replace("https://[URI_Of_Your-Error_Page]?", "");
                        decodedUri = decodedUri.replace(/,/g, ",<br />&nbsp;&nbsp;&nbsp;&nbsp;");
                        decodedUri = decodedUri.replace(/{/g, "{<br />&nbsp;&nbsp;&nbsp;&nbsp;");
                        decodedUri = decodedUri.replace(/}/g, "<br />}");
                        document.getElementById('responseDiv').innerHTML = decodedUri;
                    </script>
                    </body>
                    </html> `;
});

app.use(router.routes());
app.use(router.allowedMethods());
await app.listen({ port: 8000 });
