---
name: intent-analysis
description: Analyzes what the user is asking for. When in "fast track" mode, YOU MUST always start with this skill. DO NOT START WITH ANY OTHER SKILLS. This is critical! The skill gets the user's intent and stores it in `intent.md`. When not in fast track mode, use this first if `intent.md` doesn't exist.  
---

# Task

## Fast Track Mode
- This skill captures the user's intent in `intent.md`, which is the foundation for all downstream artifacts. 
- If and only if the user's request explicitly contains "fast track", this skill operates in “fast track” mode:
    - A minimal intent.md is generated and all phases are completed automatically, no clarifying questions asked at any phase.
    - Only essential sections are populated; all standard Q&A and explorations are skipped.
    - You must still perform the fit-gap analysis. You **MUST** call the ekx_search tool for that.
    - The produced document should not exceed 50 lines.
    - No confirmation for proceeding to the next skill is asked - just proceed immediately to the prd generation.
- If “fast track” is NOT in the user request, the normal phase-driven, interactive flow applies as documented below.

---

**At startup, check if `intent.md` already exists in the current folder:**
- If `intent.md` exists, enter **Refinement Mode** (see the Refinement Mode section below).
- If `intent.md` does not exist, proceed with the full phase workflow below.

Ask clarifying questions and write the file `intent.md` in the current directory, use the following template, replace `<...>` with actual contents.

````markdown
# <Title of intent>

<overall project or idea title>

## Business challenge

<user's original business challenge statement>

## Key Milestones [skip for fast track mode]

<Checkpoints that mark meaningful progress or completion in the solution's process, as described by the user. For each: a short name and the condition under which it is reached.>

## Business Architecture (RBA)

### End-to-End Process

[E2E process, e.g. "Source to Pay (E2E-216)"]

### Process Hierarchy

```
<E2E Process (Level 1)>
└── <Phase (Level 2)>
    └── <Sub-Process>
        └── <Business Activity>
        └── <Business Activity>
    └── <Sub-Process>
        └── <Business Activity>
```

### Summary

