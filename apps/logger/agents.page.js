export default async function* () {
     const agents= fetch('https://localhost:3000/agents')
        .then(response => response.json())
    
    for  (const agent of Object.values(agents)) {
        yield agent;
    }
}
