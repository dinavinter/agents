import * as Y from 'https://esm.sh/yjs@13.6.23';
import { connectYjs } from 'https://esm.town/v/dinavinter/connect';
import { embedMany, embed, cosineSimilarity, streamObject, tool } from 'https://esm.sh/ai';
import { azure } from 'https://esm.sh/@ai-sdk/azure';
import { yMapIterate, filterAsync } from 'https://esm.sh/@cxai/stream';
import { bufferTimeCountAsync } from 'https://esm.town/v/dinavinter/buffer';
import { z } from 'https://esm.sh/zod';

// -----------------------
// Yjs Setup
// -----------------------
const usersDoc = new Y.Doc({ guid: "users-doc-mock" });
const usersMap = usersDoc.getMap<{ uid: string, profile?: object, data?: object }>("account");
const userEmbeddings = usersDoc.getMap<number[]>("embeddings");
connectYjs(usersDoc);

const groupsDoc = new Y.Doc({ guid: "users-group-doc-mock" });
const groupsMap = groupsDoc.getMap("groups");
const groupEmbeddingsMap = groupsDoc.getMap<number[]>("embeddings");
const distanceMap = groupsDoc.getMap("distances");
const userGroupsMap = groupsDoc.getMap<string[]>("users");
connectYjs(groupsDoc);

// -----------------------
// Helper Functions
// -----------------------
function isNewValue<T>({ newValue }: { newValue: unknown }): newValue is { newValue: T } {
    return !!newValue;
}

function toId(key: string): string {
    return key.replaceAll(" ", "-").toLowerCase();
}

async function visualizeGroups(): Promise<void> {
    userGroupsMap.observe(() => {
  
    console.log("==== Visualization of Groups ====");
    console.log("GroupsMap:", groupsMap.toJSON());
    console.log("Group Embeddings:", groupEmbeddingsMap.toJSON());
    console.log("Distances:", distanceMap.toJSON());
    console.log("User Groups Map:", userGroupsMap.toJSON());
    console.log("===================================");

    });
}

// -----------------------
// 1. Embedding Users
// -----------------------
// For each user update, embed the user profile and store it in the userEmbeddings map.
async function embedUsers(): Promise<void> {
    console.log("[embedUsers] Waiting for new user embedding changes...");
    const changes = yMapIterate(usersMap);
    const newVals = filterAsync(changes, isNewValue);
    const bufferedValues = bufferTimeCountAsync(newVals, 600, 2);

    for await (const userEntries of bufferedValues) {
        console.log("[embedUsers]  embedding user changes...");
        const texts = userEntries.map(([uid, user]) =>
            JSON.stringify({
                uid,
                ...user.profile,
                ...user.data,
            })
        );
        try {
            const { embeddings, usage } = await embedMany({
                model: azure.embedding('text-embedding-ada-002'),
                values: texts,
            });
            console.log("[embedUsers] Embedding usage:", usage);
            userEntries.forEach(([uid, user], idx) => {
                userEmbeddings.set(uid, embeddings[idx]);
                console.log(`[embedUsers] Set embedding for user ${uid}`);
            });
        } catch (error) {
            console.error("[embedUsers] Error during batch embedding:", error);
        }
    }
}

