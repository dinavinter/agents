import lumeCMS from "lume/cms/mod.ts";

const cms = lumeCMS();
cms.collection({
    name: "agents",
    store: "src:_data/agents",
    label: "To create, edit or delete an agent", 
    
    fields: [
        "title: text!",
        "content: code",
        "ver: text",
        "tags: text"
    ],
    url: "/agents/",
    documentName(data) {
        return `${data.title}.md`;
    },
    documentLabel(name: string) {
        return name.replace(".md", "");
    },
});

export default cms;