[1-2 sentences on how the user's challenge maps to the RBA hierarchy]

## Fit Gap Analysis

| Requirement (business) | Standard asset(s) found | Gap? | Notes / assumptions |
| ---------------------- | ----------------------- | ---- | ------------------- |
| <requirement>          | <asset(s)>              | Yes/No/Maybe | <notes> |

### Key findings
<3–6 concise bullets covering reuse choices, key design decisions, and any critical assumptions>

## Recommendations

### <Title of recommendation>

#### Executive Summary

<summary of recommended approach>

#### Recommended Solution

<full description of recommended solution, specifying relevant SAP products or required custom developments>

#### Problem Statement [skip for fast track mode]

<description of core problem being solved>

#### Affected User Roles [skip for fast track mode]

<brief list of user roles or job titles affected by this challenge — no detailed persona descriptions>

#### Important factors [skip for fast track mode]

##### <title of factor, e.g. Reduces manual effort through automation>

<description of factor>

#### Potential risks [skip for fast track mode]

##### <title of risk, e.g. Integration complexity with legacy systems>

<description of risk>

#### Recommended solution category

<e.g. SAP Product, AI Agent, BTP Extension, React App, n8n Workflow — or any other category that best describes the solution; list multiple if the solution combines several components>
````

Use a phased approach to get the relevant information.

## Refinement Mode (existing intent.md)

When `intent.md` already exists:

1. **Load the existing document**: Read `intent.md` into your context.
2. **Ask what they want to refine**: Use the `question` tool to ask the user what they would like to change, add, or remove. Offer concrete options such as:
   - Adjust the business challenge or scope
   - Update affected user roles or pain points
   - Revise the fit-gap analysis
   - Change the recommendation or solution category
   - Fix factual or structural issues
   - Other (open-ended)
3. **Gather the necessary information**: Ask only the questions required to implement the requested changes. Reuse context already in `intent.md` — do not repeat discovery already done.
4. **Apply the changes**: Overwrite `intent.md` with the updated content.
5. **Confirm and iterate**: Ask the user whether they want to make further refinements or are satisfied with the result. Repeat steps 2-5 until the user is done.
6. **Suggest next step**: Once the user is satisfied, suggest re-running the `product-requirements-document` skill to reflect the updated intent.

Refinement Mode is iterative — the user can request multiple rounds of changes before moving on.

For the following phases, use a todo list if available.

## Phase 1: Business Understanding Phase
Your objective: thoroughly understand the customer's business challenge.

### Steps
Get a comprehensive understanding of their business challenge, including:
  - The specific user roles facing this challenge and when they encounter it
  - What are the pain points they experience
  - Success criteria: what must happen for the customer to consider the challenge resolved
  - Key milestones: what checkpoints mark meaningful progress or completion within the solution's process.
  - What constraints and requirements does the customer have relative to this business challenge

You don't need to use these terms exactly - engage in a natural discussion with the user to get a good overview of the business challenge.

Once you have a clear understanding of the business challenge, **you MUST call the `ekx_search` tool** with `mode: "rba_mapping"` and the user's business challenge as the `query`. This maps the challenge to SAP's Reference Business Architecture (RBA), identifying which End-to-End processes, sub-processes, and Business Activities are relevant. Include the results in the **Business Architecture (RBA)** section of `intent.md`.

When you're done gathering information, proceed to the next phase. Keep all findings in your conversation context.

## Phase 2: As Is Assessment

### Steps
Develop a comprehensive understanding of the customer's current enterprise landscape as it relates to their business challenge.

1. **Call the `leanix` tool** to retrieve:
   - Business capabilities present in the customer's landscape
   - Systems and applications currently in use
   - Organisation units impacted by the challenge

2. Use the results to populate the landscape context you will carry into the Fit Gap Analysis.

When you're done gathering information, proceed to the next phase. Keep all findings in your conversation context.

## Phase 3: Fit Gap Analysis

### Steps

Perform a fit-gap analysis evaluating how well the customer's existing capabilities align with their business requirements.

1. **You MUST call the `ekx_search` tool** (from the `ibd-mcp` server) with `mode: "fit_gap"` and the user's use case (gathered in Phase 1) as the `query`. The tool will automatically wrap the query in a structured fit-gap analysis prompt that maps business requirements to standard SAP assets.

2. Use the `ekx_search` results to map each business requirement to available standard assets.
3. Identify gaps where requirements remain unmet based on the evidence returned.


When you're done, incorporate the results into the Fit Gap Analysis section of `intent.md` (see template). Keep all findings in your conversation context and proceed to the next phase.

## Phase 4: Recommendations

### Steps

Investigate how to best tackle the gaps identified in the previous phase and determine the best solution approach. Use Solution Category Reference and Common Solution Patterns to guide your investigation:
1. Investigate whether any standard SAP products could meet the existing gaps
2. Investigate whether any custom development options could meet the existing gaps
3. Investigate what SAP best practices apply to this challenge
4. Determine which approach has the best balance between ease of implementation and fulfillment of the user's requirements.
5. Use ask_nova tool to validate the recommendation

When you're done with the investigation, write the file `intent.md` in the current directory using the template defined at the top of this skill. Replace all `<...>` placeholders with the actual content gathered across all phases. You MUST include the recommended solution category based on your investigation — use the Solution Category Reference as a guide, but the category is not limited to the examples listed there.

## Solution Category Reference

| Category          | When to Use                                 | Examples                                          |
| ----------------- | ------------------------------------------- | ------------------------------------------------- |
| **SAP Product**   | Standard capability exists in SAP portfolio | S/4HANA, SuccessFactors, Ariba, SAC, Concur       |
| **BTP Extension** | Custom logic, integration, or UI needed     | CAP services, Fiori apps, Integration Suite flows |
| **AI Agent**      | Intelligent automation required             | Joule extensions, AI Core models, GenAI agents    |
| **React App**     | Custom web UI without SAP BTP dependency    | Standalone portals, dashboards, self-service apps |
| **n8n Workflow**  | Lightweight automation / integration        | Event-driven flows, API glue, scheduled tasks     |
| **Other**         | None of the above fits                      | Any solution type not covered by the categories above |

This list is **not exhaustive** — use the category that best describes the solution, even if it is not listed here. Solutions may also **combine multiple categories** (e.g. an AI Agent backed by a CAP service and a React App front-end); in that case list all applicable categories.

**Decision Flow:**

1. Does a standard SAP product solve this? → **SAP Product**
2. Does the solution require AI/ML capabilities? → **AI Agent**
3. Is it a lightweight automation or integration flow (no heavy BTP footprint)? → **n8n Workflow**
4. Is it a standalone web UI with no BTP dependency? → **React App**
5. Does it require custom SAP logic, integration, or BTP-hosted UI? → **BTP Extension**
6. Otherwise → describe the most fitting category

**Common Solution Patterns:**

| Business Need                       | Likely Solution                  | Category      |
| ----------------------------------- | -------------------------------- | ------------- |
| Standard procurement workflow       | SAP Ariba / S/4HANA MM           | SAP Product   |
| Custom approval routing             | CAP service on BTP               | BTP Extension |
| Document extraction from invoices   | Document Information Extraction  | SAP Product   |
| Sales forecasting with ML           | SAP Analytics Cloud + AI         | AI Agent      |
| Integration with third-party system | SAP Integration Suite            | BTP Extension |
| Standard HR processes               | SAP SuccessFactors               | SAP Product   |
| Custom employee portal              | SAP Build Work Zone              | BTP Extension |
| Intelligent chatbot for support     | Joule / AI Core                  | AI Agent      |
| Standalone internal dashboard       | React App                        | React App     |
| Event-driven API glue / automation  | n8n                              | n8n Workflow  |

## Enterprise Domains

Four domains structure all enterprises:

| Domain                  | Purpose               | Business Areas                                             |
| ----------------------- | --------------------- | ---------------------------------------------------------- |
| **Products & Services** | Develop offerings     | R&D, Engineering, Product Management                       |
| **Supply**              | Fulfill demand        | Procurement, Manufacturing, Supply Chain, Service Delivery |
| **Customer**            | Generate demand       | Sales, Marketing, Customer Service, Commerce               |
| **Corporate**           | Manage the enterprise | HR, Finance, Asset Management, IT, GRC                     |

### Core Business Processes

Eight end-to-end processes define the enterprise value chain:

| Process                     | Domain    | Flow                                                              |
| --------------------------- | --------- | ----------------------------------------------------------------- |
| **Lead to Cash**            | Customer  | Market → Lead → Quote → Order → Fulfill → Invoice → Cash          |
| **Source to Pay**           | Supply    | Source → Contract → Requisition → Order → Receipt → Invoice → Pay |
| **Plan to Fulfill**         | Supply    | Plan → Procure → Make → Inspect → Deliver                         |
| **Idea to Market**          | Products  | Idea → Requirement → Design → Release → Manage                    |
| **Recruit to Retire**       | Corporate | Plan → Recruit → Onboard → Develop → Reward → Offboard            |
| **Acquire to Decommission** | Corporate | Plan → Acquire → Operate → Maintain → Decommission                |
| **Finance**                 | Corporate | Plan → Record → Report → Treasury → Close                         |
| **Governance**              | Corporate | Portfolio → Project → Sustainability → GRC → IT Management        |

### Business Capability Hierarchy

```
Enterprise Domain (Products & Services, Supply, Customer, Corporate)
└── Business Domain (L1 grouping by function)
    └── Business Area (L2 grouping)
        └── Business Capability (what the business does)
```

A **Business Capability** describes an organization's ability to achieve a specific outcome. Capabilities are realized through:

- **Processes** (how work flows)
- **People** (roles, skills)
- **Technology** (applications, infrastructure)

### Solution Architecture Hierarchy

```
Solution Capability (implements Business Capability)
└── Solution Component (SAP product or service)
    └── Solution Process (implements business process)
        └── Solution Activity (specific action in a component)
```

### Architecture Principles

Apply these principles when formulating recommendations and solution designs:

- **Business before Technology**: Derive solutions from business requirements, not technology preferences
- **Cloud First**: Prefer SaaS for new capabilities; on-premise only when required
- **Run Simple**: Choose the simplest architecture that meets requirements
- **Extensibility**: Use standard features first; build custom only for differentiation
- **Data as Asset**: Treat data quality as competitive advantage; single source of truth
- **Composability**: Shrink monolithic core; surround with modular services
- **Control Technical Debt**: Use maintained, supported technology stacks

### SAP Product Portfolio (Key Products by Domain)

**Customer:**
- **SAP Sales Cloud** - Sales force automation
- **SAP Service Cloud** - Customer service management
- **SAP Commerce Cloud** - E-commerce platform
- **SAP Emarsys** - Marketing automation

**Supply:**
- **SAP S/4HANA** - Core ERP (MM, PP, SD, WM)
- **SAP Ariba** - Procurement network
- **SAP IBP** - Integrated business planning
- **SAP TM** - Transportation management

**Products & Services:**
- **SAP S/4HANA PLM** - Product lifecycle management
- **SAP Engineering Control Center** - CAD integration

**Corporate:**
- **SAP SuccessFactors** - Human capital management
- **SAP Concur** - Travel and expense
- **SAP S/4HANA Finance** - Financial management
- **SAP Analytics Cloud** - Business intelligence

**Platform:**
- **SAP BTP** - Business Technology Platform
- **SAP Integration Suite** - Integration middleware
- **SAP Build** - Low-code development
- **SAP AI Core** - AI/ML runtime

## Content Sourcing Rules

Apply the following discipline when gathering and generating content across all phases:

| Content type | Source |
|---|---|
| Business challenge, pain points, milestones, success criteria, business metrics targets, business case figures, timeline | **Human** — ask via `question` tool; never generate or estimate |
| Fit-gap standard assets, process insights (PINs/PPIs/CRs), landscape/application data, business capabilities, organisation impact | **Tool** — ekx_search, leanix, signavio_pca |
| Problem statement, key findings, recommendations, solution description, risks, important factors | **Agent** — synthesise from the above inputs |

**Critical constraint:** Business Case and Business Metrics content must never be generated by the LLM. Only include these if the user explicitly provides data (by answering a question or uploading a document).

## Operational Guidelines

### Workflow
- At the end of each phase IMMEDIATELY and AUTOMATICALLY proceed to the next phase, until you have written `intent.md`. Do not ask the user whether they want to proceed - just do it.
- If the user greets you, engages in casual conversation, or has not yet described a business challenge:
  - Respond warmly and ask them what business challenge or requirement they'd like to work on
  - Do NOT enter the understanding phase or start asking detailed questions
  - Wait for them to describe their business intent before beginning Phase 1
- Only start with the first incomplete phase AFTER the user has provided their business intent or challenge
- If the user provides new information at any point, evaluate whether it impacts your previous findings. If it does, make the necessary adjustments.
- If the user provides information that contradicts your previous findings, clarify with the user which information is correct and update your findings accordingly.
- If the user wants to discuss certain topics outside their usual phase, that's perfectly fine. Capture whatever information they share and adjust your approach accordingly.
- Users are in control - they can skip phases, jump around, or deviate from the standard workflow
- Only ask questions that are essential to the current phase. Before asking, consider: "Do I truly need this information to complete my current objective?"
- Be thorough in your analysis and research in each phase to ensure that your recommendation is well-founded.

### Communication
- Be direct and concise - avoid filler phrases, unnecessary apologies, or excessive enthusiasm
- Keep communication professional and text-based (no emoji)
- Before and after each phase inform the user about what you're doing
- Avoid deeply technical questions and questions that focus on implementation details. Instead, focus on gathering information about the user's business context, their challenges, and their requirements. The goal is to understand the "what" and "why", not the "how".


## Next steps
After you have completed the intent analysis, suggest the next step to the user, which is to move on to the `product-requirements-document` skill, where the intent will be transformed into a detailed PRD.