// -----------------------
// 2. Generating Groups
// -----------------------
// When user embeddings update, generate groups using an AI chat call.
async function genGroups(): Promise<void> {
    const changes = yMapIterate(userEmbeddings);
    const newVals = filterAsync(changes, isNewValue);
    const bufferedValues = bufferTimeCountAsync(newVals, 600, 2);

    for await (const _ of bufferedValues) {
        console.log("[genGroups] Generating groups..." , Array.from(usersMap.keys().length));
        const promptText = `
You are an AI assistant that groups user profiles.
Group the following users into at least 3 dynamic groups based on shared or complementary attributes.
Output each group as an object with:
  - name: the group name in lowercase kebab-case,
  - description: a brief description,
  - attributes: an array of attributes defining the group.
Search for users that match the query and group them accordingly.`;

        // Here we use streamObject to simulate an AI chat call.
        const { elementStream } = streamObject({
            model: azure('gpt-4o'),
            output: 'array',
            system: promptText,
            schema: z.object({
                name: z.string().describe('the name of the group, in lowercase kebab-case'),
                description: z.string(),
                attributes: z.array(z.string()),
            }),
            tools: {
                findUsers: tool({
                    description: `Find users that match the given query.`,
                    parameters: z.object({
                        question: z.string().describe('the user query'),
                    }),
                    execute: async ({ question }) => {
                        // Replace with your actual search for relevant content.
                        return [];
                    },
                }),
            },
        });

        for await (const { name, ...group } of elementStream) {
            const groupId = toId(name);
            groupsMap.set(groupId, group);
            console.log(`[genGroups] Set group: ${groupId} with data:`, group);
        }
    }
}

// -----------------------
// 3. Embedding Groups
// -----------------------
// For each group update, embed the group's JSON representation and save to groupEmbeddingsMap.
async function embedGroups(): Promise<void> {
    for await (const [key] of yMapIterate(groupsMap)) {
        console.log("[embedGroups] Embedding groups...");

        try {
            // For groups, we embed the JSON string of the group object.
            const groupData = JSON.stringify(groupsMap.get(key));
            const { embeddings, usage } = await embedMany({
                model: azure.embedding('text-embedding-ada-002'),
                values: [groupData],
            });
            console.log(`[embedGroups] Embedding usage for group ${key}:`, usage);
            groupEmbeddingsMap.set(key, embeddings[0]);
        } catch (error) {
            console.error(`[embedGroups] Error embedding group ${key}:`, error);
        }
    }
}

// -----------------------
// 4. Updating Distances
// -----------------------
// For each group embedding and each user embedding, compute the cosine similarity and store it.
export async function updateDistances(): Promise<void> {
    for await (const [groupKey, { newValue: groupEmbedding }] of filterAsync(yMapIterate(groupEmbeddingsMap), isNewValue)) {
        console.log("[updateDistances] Calculating distances between groups and users...");

        const group = groupKey;
        for await (const [uid, { newValue: userEmbedding }] of filterAsync(yMapIterate(userEmbeddings), isNewValue)) {
            const similarity = cosineSimilarity(groupEmbedding, userEmbedding);
            if (similarity > 0.8) {
                console.log(`[updateDistances] User ${uid} is similar to group ${group} with similarity ${similarity.toFixed(3)}`);
            }
            // Store similarity in a sub-map for the group
            groupsDoc.getMap(group).set(uid, similarity);
            // Update distanceMap with current state of the group's distances
            distanceMap.set(group, groupsDoc.getMap(group).toJSON());
        }
    }
}

// -----------------------
// 5. Updating Group Memberships
// -----------------------
// For each distance update, sort users by similarity and update the userGroupsMap.
export async function updateGroups(): Promise<void> {
    for await (const [group, { newValue: distances }] of filterAsync(yMapIterate(distanceMap), isNewValue)) {
        console.log("[updateGroups] Updating group memberships based on distances...");

        const userDistances = Object.entries(distances as Record<string, number>);
        userDistances.sort((a, b) => a[1] - b[1]); // Lower distance means higher similarity
        const sortedUids = userDistances.map(([uid]) => uid);
        // For example, assign top 3 most similar users to the group.
        userGroupsMap.set(group, sortedUids.slice(0, 3));
        console.log(`[updateGroups] Group ${group} updated with users:`, sortedUids.slice(0, 3));
    }
}

// -----------------------
// Pipeline Runner
// -----------------------
// Run all steps in parallel and log progress.
async function pipeline(): Promise<void> {
    console.log("===== Pipeline Starting =====");

    await Promise.all([
        embedUsers(),
        genGroups(),
        embedGroups(),
        updateDistances(),
        updateGroups(),
        visualizeGroups()
    ]);

    console.log("===== Pipeline Completed =====");

}

