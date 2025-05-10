import Subhosting from "https://esm.sh/subhosting";
import {
  Deployment,
  Deployments,
  Projects,
} from "https://esm.sh/subhosting/resources";

import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";


const subhosting = new Subhosting({
    bearerToken: Deno.env.get("DEPLOY_ACCESS_TOKEN"),
    organizationId: Deno.env.get("DEPLOY_ORG_ID"),
  });

  




const projectsApp = new Hono();



projectsApp.use(async (c, next) => {
    const { project } = c.req.param();
    c.set("project", project);
    await next()
    c.header('x-project',c.req.param("project"))
})

projectsApp.get("/:project", async (c) => {
    const {project} = c.req.param();
    return c.json(await subhosting.getProject(c.get("organization"), project));
})

// Poll deployment data from Subhosting API
projectsApp.get("/:project/workers", async (c) => {
    const deployments = await subhosting.listDeployments(c.get("project"), {
      order: "desc",
    });
    return c.json(deployments);
});


 
const workersApp = new Hono().basePath("/:worker");
workersApp.post("/", async (c) => {
        const dr = await subhosting.createDeployment(c.get("project"), {
      entryPointUrl: "main.ts", // maps to `main.ts` under `assets`
      assets: {
        "main.ts": {
          "kind": "file",
          "content": body.code,
          "encoding": "utf-8",
        },
      },
      envVars: {}, // if you need the code to have access to credentials, etc.
    });
    const deploymentResponse = await dr.json(); 
    return c.redirect(`/workers/${deploymentResponse.id}`);
})
workersApp.use(async (c, next) => {
    const { worker } = c.req.param(); 
    c.set("worker", workers.get(worker));
    await next()  
})

workersApp.get("/", async (c) => {
    return c.json(await subhosting.getDeployment(c.get("project"), c.get("worker")));
})



app.get("/projects", async (c) => {
    const projects = await subhosting.listProjects(c.get("organization"));
    return c.json(projects); 
})

app.post("/projects", async (c) => {
    const project = await subhosting.createProject(c.get("organization"), c.req.text());
    return c.redirect(`/projects/${project.id}`); 
})

app.use("/projects/:project", projectsApp);


projectsApp.use("/workers", workersApp.routes());

app.listen(3000);