
export type GithubLoaderParams = {repo: string, branch: string, accessToken?: string}
export type GithubContentFile =  {url:string , path:string,  src:string; branch: string, repo: string} 
export async function getRepoFiles({repo,branch, accessToken}: GithubLoaderParams):Promise<GithubContentFile[]> {
       let url = `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`;

        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github+json'
        };

        const response = await fetch(url, { headers }) ;
        if (!response.ok) {
            throw new Error(`Failed to fetch files: ${response.status} ${response.statusText}`);
        }
        const json = await  response.json()   as {tree: {
                type: string,
                path: string,
                url: string
            }[]};
        const files = json.tree.filter((file) => file.type === 'blob' );
        return files.map((file) => ({
            ...file,
            branch, repo,
            src:`https://raw.githubusercontent.com/${repo}/${branch}/${file.path}`, 
        })); 
}


