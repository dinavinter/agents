function getContent(agent) {
    return fetch(`https://agents.cfapps.us10-001.hana.ondemand.com/agents/${agent.id}/src`)
        .then(response => response.text())
        
}

const agents = await
    fetch('https://agents.cfapps.us10-001.hana.ondemand.com/agents')
        .then(response => response.json())
        .then(result => Object.entries(result).map(async function ([id, agent]) {
            return {
                id: id,
                rev: agent.rev,
                url: `/agents/${agent.id}/`,
                name: agent.name || id,
                title: agent.name || id,
                layout: "agent.vto",
                type: "agent",
                content: await getContent(agent),
                
            }
        }))
        .then(agents => Promise.all(agents));
export default function* () {
    yield {
        url: "/agent-1/",
        title: "Article 1",
        content: "Welcome to the article 1",
    };
    yield {
        url: "/agent-2/",
        title: "Article 2",
        content: "Welcome to the article 2",
    };
    yield {
        url: "/agent-3/",
        title: "Article 3",
        content: "Welcome to the article 3",
        type: "agent"
    };


    for  (const agent of Object.values(agents)) {
        yield  agent;
    }
}
