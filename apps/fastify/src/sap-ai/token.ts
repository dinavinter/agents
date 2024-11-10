import { env } from "node:process"
import Fastify from "fastify";
export type Creds= { client_id: string, client_secret: string, token_url: string }
 
async function getToken(this: {access_token?:string, expires_at:Date},creds?: Creds){
    if(this.access_token && this.expires_at > new Date(Date.now())){
        return this.access_token;
    } 
    const {access_token,expires_in} = await fetchToken(creds || credsFromEnv());
    this.access_token = access_token; 
    this.expires_at = new Date(Date.now() + expires_in * 1000);  
    return this.access_token;

    async function fetchToken(creds: Creds) {
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
        if(response.status > 300) throw new Error(`Failed to fetch token: ${response.statusText}  ${await response.text()}`);
        return await response.json() as {access_token:string, expires_in:number};
    }
}


export const useToken = getToken.bind({ expires_at: new Date(0)});

 

export function credsFromEnv() {
    return {
        client_id: env.SAP_CLIENT_ID!,
        client_secret: env.SAP_CLIENT_SECRET!,
        token_url: env.SAP_TOKEN_URL!
    }
}