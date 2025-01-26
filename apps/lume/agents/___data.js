const agents = await
    fetch('http://localhost:3000/agents')
        .then(response => response.json())
        .then(result => Object.entries(result).map( function ([id, agent]) {
            return {
                id: id,
                rev: agent.rev,
                url: `/agents/${agent.id}/`,
                name: agent.name || id,
                title: agent.name || id,
                layout: "agent.vto",
                content: getContent(agent),
            }
        }));

function getContent(agent) {
    return `# ${agent.name || agent.id}
             ${agent.description || ''}
             ${agent.rev || ''}
          `;
}

export {
    agents
}