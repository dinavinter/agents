import {fromPromise} from "xstate";


export type Creds= { client_id: string, client_secret: string, token_url: string }

export async function fetchToken( creds: Creds) {
    const response = await fetch(`${creds.token_url}?grant_type=client_credentials`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${btoa(`${creds.client_id}:${creds.client_secret}`)}`
        },
        body: JSON.stringify({
            client_id: creds.client_id,
            client_secret: creds.client_secret,
            grant_type: "client_credentials",
        }),
    });
    if(!isSuccessfulStatus(response.status )) throw new Error(`Failed to fetch token: ${response.statusText}  ${await response.text()}`);
    console.log("success response from token api" , response.status, response.statusText);
    const {access_token} = await response.json() as {access_token:string};
    return access_token
} 
export function isSuccessfulStatus(status: number){
    return status >= 200 && status < 300;
}

export const tokenRequest=fromPromise(({input}:{input:Creds}) => fetchToken(input));



