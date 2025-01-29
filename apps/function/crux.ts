
   /*
   crux.land
A free open-source registry for permanently hosting small scripts
Api
Alias
Logout
All endpoints are under the /api endpoint
GET /get/:id
returns the file associated with the id, optionally takes a file extension
GET /get/:alias@:tag
returns the file associated with the alias and tag, optionally takes a file extension
POST /add
Content-Type: application/json
NAME	TYPE	DESCRIPTION
name	string	The name of the script including extension
content	string	The file content base64-encoded
*/
 
export async function crux(name: string, code: string) {
    const response= await fetch("https://crux.land/api/add", {
         method: "POST",
         headers: {
             "Content-Type": "application/json",

         },
         body: JSON.stringify({
             content: btoa(code),
             name: `${name}`,
         }),
     });
     console.log("crux response" , response.statusText, response.body);
     const result= await response.text();
     const headers= {} as Record<string, string>;
     response.headers.forEach((value, key) => {
         headers[key]= value;
     })
      console.log("crux result", result, response.headers.get("Location"), response.url ,headers);
     return  await import(`https://crux.land/api/${result}`);
}