// Run the pipeline
pipeline().catch(console.error);

// -----------------------
// Example Usage: Populate Users
// -----------------------
usersMap.set("shalom", {
    uid: "shalom",
    profile: { name: "shalom", email: "gCzqB@example.com", interests: ["music"], specialities: ["music", "sport"] },
    data: { department: "CDP" }
});
usersMap.set("david", {
    uid: "david",
    profile: { name: "david", email: "gCzqB@example.com", interests: ["pets"], specialities: ["music", "sport"] },
    data: { department: "CDP" }
});
usersMap.set("homer", {
    uid: "homer",
    profile: { name: "homer", email: "gCzqB@example.com", interests: ["programming"], specialities: ["coding", "cooking"] },
    data: { department: "ctf" }
});
usersMap.set("roni", {
    uid: "roni",
    profile: { name: "roni", email: "gCzqB@example.com", interests: ["programming"], specialities: ["coding", "sport"] },
    data: { department: "ctf" }
});
usersMap.set("sara", {
    uid: "sara",
    profile: { name: "sara", email: "gCzqB@example.com", interests: ["music"], specialities: ["coding", "sport"] },
    data: { department: "cdc" }
});
usersMap.set("sarel", {
    uid: "sarel",
    profile: { name: "sarel", email: "gCzqB@example.com", interests: ["music"], specialities: ["coding", "sport"] },
    data: { department: "cdc" }
});
usersMap.set("john", {
    uid: "john",
    profile: { name: "john", email: "john@example.com", interests: ["reading", "music"], specialities: ["writing", "music"] },
    data: { department: "ENG" }
});
usersMap.set("maria", {
    uid: "maria",
    profile: { name: "maria", email: "maria@example.com", interests: ["travel", "photography"], specialities: ["design", "storytelling"] },
    data: { department: "MKT" }
});
usersMap.set("alex", {
    uid: "alex",
    profile: { name: "alex", email: "alex@example.com", interests: ["sports", "programming"], specialities: ["coding", "analytics"] },
    data: { department: "IT" }
});
usersMap.set("linda", {
    uid: "linda",
    profile: { name: "linda", email: "linda@example.com", interests: ["cooking", "music"], specialities: ["culinary", "management"] },
    data: { department: "HR" }
});
usersMap.set("steve", {
    uid: "steve",
    profile: { name: "steve", email: "steve@example.com", interests: ["gaming", "reading"], specialities: ["coding", "design"] },
    data: { department: "DEV" }
});
usersMap.set("kate", {
    uid: "kate",
    profile: { name: "kate", email: "kate@example.com", interests: ["art", "music"], specialities: ["creative", "marketing"] },
    data: { department: "MKT" }
});
usersMap.set("mike", {
    uid: "mike",
    profile: { name: "mike", email: "mike@example.com", interests: ["programming", "pets"], specialities: ["coding", "analysis"] },
    data: { department: "IT" }
});
usersMap.set("anna", {
    uid: "anna",
    profile: { name: "anna", email: "anna@example.com", interests: ["travel", "cooking"], specialities: ["management", "culinary"] },
    data: { department: "HR" }
});
usersMap.set("james", {
    uid: "james",
    profile: { name: "james", email: "james@example.com", interests: ["sports", "reading"], specialities: ["fitness", "leadership"] },
    data: { department: "OPS" }
});
usersMap.set("emma", {
    uid: "emma",
    profile: { name: "emma", email: "emma@example.com", interests: ["music", "art"], specialities: ["design", "creative"] },
    data: { department: "MKT" }
});

usersMap.set("lisa", {
    uid: "lisa",
    profile: { name: "lisa", email: "lisa@exa.com" , interests: ["music", "art"], specialities: ["design", "creative"] },
    data: { department: "MKT" }
});
