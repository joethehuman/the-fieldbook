import type { Content } from "./types";
export const DOC_CATEGORY_ORDER = [
  "People and Culture",
  "Trust and Security",
  "Operations and Tools",
  "Product and Engineering",
  "Sales and Customer Success",
];

const md = (strings: TemplateStringsArray) =>
  strings.raw[0].replaceAll("\\`", "`").replaceAll("\\${", "${");

const base = {
  body: "",
  folder: "",
  status: "published" as const,
  version: 1,
  updatedAt: "2026-09-28T12:00:00.000Z",
  duration: 8,
  groups: [] as string[],
  lessons: [] as Content["lessons"],
  questions: [] as Content["questions"],
};

export const seedContent: Content[] = [
  {
    ...base,
    id: "hooli-doc-new-hire-first-week-guide",
    kind: "doc",
    title: "New Hire First-Week Guide",
    summary: "Welcome to Hooli.",
    category: "People and Culture",
    folder: "",
    updatedAt: "2026-09-28T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 8,
    groups: [],
    body: md`Welcome to Hooli. Your first week is a chance to learn how to find information, get access, and meet the people who can help. You do not need to memorize every acronym or understand the entire company before you begin contributing. If an answer is hard to find, asking where it lives is useful feedback about the documentation.

### Before your first day

Your manager or onboarding contact should share the basics: when to arrive or sign in, how to reach them, and what equipment or account setup to expect. Use only the official account-setup process. If a message asks you to share a password or recovery code, confirm it through a trusted channel instead.

### Day one: get oriented

Start with the people and systems needed for your role. Confirm that your own account works, learn how to request missing access, and meet your manager and immediate teammates. Find the current team priorities and ask where decisions are recorded. Do not use someone else's credentials if an account is not ready; ask the approved support channel for help.

- Meet your manager and learn the team's current focus.
- Confirm role-required systems and permissions.
- Find the team calendar and communication norms.
- Learn how to report an urgent customer or security issue.

### During the week: build a map

Ask which channels are for urgent requests, routine questions, and durable information. Learn how your team tracks work and how it signals that a task is complete. If the company uses terms you do not recognize, ask for a plain-language definition. Hooli's acronym count is not a measure of your progress.

| Need | First place to ask |
| --- | --- |
| Missing account access | Approved IT/help channel |
| Role expectations | Your manager |
| People policies | Current People documentation |
| Team priorities | Team planning space |
| Customer escalation | Your team's current escalation route |

### Set expectations with your manager

A useful first-week conversation covers near-term priorities, teammates, first-month expectations, and how to ask for feedback. Discuss access, schedule, or accommodation needs privately with the appropriate contact. Your manager should explain what is settled and what you are still expected to learn.

 This is not a test you have to pass. It is an orientation, and the company is responsible for making essential information findable. Keep your own notes free of customer secrets and other sensitive material. When in doubt, use the approved system and ask before sharing.`,
  },
  {
    ...base,
    id: "hooli-doc-manager-essentials",
    kind: "doc",
    title: "Manager Essentials",
    summary: "Managers at Hooli are responsible for clear expectations, useful feedback, fair decisions, and timely communication.",
    category: "People and Culture",
    folder: "",
    updatedAt: "2026-09-28T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 8,
    groups: [],
    body: md`Managers at Hooli are responsible for clear expectations, useful feedback, fair decisions, and timely communication. A manager does not need to have every answer immediately. They do need to distinguish confirmed information from assumptions and help employees reach the right source.

### Set priorities people can act on

A priority is useful when employees can explain what matters, why it matters, who owns the work, and what can wait. Keep the list short enough to guide choices. If two urgent priorities compete, help the team understand who can resolve the conflict. A stack of equally urgent requests is not a prioritization system; it is a colorful way to describe overload.

### Give feedback with examples

Describe the behavior or result, explain its effect, and invite the employee's view. Focus on what can change. Recognize useful contributions specifically. If feedback concerns a sensitive issue, choose a private setting. Do not surprise someone with a serious concern in a routine check-in without first giving them a fair chance to understand the issue.

### Support growth and well-being

Discuss what skills the employee wants to build and what opportunities are available. Do not promise promotion, compensation, or a role change unless you have the authority and confirmed information to do so. When someone raises a health, safety, or accommodation concern, listen respectfully and connect them with the appropriate confidential process rather than trying to diagnose or investigate it yourself.

| Manager action | Useful practice |
| --- | --- |
| Assign work | Clarify outcome, owner, and timing |
| Change priorities | Explain what moved and what should pause |
| Hear a concern | Listen, document only what is needed, and route appropriately |
| Make a decision | Share the decision and who approved it |

### Communicate during change

If reporting lines, ownership, or processes are changing, say what is known, what is not settled, and when people will hear more. Correct earlier information when it changes. Avoid interpreting draft plans as final. Give employees a place to ask individual questions privately.

### Keep the basics reliable

Managers should follow current company policy for hiring, performance, leave, privacy, and security. This guide is a quick reference, not a replacement for those policies. If a situation is urgent, involves potential harm, or falls outside your authority, contact the appropriate People, Security, Legal, or leadership resource. Clear boundaries protect both employees and managers.`,
  },
  {
    ...base,
    id: "hooli-doc-gavin-s-guide-to-gut-health",
    kind: "doc",
    title: "Gavin’s Guide to Gut Health",
    summary: "A fictional executive wellness memo.",
    category: "People and Culture",
    folder: "",
    updatedAt: "2026-09-28T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 8,
    groups: [],
    body: md`**A fictional executive wellness memo.** This page is satire, not medical advice, a diagnosis, or a company health policy. Gavin's enthusiasm for a subject does not make him a qualified medical source.

### The official Hooli position

Hooli believes every complex human system can be improved with a dashboard, a pilot program, and a surprisingly confident email. Digestion is not an exception to the joke, but real health is more complicated than a performance metric. People have different bodies, histories, needs, and access to care. There is no single routine that works for everyone.

### What this guide can safely say

General well-being may include habits such as eating a varied diet, drinking fluids, sleeping, and finding movement that feels appropriate for you. Those broad ideas are not a treatment plan. The right choices can depend on a person's health, medication, culture, resources, and advice from a qualified clinician.

Hooli does not ask employees to disclose private health details to managers, share medical records in workplace tools, or follow an executive's personal routine. If you have a concern about symptoms, nutrition, or a change in your health, speak with a qualified health professional who can consider your situation. If you need workplace support, use the appropriate confidential accommodation or benefits channel.

### A note about internet wellness claims

Be cautious with advice that promises a “reset,” claims to cure a condition, or sells a supplement as a universal solution. A chart, testimonial, or executive anecdote is not the same as reliable medical evidence. Ask who produced the claim, what evidence supports it, and whether the advice applies to you. Do not stop prescribed treatment because of a social post or company memo.

> Hooli's fictional wellness KPI is “gut feeling per employee.” It should not be used to assess anyone's health or performance.

### Privacy at work

Employees are not required to explain private medical details to participate in ordinary workplace life. Managers should not diagnose, prescribe, or pressure someone to discuss personal health. Direct health questions to qualified professionals and workplace questions to the approved confidential support process.

This guide makes the demo feel like a company with an overproduced wellness culture. The joke is executive certainty, not people's health. You can skip it. For medical questions, consult a qualified clinician.`,
  },
  {
    ...base,
    id: "hooli-doc-security-basics-and-incident-reporting",
    kind: "doc",
    title: "Security Basics and Incident Reporting",
    summary: "Security depends on everyday habits and a clear response when something goes wrong.",
    category: "Trust and Security",
    folder: "",
    updatedAt: "2026-09-28T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 8,
    groups: [],
    body: md`Security depends on everyday habits and a clear response when something goes wrong. This guide covers account safety, careful sharing, and prompt reporting. It is a practical starting point, not a substitute for Hooli's current security policy or instructions from the incident response team.

### Protect your account

Use your own account and the authentication method approved for your role. Keep passwords and recovery codes private. Turn on required multifactor authentication and use the company password manager if one is provided. Never approve an unexpected login prompt just to make it disappear. If you receive a suspicious request, verify it through a separate trusted route.

Hooli will not need your password in chat, email, or a support ticket. A manager's urgency does not make credential sharing safe. If your account is locked, use the official recovery path or contact approved support.

### Share only what is needed

Before sending a file or message, check the recipients and confirm they are allowed to see the information. Use approved storage for company work. Avoid posting customer, financial, or employee information in a public or broadly accessible channel. Do not use personal email or unapproved file-sharing services to work around an access issue.

Keep devices updated, lock screens when stepping away, and use approved networks and software. Report a lost device promptly so the right team can assess the risk.

### Recognize suspicious messages

Unexpected attachments, urgent payment requests, password prompts, and links that do not match the sender's claimed organization deserve scrutiny. Do not open an attachment if you are unsure. Ask the sender through a separate channel or report the message through Hooli's current security process.

### Report possible incidents quickly

Report suspected credential exposure, misdirected files, suspicious account activity, lost devices, or accidental public sharing as soon as you notice it. You do not have to determine whether it qualifies as an incident. Include what happened, when, and which account or device may be involved. Do not send passwords, recovery codes, or unnecessary copies of customer data in the report.

| Do | Avoid |
| --- | --- |
| Preserve the message or relevant details | Deleting evidence before reporting |
| Contact the approved response channel | Investigating beyond your role |
| Follow responder instructions | Waiting to see whether anyone notices |

 Responders can assess scope and tell you what to do next. If unsure which channel applies, contact the security contact in a verified company directory.`,
  },
  {
    ...base,
    id: "hooli-doc-responsible-ai-use",
    kind: "doc",
    title: "Responsible AI Use",
    summary: "AI tools can help people summarize, draft, organize, and explore ideas.",
    category: "Trust and Security",
    folder: "",
    updatedAt: "2026-09-28T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 8,
    groups: [],
    body: md`AI tools can help people summarize, draft, organize, and explore ideas. Their outputs can also be wrong, incomplete, or based on information that should not have been shared. Use only tools approved for your work and follow the current policy for the type of information involved.

### Check the input before you submit it

Do not enter customer records, credentials, unreleased financial information, confidential employee details, or other restricted information unless the tool and use case are explicitly approved. When the tool's data retention or access terms are unclear, pause and ask the designated reviewer. Removing a name does not necessarily make a detailed record anonymous.

### Treat the output as a draft

Verify factual claims against reliable sources. Recheck calculations, quotations, dates, and product availability. Look for invented citations, missing context, and language that could reveal sensitive details. A confident tone does not establish accuracy. For customer-facing work, confirm that every capability claim matches released behavior and current approved wording.

| Before sharing | Ask |
| --- | --- |
| Accuracy | Can I verify the important claims? |
| Privacy | Does the output expose information that should stay private? |
| Fairness | Could the result treat people inconsistently or unfairly? |
| Authority | Does this decision belong to a qualified person? |

### Keep a person accountable

The person who uses or shares the output remains responsible for it. Make material AI assistance visible when policy or the audience requires it. Do not delegate hiring, legal, security, medical, financial, or other consequential decisions to an AI system. Use the established human review process.

### Report problems

If a tool exposes restricted information, produces harmful content, or behaves outside its approved use, stop using it for that task and report the concern through the current process. Preserve only the information responders need. Do not test the problem with real customer or employee data.

Hooli's “Responsible AI, Pending Review” course title is satire; this page is not a policy approval. Check the current approved policy and tool list before using AI at work. If this page conflicts with them, the current policy takes precedence and the discrepancy should be reported for correction. Ask the policy owner when the approved route is unclear.`,
  },
  {
    ...base,
    id: "hooli-doc-customer-data-handling",
    kind: "doc",
    title: "Customer Data Handling",
    summary: "Customer information should be collected, used, and shared only for a legitimate work purpose and through approved systems.",
    category: "Trust and Security",
    folder: "",
    updatedAt: "2026-09-28T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 8,
    groups: [],
    body: md`Customer information should be collected, used, and shared only for a legitimate work purpose and through approved systems. This page offers general guidance for fictional Hooli. Follow current policy and customer commitments.

### Collect only what the work needs

Before requesting or recording information, ask whether it is necessary for the task and whether the customer has an approved way to share it. Do not collect sensitive details “just in case.” Use the designated system and fields. If the information needs stronger access controls than the general CRM provides, ask the data owner for the approved location.

Customer information can include account contacts, usage details, support logs, files, or business plans. A detail may be sensitive even if it does not look like a password. Avoid copying full records into chat, email, slide decks, or AI tools when a link to the approved source is sufficient.

### Check the audience and destination

Before sharing, verify both who will receive the information and whether the destination is appropriate. Recheck autocomplete suggestions and external recipients. Use access settings that match the customer's agreement and the work task. Do not make a private file public to simplify collaboration.

| Before sharing | Check |
| --- | --- |
| Recipient | Are they authorized and expecting it? |
| Destination | Is this an approved company system? |
| Amount | Is every included detail needed? |
| Access | Can unrelated people view or download it? |

### Keep records accurate and limited

Write neutral notes that help the next authorized colleague act. Do not record personal judgments, unrelated information, or credentials in customer records. Correct outdated facts and follow the retention rules for the system. If you are not sure whether a detail belongs in the record, ask its owner before adding it.

### Respond to a possible exposure

If customer data goes to the wrong recipient, appears in an unapproved location, or is accessible to someone who should not see it, report the issue promptly using the current security process. Include what happened, when, and which system or account was involved. Do not delete evidence, forward the information to more people, or try to investigate beyond your role.

Responders will determine what steps are needed and whether the customer or another team must be notified. Do not make that determination on your own. Fast, factual reporting helps limit exposure and gives the right people a chance to respond.`,
  },
  {
    ...base,
    id: "hooli-doc-finding-your-way-around-hooli-systems",
    kind: "doc",
    title: "Finding Your Way Around Hooli Systems",
    summary: "Hooli has a system for nearly every workflow and occasionally a system for finding the system.",
    category: "Operations and Tools",
    folder: "",
    updatedAt: "2026-09-28T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 8,
    groups: [],
    body: md`Hooli has a system for nearly every workflow and occasionally a system for finding the system. This guide helps employees choose the right starting point, request access, and keep useful information in a shared place. Use the current company directory and policy when a tool's instructions differ from this overview.

### Start with the work

Before opening a new app, name the task: customer record, team decision, project status, employee request, or support issue. Ask your manager or team where that work is maintained. A system is useful when people can find the current version and know who owns it.

| Work | Starting point |
| --- | --- |
| Customer account or opportunity | HooliForce CRM |
| Team priorities | Team planning space |
| Product behavior and releases | Product and Engineering Docs |
| Account access issue | Approved IT/help channel |
| People or accommodation question | Confidential People support |

The table is a starting point, not a full access map. Do not put sensitive information into a system just because it is easy to open. Follow the access and retention rules for the information involved.

### Request your own access

Use the approved request path and state which system, role, and work task require access. Your manager may need to confirm the business need. Access should be assigned to your own account and limited to what you need. Never use a colleague's password or copy files into a personal drive to get around a delay.

\`\`\`text
System:
Access needed:
Work task:
Manager or owner:
Error message (if any):
\`\`\`

Do not put a password, recovery code, or customer record in the request. Include a screenshot only if policy allows it and you have removed unrelated sensitive information.

### Find the source of truth

When two pages disagree, check the owner, last reviewed date, and whether one page is a draft. Ask the listed owner which guidance is current, then report the conflicting page so it can be corrected. Do not silently copy old instructions into another system. A duplicate may look convenient today and create two versions tomorrow.

### Leave the workspace clearer

Keep shared records factual and update them when ownership or status changes. If you cannot find the right destination, ask before creating a new database, spreadsheet, or channel. Hooli's tool count is not a measure of operational maturity; the useful measure is whether the next person can find the work and act on it.`,
  },
  {
    ...base,
    id: "hooli-doc-how-we-make-decisions-at-hooli",
    kind: "doc",
    title: "How We Make Decisions at Hooli",
    summary: "Hooli decisions range from routine choices a teammate can make to company-level commitments that need formal approval.",
    category: "Operations and Tools",
    folder: "",
    updatedAt: "2026-09-28T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 8,
    groups: [],
    body: md`Hooli decisions range from routine choices a teammate can make to company-level commitments that need formal approval. Clear decision ownership helps people move without confusing consultation, consensus, and authorization.

### Start with the decision

Write down the question that needs an answer. A useful decision statement is narrow enough that people can tell when it has been made: “Which support team owns the first response for this product?” is clearer than “How should we improve customer experience?” The broader topic may need several decisions.

### Identify the owner and contributors

One person should coordinate the decision and make sure it reaches the appropriate authority. The owner may not be the person with final approval. Ask who must approve the choice, who has useful expertise, and who will be affected by it. Invite the people who can change the quality of the decision; do not turn every consultation into an all-hands referendum.

| Role | Responsibility |
| --- | --- |
| Decision owner | Frames the question and coordinates input |
| Approver | Authorizes the decision when required |
| Contributors | Provide relevant context or expertise |
| Implementers | Carry out the agreed decision |

### Share options and trade-offs

Present a small number of viable options, the evidence behind them, and the risks or costs that matter. Separate facts from assumptions. If information is missing, state what would change the decision and whether it is reasonable to wait. A polished deck cannot resolve an unknown by adding gradients.

### Record the result

Document the decision, approver when applicable, rationale, effective date, and owner for follow-up. Tell affected people what changes and where to find the current information. If the decision is revisited, preserve the history and explain what new information prompted the change.

### When to pause

Pause when the decision exceeds your authority, creates material customer or employee risk, conflicts with policy, or depends on facts you have not verified. Route it to the right decision-maker. Urgency may change how quickly the decision is made; it does not make an unauthorized person the approver.

Hooli likes to call this “distributed decisional velocity.” The useful version is simple: make the question clear, involve the right people, record who decided, and tell others what happens next.`,
  },
  {
    ...base,
    id: "hooli-doc-meetings-and-decision-notes",
    kind: "doc",
    title: "Meetings and Decision Notes",
    summary: "A meeting should help people decide, coordinate, or understand something that benefits from live discussion.",
    category: "Operations and Tools",
    folder: "",
    updatedAt: "2026-09-28T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 8,
    groups: [],
    body: md`A meeting should help people decide, coordinate, or understand something that benefits from live discussion. A recurring calendar invitation does not prove that a meeting is still useful. Use a written update when people only need the same status; meet when the group needs to work through a question together.

### Before the meeting

Write a one-sentence purpose and the outcome you need. Invite people who can make the decision or provide context that could change it. Tell attendees what preparation matters and how long it should take. If someone only needs the result, send them the notes rather than adding another hour to their calendar.

A useful invitation answers:

- What question are we discussing?
- Who owns the decision?
- What information should people review?
- What should be true when the meeting ends?

### During the meeting

Keep the discussion tied to the stated question. Separate facts from assumptions and name any missing information. If a new topic deserves attention, capture it for another conversation rather than quietly extending the agenda. Make space for people closest to the work to explain constraints before the group settles on a solution.

If the decision-maker is absent, the group can still gather information, but should not imply that the decision is approved. Hooli calls this “alignment”; the notes should say whether the group decided, recommended, or deferred.

### Record the outcome

Send a short note to people who need to act on the result. Include the decision, owner, effective date if relevant, open questions, and next checkpoint. Do not transcribe the entire conversation. A useful note preserves what someone needs after the meeting, not every sentence that led there.

| Outcome | Record |
| --- | --- |
| Decided | Choice, approver, owner, effective date |
| Recommended | Recommendation and decision-maker |
| Deferred | Missing information, owner, revisit date |
| No decision needed | Why the group stopped or changed format |

### Correct the record

If the group later changes its decision, update the original note or link a clear revision. Explain what new information prompted the change. Avoid leaving a stale decision in the shared source of truth while announcing the correction only in chat.

The meeting organizer is responsible for sharing the notes, but the decision owner is responsible for confirming that the recorded outcome is accurate. This small distinction prevents a polished summary from becoming an accidental approval.`,
  },
  {
    ...base,
    id: "hooli-doc-middle-out-approved-product-explanation",
    kind: "doc",
    title: "Middle-out: Approved Product Explanation",
    summary: "Middle-out is Hooli's fictional compression technology and the center of several unusually enthusiastic company announcements.",
    category: "Product and Engineering",
    folder: "",
    updatedAt: "2026-09-28T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 8,
    groups: [],
    body: md`Middle-out is Hooli's fictional compression technology and the center of several unusually enthusiastic company announcements. This page gives employees a clear way to explain it without turning a demo result into a universal promise.

### The short explanation

Middle-out is an approach to compression that works from a useful point within the data rather than treating every part as unrelated. Hooli's product team applies the method in supported workflows to reduce the size of certain data sets. The actual result depends on the data, settings, and environment. This is a simple explanation for a fictional product; it is not a technical specification.

![A bright, collaborative engineering workspace](https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1400&q=80)

### What a benchmark can say

A benchmark reports a result under particular conditions. To make it meaningful, share the workload, input, settings, comparison, and measurement. State whether the result is from an internal test, independent evaluation, or customer environment. Do not remove caveats when summarizing a result for a slide or customer conversation.

| Question | Why it matters |
| --- | --- |
| What data was tested? | Results may vary by data type |
| What was the comparison? | The baseline affects the result |
| Which settings were used? | Configuration can change outcomes |
| Was it repeated? | One run may not represent normal operation |

### What not to promise

Do not claim that Middle-out compresses every file better, guarantees a specific cost reduction, or works in an unsupported environment. A demonstration is not proof of general availability. If a customer asks about a workload that is not covered by approved evidence, capture the question and request a product review.

### Customer-ready wording

> “Hooli uses a middle-out approach in supported compression workflows. In an internal test using a synthetic video archive, the current lab build produced a smaller output than the prior internal encoder under the same settings. Results can differ by workload, and this result is not a customer guarantee. We can confirm whether your use case is supported.”

Use only product-reviewed evidence when adapting this explanation. If a customer needs a result for their workload, say you will confirm the test conditions and supported configuration. Hooli's marketing team may prefer “compression, reimagined”; the customer usually needs to know where the product works and what evidence supports the claim.

If product behavior or approved claims change, update this page and the relevant customer material together. The owner should confirm details before publication.`,
  },
  {
    ...base,
    id: "hooli-doc-product-status-and-customer-claims",
    kind: "doc",
    title: "Product Status and Customer Claims",
    summary: "Employees should be able to explain what a Hooli product does today without turning an experiment or roadmap idea into a customer promise.",
    category: "Product and Engineering",
    folder: "",
    updatedAt: "2026-09-28T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 8,
    groups: [],
    body: md`Employees should be able to explain what a Hooli product does today without turning an experiment or roadmap idea into a customer promise. Product status changes, so use the current release note, approved explanation, and named owner.

### Name the status precisely

A capability may be an internal prototype, a limited test, a planned change, or available to customers. Those states are different. A feature shown in a demo is not necessarily supported in a customer environment. Availability may depend on a rollout, configuration, region, or plan. Say which condition applies, and confirm it before advising a customer.

| Status | Appropriate description |
| --- | --- |
| Internal prototype | “We are evaluating this internally.” |
| Limited test | “Access is limited to the named test group.” |
| Planned | “This is planned; timing is not confirmed.” |
| Available | “This is available in the documented supported context.” |
| Unknown | “I’ll confirm with the product owner before I answer.” |

### Support claims with evidence

Performance, reliability, and savings claims need a source and the conditions behind it. Identify what was measured, on which workload, against what baseline, and whether the evidence is approved for external use. Do not generalize from one customer, one benchmark, or one demonstration to every environment.

For middle-out results, use the approved explanation and preserve the test conditions and limitations. A claim becomes misleading if the caveat disappears as the wording moves from an engineering note to a slide.

### Use a simple answer pattern

A clear response connects a current capability to the customer's question, gives evidence where appropriate, names the limitation, and offers a next step:

\`\`\`text
Capability: What works today?
Evidence: What supports the claim?
Limit: Where might it not apply?
Next step: Who can confirm the customer's case?
\`\`\`

Do not promise a launch date, cost reduction, or performance guarantee without approval. If an earlier claim was inaccurate, correct it promptly with the customer and the internal team.

### Route unanswered questions

Capture the customer's question and relevant context without including unnecessary personal or confidential information. Send it to the product owner or account team through the approved channel. Tell the customer when you expect to follow up, and update them if that timing changes. “I don't know yet” is more trustworthy than a confident answer that someone later has to unwind.`,
  },
  {
    ...base,
    id: "hooli-doc-release-readiness-checklist",
    kind: "doc",
    title: "Release Readiness Checklist",
    summary: "A release is ready when the people responsible for building, supporting, and using it understand what is changing and what to do if something goes wrong.",
    category: "Product and Engineering",
    folder: "",
    updatedAt: "2026-09-28T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 8,
    groups: [],
    body: md`A release is ready when the people responsible for building, supporting, and using it understand what is changing and what to do if something goes wrong. A completed checklist does not guarantee a perfect launch. It makes assumptions visible while there is still time to address them.

### Confirm the release

Start by identifying the exact change, audience, and availability. Confirm whether the release is generally available, limited to a test group, or still internal. Check dependencies and any customer or administrator action required. If timing changes, update the announcement and internal plan rather than relying on an old calendar invitation.

### Prepare support and operations

Support teams need to know what users will see, what known limitations remain, and where to route reports. Engineering and operations should know how to observe the system and who can make a rollback or mitigation decision. Keep operational details in the approved internal location; this public-facing demo checklist contains no real credentials or production identifiers.

| Readiness question | Owner |
| --- | --- |
| What is changing and for whom? | Product |
| What known issue should support recognize? | Engineering and Support |
| How will impact be observed? | Operations |
| Who can pause or reverse rollout? | Release owner |
| Where will users find help? | Support |

### Communicate accurately

Write a short announcement that explains the user impact, availability, and any action required. Separate what ships now from what may come later. Do not list roadmap ideas as release capabilities. Link to current documentation that matches the version being released.

### Decide how to proceed

Before rollout, confirm that required reviews are complete and the responsible owner is available. If a critical check fails, pause and name the decision-maker. If an issue appears after release, use the agreed incident process, share verified status, and record decisions as they happen.

\`\`\`text
Change:
Audience and availability:
Known limitations:
Support route:
Monitoring owner:
Pause/rollback decision owner:
Next update:
\`\`\`

After release, compare expected behavior with what users and support teams observe. Record follow-up work without describing an unresolved issue as fixed. The checklist is complete when the owners can explain readiness and the remaining risks—not merely when every box has a check mark.`,
  },
  {
    ...base,
    id: "hooli-doc-first-customer-conversation",
    kind: "doc",
    title: "First Customer Conversation",
    summary: "A first customer conversation should help both sides decide whether a useful next step exists.",
    category: "Sales and Customer Success",
    folder: "",
    updatedAt: "2026-09-28T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 8,
    groups: [],
    body: md`A first customer conversation should help both sides decide whether a useful next step exists. The goal is not to deliver every Hooli slide or prove that the customer has the problem Hooli already knows how to solve. Listen first, then connect the customer's needs to capabilities that are available and supported.

### Prepare without scripting the customer

Review the account record and any approved context. Know who is attending and what the customer expects from the conversation. Check current product information so you can distinguish available behavior from plans or experiments. Avoid assuming that a title, industry, or prior conversation tells you everything about the customer's priorities.

### Ask about the work

Open with the customer's goal and invite them to describe the current process. Helpful questions are neutral and specific:

- What outcome are you trying to achieve?
- How does the work happen today?
- Where does it slow down or become difficult?
- Who needs to be involved in a change?
- What would make a next step useful?

Listen for constraints, timing, existing tools, and measures of success. Ask permission before requesting sensitive details. Do not collect customer data that is not needed to understand the use case.

### Explain fit honestly

Reflect back what you heard and explain which current capability may address it. Name any important limitation, dependency, or unanswered question. Do not say a feature is available because it appeared in an internal demo. If the product does not fit, say so and ask whether another path is worth exploring.

| If the customer asks… | A useful response |
| --- | --- |
| “Can it do this today?” | Confirm the supported behavior or verify with Product |
| “When will it launch?” | Share only an approved date; otherwise say timing is unknown |
| “Will we save 30%?” | Ask what evidence and workload would support that estimate |
| “Can you send the data?” | Use an approved system and confirm the recipient |

### Agree on a next step

Close by summarizing the customer's goal, what Hooli will confirm, who owns follow-up, and when the customer should hear back. Record the factual summary and next action in HooliForce CRM. Separate the customer's statement from your interpretation and avoid unsupported forecast dates.

A first conversation may lead to product review, a technical discussion, a later check-in, or no next step. Clarity about fit is more useful than momentum recorded only in the CRM.`,
  },
  {
    ...base,
    id: "hooli-doc-using-hooliforce-crm",
    kind: "doc",
    title: "Using HooliForce CRM",
    summary: "HooliForce is Hooli’s system for customer relationships, opportunities, and follow-up.",
    category: "Sales and Customer Success",
    folder: "",
    updatedAt: "2026-09-28T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 8,
    groups: [],
    body: md`HooliForce is Hooli’s system for customer relationships, opportunities, and follow-up. Its purpose is to help the next person understand what the customer needs and what the company has promised. It is not a substitute for judgment, and it is not a place to store every detail about a customer.

### Start with the account

Before creating a new record, search for the organization and confirm that you have the right account. Similar names are common. Use the official account name and add a website or other approved identifier when needed. If two records appear to describe the same customer, ask the account owner or CRM administrator to resolve the duplicate rather than creating a third.

A useful account record has a clear owner and current contact information. Add only relevant business context. Do not include sensitive personal information, credentials, or details that do not help Hooli work with the customer.

### Keep opportunities factual

An opportunity should represent a real customer conversation or buying process. Use the stage definitions in the current CRM guide. Move a record when the evidence supports the next stage, not because the end of the quarter is approaching. If a customer has not confirmed a date, leave the date blank or use the approved estimate field rather than turning a guess into a commitment.

| Field | What belongs there |
| --- | --- |
| Customer need | The problem the customer described |
| Stage | The current stage supported by evidence |
| Owner | One person coordinating the next step |
| Next action | An agreed action and due date, if known |
| Risks | Open questions that may affect the plan |

### Write notes for someone who was not there

Use neutral, concise language. Separate the customer's words from your interpretation. A good note says, “Customer asked whether regional data storage is available; product review requested; next update due Thursday.” A weak note says, “Great call, huge potential, very excited.” The first helps a colleague act; the second asks them to guess.

Correct stale information when it changes. Avoid adding a new note that contradicts an old one without explaining what changed. Follow the CRM's retention and access rules, and use approved channels for files or information that should not be in a general customer record.

If a field or workflow does not fit the real process, contact the CRM owner. Do not create personal workarounds that leave customer information outside the shared system.`,
  },
  {
    ...base,
    id: "hooli-doc-hooliforce-faq-is-this-field-required",
    kind: "doc",
    title: "HooliForce FAQ: Is This Field Required?",
    summary: "HooliForce contains fields for different jobs: some support customer handoffs, some feed reports, and some exist because a Hooli executive once asked whether the…",
    category: "Sales and Customer Success",
    folder: "",
    updatedAt: "2026-09-28T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 8,
    groups: [],
    body: md`HooliForce contains fields for different jobs: some support customer handoffs, some feed reports, and some exist because a Hooli executive once asked whether the company could measure “customer momentum.” This FAQ explains what to enter when a field does not make sense.

### Required fields

A required field should have a defined meaning and an approved way to complete it. If the form blocks a save, first check the field description and current process guide. Use the most accurate available value. Never invent a customer fact just to satisfy a required input. If the value is not known, use the system's approved “Unknown,” “Not provided,” or equivalent option. If none exists, ask the CRM administrator.

### Dates and estimates

A date may represent a customer-confirmed milestone, an internal target, or an estimate. Those are not interchangeable. Check the field label and guidance. If you are entering an estimate, use the estimate field and explain the assumption in the note. Update it when the customer or team provides new information. A date in a report can look precise even when its source is only a guess.

### When a field feels redundant

Two fields may look similar but feed different workflows. Check the field help text before leaving one blank. If the meaning remains unclear, record the field name and the situation, then ask the CRM owner. Do not add a duplicate field, change a picklist, or ask the customer for information solely to populate a dashboard.

| Situation | What to do |
| --- | --- |
| You know the value | Enter it in the field whose definition matches |
| You have an estimate | Mark it as an estimate and record the assumption |
| You do not know | Use an approved unknown value or ask the owner |
| The field conflicts with reality | Pause and request a workflow review |

### What makes a good request to change the form?

Explain the work the field supports, who needs the information, and what goes wrong today. Include a fictional or sanitized example. The CRM owner can decide whether to clarify, make optional, or remove the field.

Completing a field is not the same as making a record useful. A request should improve the work, not simply create another required box. Current facts, ownership, and a next step matter more than a perfect dashboard. Customers experience the handoff, not the completion percentage.`,
  },
  {
    ...base,
    id: "brief-1",
    kind: "brief",
    title: "We Solved Middle-out Again!",
    summary: "Hooli's compression team has completed another round of middle-out testing, and the results are ready for internal review.",
    category: "Engineering",
    folder: "",
    updatedAt: "2026-09-28T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 8,
    groups: [],
    body: md`Hooli's compression team has completed another round of middle-out testing, and the results are ready for internal review. This milestone gives the team a clearer picture of how the approach behaves across the workloads included in the test. It is an encouraging result, and it is also one result under specific conditions. Both statements can be true at the same time, a concept our launch deck currently labels “nuanced optimism.”

The engineers tested a synthetic video archive with the current lab build and compared it with Hooli’s previous internal encoder under the same settings. The output file was smaller in that run; the team has not approved a speed or customer-savings claim. The finding applies to the tested setup; performance may differ with other data, settings, hardware, or usage patterns. Product and engineering are reviewing the details before any customer-facing claim is updated.

## What happens next

- Engineering will confirm the test conditions and repeatability.
- Product will identify which supported use cases the result informs.
- Customer-facing teams should continue using the currently approved product explanation.
- Any new external claim will be reviewed and published through the normal release process.

Please do not describe this result as a general guarantee or promise a customer a specific savings amount. If a customer asks whether the capability applies to their workload, record the question and route it to the product team. We would rather return with a precise answer than improvise a breakthrough on a call.

![A team reviewing a technical result together](https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1400&q=80)

The phrase “solved middle-out again” is approved for this fictional demo update. The actual engineering note should identify what was tested and what remains uncertain. This announcement does not mean a new product version has shipped, that every customer has access, or that earlier limitations have disappeared.

For questions, use the engineering release channel and include the test name or customer scenario. The team will post a follow-up when the review is complete. Until then, please enjoy this rare moment when the company slogan and the workstream have the same name.

The follow-up will include the approved measurement and the conditions needed to interpret it. Until then, the headline celebrates work completed, not a promise made to customers.`,
  },
  {
    ...base,
    id: "brief-2",
    kind: "brief",
    title: "HooliForce CRM Is Here",
    summary: "HooliForce is now the shared place to track customer accounts, active opportunities, and agreed follow-up.",
    category: "Operations",
    folder: "",
    updatedAt: "2026-09-27T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 8,
    groups: [],
    body: md`HooliForce is now the shared place to track customer accounts, active opportunities, and agreed follow-up. The goal is simple: help the next person understand what the customer needs, what Hooli has said, and who owns the next step. The interface may look like a strategic customer intelligence platform. Underneath, it is a record that needs to be accurate.

Start by searching for the customer before creating a new account. Similar names and duplicate records make handoffs harder, so check with the account owner if you are not sure which record is current. When you update an opportunity, use the published stage definitions and include evidence for material changes. An optimistic conversation is not the same as a confirmed purchase timeline.

## What to record

- The customer's stated need and relevant context
- The current status, using the stage definitions
- One person coordinating the next action
- An agreed next step and date, if one exists
- Open questions or risks that may affect the plan

Keep notes factual and useful to colleagues who were not in the meeting. Do not add passwords, unnecessary personal information, or customer details that belong in a more restricted system. If a field does not fit the work, ask the CRM owner rather than creating a private workaround.

The short course **Using HooliForce CRM** explains account records, opportunity stages, and clear notes. It is assigned to customer-facing teams this week; other employees can use it when relevant. The course covers practical examples and a final knowledge check. It will not teach you to forecast with “executive confidence,” a feature HooliForce does not support.

If you cannot access the system, use the approved support channel and request access for your own account. Do not borrow a teammate's login. For questions about field definitions or duplicate records, contact the CRM owner through the operations help channel.

We will review feedback after the first month and adjust field guidance where actual use shows confusion. Please share specific examples without including sensitive customer data. A system is only useful when the records reflect reality and colleagues can find the next step. Keep records current as conversations move forward.`,
  },
  {
    ...base,
    id: "brief-3",
    kind: "brief",
    title: "Welcome to Hooli",
    summary: "Welcome to Hooli.",
    category: "People",
    folder: "",
    updatedAt: "2026-09-26T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 8,
    groups: [],
    body: md`Welcome to Hooli. We are glad you are here, and we hope your first week gives you a useful map of the people, tools, and information that help you do your work. You are not expected to memorize every acronym or understand the entire company by Friday. If you hear a phrase that sounds important but nobody can define, asking what it means is an excellent first contribution.

Begin with your manager and immediate team. Confirm which systems your role needs, where your team's current priorities are recorded, and how to ask for support. Use the official process to get access to your own accounts. If something is missing, contact the approved help channel rather than borrowing someone else's credentials.

## A few useful first steps

1. Find the team's current priorities and decision notes.
2. Learn which communication channel is used for urgent requests.
3. Ask how your team tracks work and signals that it is complete.
4. Meet the people you will rely on for customer, product, or operational questions.
5. Confirm how to report a security concern or customer escalation.

The **New Hire First-Week Guide** covers these basics in one place. Your manager can help interpret team-specific practices and discuss what good progress looks like in your first month. If you need a workplace accommodation or have a private People question, use the appropriate confidential support channel.

Hooli has many internal systems and not all of them are relevant to every role. Start with what your work requires. If a page is out of date, tell its owner; if you cannot find the owner, ask your manager. Documentation improves when people report the gaps they encounter.

Our fictional onboarding video promises a “seamless first day.” We cannot guarantee that every account will be ready at exactly the same time, but we can promise that asking for help is expected. Welcome aboard. We hope you find useful work, kind colleagues, and at least one meeting that ends early.

If your first week feels like a lot of new information, focus on the next useful step and ask your manager to help prioritize. Learning the map takes time.`,
  },
  {
    ...base,
    id: "hooli-update-04",
    kind: "brief",
    title: "Security Refresher Assigned to Everyone",
    summary: "The annual Security Basics refresher is now assigned to all Hooli employees.",
    category: "Security",
    folder: "",
    updatedAt: "2026-09-25T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 8,
    groups: [],
    body: md`The annual Security Basics refresher is now assigned to all Hooli employees. Please complete it by **October 16, 2026**. The short course reviews account protection, careful information sharing, suspicious messages, and how to report a possible incident. It includes a final knowledge check so you can confirm the main points.

The most important reminder is simple: use your own account, keep passwords and recovery codes private, and verify unexpected requests through a trusted channel. Before sharing a file, check that the recipients are authorized and that the storage location is approved. If you notice a possible exposure or suspicious account activity, report it promptly using the current security incident process.

## What to do

- Open **Security Basics: Don’t Paste That Here** from your assigned Courses.
- Complete the lessons and final knowledge check by the due date.
- If you cannot access the course, contact the learning administrator.
- If you discover a real security concern, report it immediately; do not wait until you finish the course.

This training is a refresher, not a substitute for current security policy or incident-response instructions. Follow the guidance that applies to your system and role. If a message asks you for a password or recovery code, do not send it, even if the request appears to come from a senior leader. Verify the request independently.

If you already completed the current version, your completion should appear in your Courses page. Contact the learning administrator if the assignment or progress looks wrong. Managers can check team completion in the normal reporting view; please use that information to support reminders and remove access barriers, not to speculate about why an individual is behind.

Security depends on people being able to report mistakes without delay. Reporting is responsible behavior. The response team will assess the situation and tell you what to do next. Do not delete a suspicious message or try to investigate beyond your role before reporting it.

Please complete the course during work time and let your manager know if workload or access prevents you from finishing by the deadline. The learning administrator can help correct assignment issues.`,
  },
  {
    ...base,
    id: "hooli-update-05",
    kind: "brief",
    title: "Responsible AI Guidance: Review Complete",
    summary: "The first review of Hooli's Responsible AI guidance is complete.",
    category: "Trust",
    folder: "",
    updatedAt: "2026-09-24T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 8,
    groups: [],
    body: md`The first review of Hooli's Responsible AI guidance is complete. The document now explains which tools are approved for work, what kinds of information must not be entered without explicit authorization, and how to check generated output before sharing it. One section remains open: the guidance for a new tool currently being evaluated by the review group. We will update the page when that decision is made.

Until then, use the currently approved tool list and follow the policy that applies to your role and data. Do not paste customer records, credentials, unreleased financial information, or confidential employee details into an AI tool unless the tool and use case are explicitly approved. If data handling is unclear, pause and ask the designated reviewer.

## Before you use generated output

- Verify factual claims against a reliable source.
- Recheck calculations, dates, quotations, and product availability.
- Remove information that should not be shared with the intended audience.
- Keep a person accountable for the final work.
- Make AI assistance visible when policy or the audience requires it.

A confident answer is not evidence. AI systems can produce plausible but incorrect claims and may omit important context. For customer-facing work, confirm that every product statement matches current released behavior. Do not use a generated response as the sole basis for a consequential decision about a person.

The course **Responsible AI, Pending Review** introduces these practices and includes examples of safer review. The title is a Hooli joke; the course does not imply that the company's policy is unfinished or that every tool is available. This update identifies the actual review status for the demo content.

If you think a tool exposed restricted information or produced harmful output in a work context, stop using it for that task and report the concern through the current process. Do not test the issue with real customer or employee data. Questions about the open section can go to the policy owner, who will post an update when the review closes.

The policy owner will record the decision and its effective date so employees can tell which guidance applies to current work.`,
  },
  {
    ...base,
    id: "hooli-update-06",
    kind: "brief",
    title: "Customer Support Update: New Escalation Path",
    summary: "We have clarified how customer-facing teams route urgent product and service issues.",
    category: "Customer Support",
    folder: "",
    updatedAt: "2026-09-23T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 8,
    groups: [],
    body: md`We have clarified how customer-facing teams route urgent product and service issues. The updated path identifies the person coordinating the customer thread, the information responders need, and the timing for the next update. The change is intended to reduce duplicate requests and make it easier for customers to know who is following up.

When an issue is raised, capture the impact, when it began, who is affected, and what has already been tried. Share only the information needed for the investigation and use approved channels for sensitive data. Assign one coordinator for customer communication, even when several technical teams are involved.

## A useful first report includes

| Detail | Example |
| --- | --- |
| Impact | Four users cannot complete sign-in |
| Start time | First observed around 10:20 PT |
| Scope | One workspace, region still being confirmed |
| Prior steps | Retry completed; same error persists |
| Next update | Coordinator will update customer by 1:00 PT |

The examples above are fictional. For a real report, use verified information and avoid guessing at the cause. A hypothesis should be labeled as a hypothesis. Do not promise a fix or a resolution time until the responsible team confirms it.

If you are coordinating the customer thread, acknowledge the impact and give a next update time. If that time changes, tell the customer before it passes. Distinguish a workaround from a permanent fix, and close the loop when the issue is resolved. The **Customer Escalations: Calm, Clear, Owned** course walks through these communication habits.

The escalation path is available in the current Support documentation. If a case appears urgent but does not fit the listed categories, contact the on-call lead or your manager for routing. Do not open several parallel tickets to increase visibility; include the existing case reference so responders can keep one shared history.

We will review the updated path after teams have used it and revise any steps that create confusion. Please send feedback with a sanitized example and the point where routing became unclear.

The coordinator should keep the customer-facing summary current as facts change, so every responder can work from the same account of the issue. Record the next update time for customers.`,
  },
  {
    ...base,
    id: "hooli-update-07",
    kind: "brief",
    title: "Manager Essentials Now Available",
    summary: "The Manager Essentials course is now available to people managers.",
    category: "People",
    folder: "",
    updatedAt: "2026-09-22T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 8,
    groups: [],
    body: md`The Manager Essentials course is now available to people managers. It covers clear priorities, useful feedback, support for employee growth, and communication during organizational change. The course is designed as a practical refresher; it does not replace Hooli's current policies for performance, hiring, leave, accommodations, privacy, or security.

The lessons emphasize a few habits that make day-to-day management clearer: explain what matters and what can wait, give feedback with specific examples, invite employees' context, and follow through on questions. When information is unsettled, say what is confirmed, identify what remains open, and give a date for the next update when possible.

## The course includes

- Setting priorities employees can use to make trade-offs
- Giving direct feedback without guessing at intent
- Discussing development without promising outcomes you cannot authorize
- Routing private, safety-related, or policy questions appropriately
- Communicating what is known during a reorganization

Managers should use confidential People channels for sensitive employee matters and avoid collecting health or personal details that are not needed for their role. If a concern involves immediate risk or exceeds your authority, contact the appropriate People, Security, Legal, or leadership resource.

The course contains three short lessons and a final knowledge check. It uses everyday examples rather than Hooli's favored scenario, “What if we reorg the org that manages the reorg?” Completion appears in your assigned learning. If you have already completed the current course version, check your Courses page before contacting the learning administrator.

Managers can use the reporting view to understand team learning status and offer help with time, access, or unclear instructions. A completion indicator does not tell you why someone has not finished. Start with a supportive conversation and check whether the assignment is relevant and accessible. Do not treat the percentage as a performance rating.

The course is available now under **People and Culture**. Please send feedback through the course page if an example is unclear or a policy reference needs updating. The content owner will review suggestions and keep the course aligned with current guidance.

The goal is to make management expectations easier to discuss, not to create another scorecard. Use the course as a starting point for conversations with your team.`,
  },
  {
    ...base,
    id: "hooli-update-08",
    kind: "brief",
    title: "Release Readiness Checklist Updated",
    summary: "The Release Readiness Checklist has been updated to make ownership and launch communication easier to review.",
    category: "Product",
    folder: "",
    updatedAt: "2026-09-21T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 8,
    groups: [],
    body: md`The Release Readiness Checklist has been updated to make ownership and launch communication easier to review. It now asks teams to identify the change, the audience and availability, known limitations, the support route, the monitoring owner, and who can pause or reverse a rollout. The checklist also makes room for the next customer or internal update.

The purpose is not to add a new approval layer to every change. It is to make sure the people responsible for building, supporting, and using a release share the same understanding. A check mark does not guarantee a perfect launch. It gives the team a chance to surface an unknown before it reaches customers.

\`\`\`text
Change:
Audience and availability:
Known limitations:
Support route:
Monitoring owner:
Pause/rollback decision owner:
Next update:
\`\`\`

Before launch, distinguish what is available now from what remains on the roadmap. Confirm that support teams know what users will see and where to route questions. Make sure the responsible owner is available during the rollout, and record how the team will observe impact. Keep production identifiers and operational secrets in the approved internal system, not in public release notes.

If a critical check fails, pause and identify who can make the proceed, delay, or mitigation decision. If an issue appears after release, follow the incident process, share verified status, and record decisions as they happen. Avoid calling a problem fixed until the expected behavior has been confirmed.

The checklist is maintained in the Product and Engineering Docs category. The course **Speaking About Hooli Products** covers how to describe availability accurately; **Customer Escalations** explains customer updates when a release causes a problem. Those references are optional context, not extra release requirements.

Please share examples where the checklist is unclear or too heavy for the change. Include the kind of release and the missing question, without adding sensitive customer or infrastructure data. The owner will review feedback after the next release cycle and adjust the checklist where the work supports it.

Smaller changes may need fewer details, but every release should still have a clear owner and an accurate statement of availability.`,
  },
  {
    ...base,
    id: "hooli-update-09",
    kind: "brief",
    title: "Hooli Wellness Week Begins Monday",
    summary: "Hooli Wellness Week begins Monday with a set of optional activities and links to the company's well-being resources.",
    category: "Company Life",
    folder: "",
    updatedAt: "2026-09-20T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 8,
    groups: [],
    body: md`Hooli Wellness Week begins Monday with a set of optional activities and links to the company's well-being resources. Choose what is useful to you, skip what is not, and continue to follow any personal guidance from a qualified health professional. Participation is not required and is not part of performance evaluation.

This year's theme is “listen to your body, not the dashboard.” The schedule includes quiet focus blocks, a walking meetup, a short session on setting boundaries around notifications, and an introduction to available benefits. Details and accessibility information are in the employee events calendar. If an activity does not work for your schedule or needs, no explanation is required.

## A few reminders

- Wellness activities are optional.
- Do not share private health details in public channels.
- Managers should not pressure employees to participate or explain why they decline.
- Use the confidential benefits or accommodation route for individual questions.

The fictional company guide **Gavin’s Guide to Gut Health** is also in the demo Docs library. It is satire, not medical advice. Gavin's executive confidence should not be confused with clinical expertise. If you have a personal health question, speak with a qualified clinician who can consider your circumstances.

Well-being is not a single routine or a company-wide score. People have different needs, responsibilities, and access to time and resources. The activities are an invitation, not a universal prescription. Hooli's wellness committee has retired the proposed “hydration leaderboard” after realizing that a leaderboard is still a leaderboard.

If you need help locating benefits information, contact the People support channel. If you have feedback about accessibility or scheduling, share it with the event organizer. Please do not include personal medical information in event feedback. We hope the week gives people a few useful options and a little more room to focus on what works for them.

There is no single measure of a successful week. The event organizers will use participation feedback to improve scheduling and access, not to rank employees or teams. Managers should protect time for people who choose to attend and respect those who do not. The calendar lists each activity's format and accessibility contact; reach out before the event if you need an adjustment.`,
  },
  {
    ...base,
    id: "hooli-update-10",
    kind: "brief",
    title: "Quarterly All-hands: What Changed and What’s Next",
    summary: "The quarterly all-hands will take place on October 8, 2026, at 10:00 a.m.",
    category: "Company",
    folder: "",
    updatedAt: "2026-09-19T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 8,
    groups: [],
    body: md`The quarterly all-hands will take place on **October 8, 2026, at 10:00 a.m. Pacific**. This session will review work released during the quarter, decisions that changed team priorities, and the questions that remain open. The goal is to give employees a clear account of what happened and where to find follow-up information, not to turn every unresolved item into a triumphant animation.

The agenda includes a short product and operations update, a review of customer support themes, and time for employee questions. Presenters will distinguish shipped capabilities from experiments and roadmap ideas. If a topic cannot be answered during the session, the owner will record it and provide a follow-up date or explain why the answer is not yet available.

## What we will cover

1. **Released work:** what became available and for whom.
2. **Customer themes:** recurring needs and current response plans.
3. **Operating changes:** decisions that affect ownership or process.
4. **Open questions:** named owners and the next update where known.
5. **Questions:** submitted in advance or asked live, subject to time.

The session notes will summarize decisions and link to current documentation. Draft proposals will be labeled as proposals, and confidential personnel matters will not be discussed in a public forum. Employees who have an individual concern should use the appropriate private channel.

Hooli's middle-out update is on the agenda, but the team will share only results that have completed review. The current evidence and limits will be stated together. Other topics include HooliForce CRM adoption and the updated release-readiness checklist. These are operational updates, not a declaration that every workflow is now perfect.

Please send questions to your manager by **noon Pacific on October 6** so the organizer can group recurring themes. Include enough context for the presenter to understand the issue and omit sensitive customer or employee details. If your question is not selected for the live session, the owner will route it or include a response in the notes where appropriate.

After the meeting, the organizer will post the recording if available, a concise decision summary, and follow-up owners. People who cannot attend should still be able to understand what changed and where to find the current source of truth.`,
  },
  {
    ...base,
    id: "course-1",
    kind: "course",
    title: "Disrupting the Disruption",
    summary: "Keep a promising initiative moving after its name, sponsor, and strategic framing have changed twice.",
    category: "Operational Excellence",
    folder: "",
    updatedAt: "2026-09-28T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 5,
    groups: [],
    body: "",
    lessons: [
      {
        id: "course-1-1",
        title: "Name the actual problem",
        body: md`At Hooli, an initiative can acquire a new name before it has a problem statement. Start with the observable issue: what is happening, who encounters it, and what would improve? A clear problem statement gives a team something stable to work on even when the presentation changes.

A useful statement is specific without pretending the solution is known: “Support agents spend time searching three systems for the latest customer status.” “We will revolutionize customer success” describes an ambition, not the problem.

![A Hooli-style office meeting around a shared workspace](https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1400&q=80)`,
      },
      {
        id: "course-1-2",
        title: "Give the work an owner",
        body: md`Every active initiative needs one person responsible for coordinating its next decision. The owner does not have to do every task or approve every choice. They keep the current scope visible, find the right decision-maker, and tell collaborators when an assumption changes.

| Keep visible | Why it helps |
| --- | --- |
| Owner | Questions reach someone who can move them forward |
| Current decision | People can tell what is settled |
| Next checkpoint | Work does not disappear between meetings |
| Open risk | The team can respond before it becomes a surprise |`,
      },
      {
        id: "course-1-3",
        title: "Change the name without losing the work",
        body: md`When the initiative is rebranded, update its title and explain what changed. Keep the owner, agreed decisions, and open risks attached. If the goal or audience changed too, treat that as a scope decision and ask the sponsor to confirm it.


Use this official HBO season 1 teaser as optional cultural context; it is not required course material.

\`\`\`text
Initiative: [current name]
Problem: [observable issue]
Owner: [one coordinating person]
Next decision: [question + decision-maker]
\`\`\``,
        videoUrl: "https://www.youtube.com/watch?v=69V__a49xtw",
      },
    ],
    questions: [
      {
        id: "course-1-q1",
        prompt: "A project sponsor changes the initiative’s name but not its goal. What should the owner do?",
        options: ["Restart discovery because the old name is obsolete", "Update the name, preserve the current decisions, and confirm whether scope changed", "Assume the new name means the project is approved"],
        answer: 1,
      },
    ],
  },
  {
    ...base,
    id: "course-2",
    kind: "course",
    title: "Understanding Middle-out",
    summary: "Explain Hooli’s compression work clearly, including what a result does and does not prove.",
    category: "Operational Excellence",
    folder: "",
    updatedAt: "2026-09-28T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 5,
    groups: [],
    body: "",
    lessons: [
      {
        id: "course-2-1",
        title: "The short version",
        body: md`Middle-out is Hooli’s name for an approach to compression that starts from a useful point in the data rather than treating every part as unrelated. The company’s fictional breakthrough became famous because a small team made a technical result sound like a new era in computing. In a real product conversation, explain the user problem first and the method second.


Use this official HBO season 6 trailer as optional cultural context; it is not required course material.`,
        videoUrl: "https://www.youtube.com/watch?v=qYHp-5h1y5o",
      },
      {
        id: "course-2-2",
        title: "Separate measurement from promise",
        body: md`A benchmark is a result under specified conditions. It does not automatically predict performance for every file, device, network, or workload. State what was measured, what it was compared against, and what remains unknown. If the conditions are not available, do not turn a demo into a universal claim.

| Say | Avoid |
| --- | --- |
| “In this test, the file was smaller under these settings.” | “It compresses everything better.” |
| “Results vary by workload.” | “The benchmark proves it will work everywhere.” |`,
      },
      {
        id: "course-2-3",
        title: "Make the claim useful",
        body: md`A strong technical explanation tells a customer what they can do, where the capability is available, and how to get help. Hooli’s approved pattern is: **capability → evidence → limit → next step**. It is less exciting than “the future has arrived,” but customers can make a decision from it.

> A result is meaningful when people can understand the conditions that produced it.

If a prospect asks whether this reduces their storage bill, cite the tested file and settings, explain that their workload has not been measured, and offer a supported evaluation.`,
      },
    ],
    questions: [
      {
        id: "course-2-q1",
        prompt: "A benchmark shows a large improvement on one test file. Which statement is responsible?",
        options: ["“Hooli compresses every file better than existing tools.”", "“The benchmark shows improvement on this test file; results may differ by workload.”", "“The product is guaranteed to cut storage costs.”"],
        answer: 1,
      },
    ],
  },
  {
    ...base,
    id: "course-3",
    kind: "course",
    title: "How to Democratize Anything",
    summary: "Make a company process easier to access without confusing broad participation with clear ownership.",
    category: "Operational Excellence",
    folder: "",
    updatedAt: "2026-09-28T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 5,
    groups: [],
    body: "",
    lessons: [
      {
        id: "course-3-1",
        title: "Define what becomes easier",
        body: md`“Democratize” should describe a real change in access: more employees can find the guidance, use a tool, contribute information, or request a decision. It should not conceal who is accountable. Before announcing a company-wide program, say what is available, who it is for, and what people can expect. Opening a knowledge base to every team changes access; it does not give every reader authority to change pricing or policy. Name that boundary in the announcement.`,
      },
      {
        id: "course-3-2",
        title: "Design for the person arriving late",
        body: md`People encounter a process at different times and with different context. Put the purpose and first step near the top. Use the words employees already use. Keep the path short, and explain where to go when someone does not fit the standard case.

- State whether the resource is required or recommended.
- Explain who can access it and what information is needed.
- Name the contact for exceptions.
- Review the instructions after the first real questions arrive.`,
      },
      {
        id: "course-3-3",
        title: "Keep feedback separate from approval",
        body: md`Inviting feedback is useful when people know how it will be considered. It does not mean every suggestion will be adopted or that the process is approved for launch. Tell contributors who reviews feedback and when they can expect an update.

\`\`\`text
Available now: [resource or process]
For: [people and situations]
Start here: [first step]
Questions or access issue: [contact]
Last reviewed: [date]
\`\`\`

This template is intentionally less grand than Hooli’s “universal empowerment layer.” It is easier to maintain, which counts as a kind of scale.`,
      },
    ],
    questions: [
      {
        id: "course-3-q1",
        prompt: "A program invites feedback from everyone. What should the announcement also explain?",
        options: ["That all submitted ideas will be implemented", "Who reviews the feedback and how people will hear back", "That ownership is no longer needed"],
        answer: 1,
      },
    ],
  },
  {
    ...base,
    id: "course-4",
    kind: "course",
    title: "Using HooliForce CRM",
    summary: "Keep customer records useful by recording current facts, clear ownership, and a next step.",
    category: "Operational Excellence",
    folder: "",
    updatedAt: "2026-09-28T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 5,
    groups: ["sales"],
    body: "",
    lessons: [
      {
        id: "course-4-1",
        title: "Record what helps the next person",
        body: md`HooliForce is the company’s fictional customer relationship management system. A useful record lets a colleague understand the customer’s situation without reconstructing it from chat messages. Capture the customer’s stated need, relevant context, current status, and next action. Keep opinions visibly separate from customer statements. Record the date and owner of the next step, and link its source. Avoid speculative forecast notes disguised as customer commitments.`,
      },
      {
        id: "course-4-2",
        title: "Keep stages honest",
        body: md`Opportunity stages are shared language, not a forecast of what everyone hopes will happen. Move a record when the evidence for the next stage exists. If a customer has not confirmed a date, do not enter one merely to make the pipeline look complete.

| Field | Good entry |
| --- | --- |
| Customer need | Their stated goal in their own terms |
| Status | What has happened, not what is expected |
| Owner | One person coordinating the next step |
| Next action | Action, responsible person, and date if agreed |`,
      },
      {
        id: "course-4-3",
        title: "Write notes that travel well",
        body: md`A customer note may be read by someone who was not in the meeting. Use neutral language, avoid sensitive personal details, and include enough context to make the next action understandable. Correct outdated facts instead of adding a second note that contradicts them.

**Example:** “Customer asked whether regional data storage is available. Product review requested; Maya will share the confirmed answer by Thursday.” This is more useful than “Great call, seems excited, huge opportunity.”`,
      },
    ],
    questions: [
      {
        id: "course-4-q1",
        prompt: "The customer says they will discuss timing internally but gives no date. What belongs in HooliForce?",
        options: ["A guessed close date", "The customer’s statement and an agreed follow-up action, if one exists", "“High intent” with no supporting note"],
        answer: 1,
      },
    ],
  },
  {
    ...base,
    id: "course-5",
    kind: "course",
    title: "Radical Candor: A Required Refresher",
    summary: "Give direct feedback that is specific, respectful, and useful—and receive it without turning the conversation into a performance review of the feedback itself.",
    category: "People and Culture",
    folder: "",
    updatedAt: "2026-09-28T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 5,
    groups: [],
    body: "",
    lessons: [
      {
        id: "course-5-1",
        title: "Describe the work, not the person",
        body: md`Useful feedback starts with something observable and explains its effect. “You are careless” assigns a trait. “The launch note went out without the date, so Support could not tell customers when the change started” names a behavior and consequence. The second version gives the person something they can respond to.

Try to give feedback close to the event, in a setting that fits its sensitivity. Praise can be public when the person welcomes it. Corrective feedback usually deserves a private conversation.`,
      },
      {
        id: "course-5-2",
        title: "Be direct and curious",
        body: md`Directness does not require certainty about intent. State what you observed, explain why it matters, and ask for the other person’s view. They may know context you do not. Listening does not require you to withdraw a valid concern; it helps you understand it accurately. If the concern is a missed handoff, describe that handoff and its effect on response time. Do not infer the colleague’s motive.

A practical opening:

> “I noticed [specific event]. The effect was [impact]. What was happening from your perspective?”`,
      },
      {
        id: "course-5-3",
        title: "Agree on what happens next",
        body: md`Feedback should lead to understanding or a next step, not a vague promise to “be better.” Agree on the change, support, or follow-up that would help. If the issue is urgent or affects safety, customers, or policy, use the appropriate escalation path rather than relying on informal coaching alone.

| Helpful | Less useful |
| --- | --- |
| Specific example | General label |
| Clear impact | Guess about motive |
| Invitation to respond | Debate over whether someone is “too sensitive” |
| Agreed next step | Surprise follow-up weeks later |`,
      },
    ],
    questions: [
      {
        id: "course-5-q1",
        prompt: "A teammate’s handoff omitted a key customer constraint. Which opening is most useful?",
        options: ["“You never pay attention.”", "“The handoff left out the customer’s data-location requirement, so the review started with the wrong assumption. What happened?”", "“No worries, but maybe try harder.”"],
        answer: 1,
      },
    ],
  },
  {
    ...base,
    id: "course-6",
    kind: "course",
    title: "New Hire Orientation: Welcome to the Future",
    summary: "Find the people, tools, and information that make the first week manageable.",
    category: "People and Culture",
    folder: "",
    updatedAt: "2026-09-28T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 5,
    groups: [],
    body: "",
    lessons: [
      {
        id: "course-6-1",
        title: "Start with the essentials",
        body: md`Your first week is for learning how work gets done, not memorizing every acronym. Confirm access to the systems your role needs, meet your manager, and learn where team decisions and current priorities are recorded. If an account or permission is missing, report it through the approved support channel; do not borrow someone else’s login.

A first-day checklist can be short:

- Meet your manager and immediate teammates.
- Confirm required account access.
- Find the current team priorities.
- Learn how to request help and report a security concern.`,
      },
      {
        id: "course-6-2",
        title: "Ask questions early",
        body: md`New employees often hesitate because they do not know whether a question is “obvious.” At Hooli, the acronym is usually new to everyone outside the meeting where it was invented. Ask what a term means, who owns a decision, and where the latest guidance lives. A clear answer now prevents several confident guesses later.

When asking for help, include what you were trying to do, what happened, and any error message. Never include passwords or customer secrets in an open channel.`,
      },
      {
        id: "course-6-3",
        title: "Learn the communication norms",
        body: md`Teams vary in how they use chat, documents, meetings, and calendars. Ask which channel is for urgent requests, where durable decisions belong, and when people are expected to respond. “Online” does not always mean “available.” If a request can wait, say so.

| Need | First place to look |
| --- | --- |
| Current team work | Team priorities or planning space |
| Account access | Approved IT/help channel |
| People policy | Current People documentation |
| Urgent customer issue | Team escalation path |`,
      },
    ],
    questions: [
      {
        id: "course-6-q1",
        prompt: "You cannot access a tool required for your role. What is the best next step?",
        options: ["Use a teammate’s credentials temporarily", "Ask the approved support channel and explain the access needed", "Search for an old shared password"],
        answer: 1,
      },
    ],
  },
  {
    ...base,
    id: "course-7",
    kind: "course",
    title: "Managing Through Reorganization",
    summary: "Communicate clearly when roles or reporting lines are changing and some answers are not yet settled.",
    category: "People and Culture",
    folder: "",
    updatedAt: "2026-09-28T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 5,
    groups: [],
    body: "",
    lessons: [
      {
        id: "course-7-1",
        title: "Separate what is known from what is open",
        body: md`During a reorganization, employees need reliable facts more than confident speculation. Say what has been decided, when it takes effect, and where the official update lives. Identify open questions and who is working on them. If you do not know, say so and give a date for the next update when possible.

Do not interpret a draft org chart as a final decision. Do not promise that a role, manager, or team will remain unchanged unless that has been confirmed by the appropriate decision-maker.`,
      },
      {
        id: "course-7-2",
        title: "Make the impact concrete",
        body: md`A change matters through its effect on people’s work: priorities, decision rights, customer ownership, approvals, and support. Explain which of these is changing now and which remains the same. Invite employees to raise individual concerns privately when a group meeting is not the right place.

- Name the effective date.
- Clarify the interim owner for open work.
- Explain where reporting or access questions go.
- Protect confidential personnel details.`,
      },
      {
        id: "course-7-3",
        title: "Keep the update loop",
        body: md`A manager’s credibility comes from closing the loop, including when the answer is still pending. Keep a small list of questions, owners, and next update dates. If a prior statement changes, explain what changed and correct the original source so employees are not left comparing conflicting versions.

| Question | Owner | Next update |
| --- | --- | --- |
| Which team owns the account? | Sales leadership | Thursday |
| Does approval routing change? | Finance operations | Friday |`,
      },
    ],
    questions: [
      {
        id: "course-7-q1",
        prompt: "A team asks whether a proposed reporting line is final. You have no confirmation. What should you say?",
        options: ["“It is probably final, so plan around it.”", "“It is not confirmed yet. I will check with the decision owner and update you by Thursday.”", "“Please do not ask until the organization settles.”"],
        answer: 1,
      },
    ],
  },
  {
    ...base,
    id: "course-8",
    kind: "course",
    title: "Meetings That Could Have Been an Email",
    summary: "Use a meeting when people need to decide or work through something together; make the purpose and outcome visible.",
    category: "People and Culture",
    folder: "",
    updatedAt: "2026-09-28T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 5,
    groups: [],
    body: "",
    lessons: [
      {
        id: "course-8-1",
        title: "Choose the right format",
        body: md`A meeting is useful when live discussion will help people resolve ambiguity, make a decision, or coordinate work. A status that requires no discussion may be clearer in writing. Some topics need both: a short written pre-read and a meeting for the unresolved question. Hooli has a calendar setting for “strategic alignment”; it does not make a meeting necessary.

Before sending an invitation, write one sentence describing what should be true when the meeting ends.`,
      },
      {
        id: "course-8-2",
        title: "Invite the people needed for the outcome",
        body: md`Include decision-makers and people with information necessary to reach the outcome. Tell participants what preparation matters and how much time it should take. If someone is optional, mark them optional and share the notes afterward. Do not invite an entire department to observe a decision that concerns three people. Send a short agenda naming the decision, its owner, and the material to read first. If those pieces are missing, prepare the work before scheduling.`,
      },
      {
        id: "course-8-3",
        title: "End with a record",
        body: md`Close by stating the decision, owner, and any unresolved question. Send notes to people who need them. If no decision was possible, explain what information is missing and when the group will return to it.

\`\`\`text
Purpose: Decide whether [option] meets [need]
Decision owner: [name or role]
Preparation: [link or none]
End state: [decision / next step]
\`\`\`

A concise record reduces repeat meetings because people can see what was settled. It also makes it easier to correct a misunderstanding before it becomes a plan.`,
      },
    ],
    questions: [
      {
        id: "course-8-q1",
        prompt: "A weekly meeting has no discussion, decisions, or coordination needs. What is a reasonable change?",
        options: ["Keep it because the calendar series already exists", "Try a written update and bring the group together only when a shared decision is needed", "Add more attendees so it feels important"],
        answer: 1,
      },
    ],
  },
  {
    ...base,
    id: "course-9",
    kind: "course",
    title: "Responsible AI, Pending Review",
    summary: "Use approved AI tools thoughtfully, protect information, and verify outputs before relying on them.",
    category: "Trust and Customer Readiness",
    folder: "",
    updatedAt: "2026-09-28T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 5,
    groups: [],
    body: "",
    lessons: [
      {
        id: "course-9-1",
        title: "Know what may be shared",
        body: md`Use only tools approved for the information you plan to enter. Do not paste customer data, credentials, unreleased financial information, or confidential employee details into a tool unless current policy explicitly allows it. If the tool’s data handling is unclear, stop and ask the designated reviewer.

AI output can sound confident while being incomplete or wrong. Treat it as a draft or suggestion, not as evidence that a fact is true or a decision has been approved.`,
      },
      {
        id: "course-9-2",
        title: "Check the output",
        body: md`Before using generated material, verify facts against reliable sources, inspect calculations, and make sure the text does not reveal information that should stay private. For customer-facing work, confirm that product claims match current released behavior. A polished paragraph is not a substitute for product review.

| Before use | Check |
| --- | --- |
| Facts | Can each important claim be verified? |
| Data | Was the input allowed in this tool? |
| Audience | Could this disclose private or confidential information? |
| Product claims | Is this available now, in this context? |`,
      },
      {
        id: "course-9-3",
        title: "Keep a person accountable",
        body: md`The person using the output remains responsible for the work they share. Record material AI assistance when required by policy or the audience. Escalate suspected exposure or harmful output promptly through the established process. Do not ask the model to make a decision that belongs to a qualified person.

Hooli’s policy review status is an ongoing joke in this demo. In a real workplace, always use the current approved policy and confirm that it applies to your tool and use case.`,
      },
    ],
    questions: [
      {
        id: "course-9-q1",
        prompt: "A draft AI response includes an unverified claim about a product launch. What should you do?",
        options: ["Share it because the wording sounds certain", "Verify it against the current product source and remove or correct it if unsupported", "Add “AI-generated” and leave the claim unchanged"],
        answer: 1,
      },
    ],
  },
  {
    ...base,
    id: "course-10",
    kind: "course",
    title: "Security Basics: Don’t Paste That Here",
    summary: "Protect accounts and information, recognize common risks, and report problems quickly.",
    category: "Trust and Customer Readiness",
    folder: "",
    updatedAt: "2026-09-28T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 5,
    groups: ["sales"],
    body: "",
    lessons: [
      {
        id: "course-10-1",
        title: "Protect your account",
        body: md`Use your own account and the authentication method approved by Hooli. Keep passwords and recovery codes private. Use a password manager if one is provided, and turn on required multifactor authentication. A teammate’s account is not a shortcut: it hides who took an action and may expose information beyond your role.

Be cautious with unexpected login prompts, attachments, and links. If a message creates urgency or asks for credentials, verify the request through a separate trusted channel.`,
      },
      {
        id: "course-10-2",
        title: "Handle information with care",
        body: md`Share only the information needed with people who are authorized to see it. Check recipients before sending, use approved storage, and avoid copying customer or employee details into public channels. Lock your device when you step away and use approved networks and software. If you are unsure whether a record may be shared, pause and ask the data owner or security contact. A delayed share is easier to correct than an exposed record.`,
      },
      {
        id: "course-10-3",
        title: "Report a mistake promptly",
        body: md`If you click a suspicious link, send information to the wrong person, or lose a device, report it promptly using Hooli’s security incident channel. Early reporting gives responders a chance to limit impact. Do not delete evidence or try to investigate beyond your role.

\`\`\`text
Report: what happened, when, and which account/device was involved.
Do not include: passwords, recovery codes, or unnecessary customer data.
\`\`\`

You do not need to know whether an event is “serious enough” before reporting it. Security can assess the details and tell you what to do next.`,
      },
    ],
    questions: [
      {
        id: "course-10-q1",
        prompt: "You realize a file containing customer details went to the wrong recipient. What should happen first?",
        options: ["Report it promptly through the security incident channel", "Delete your sent message and assume the problem is gone", "Wait to see whether the recipient notices"],
        answer: 0,
      },
    ],
  },
  {
    ...base,
    id: "course-11",
    kind: "course",
    title: "Customer Escalations: Calm, Clear, Owned",
    summary: "Acknowledge a customer problem, coordinate the right response, and give updates you can keep.",
    category: "Trust and Customer Readiness",
    folder: "",
    updatedAt: "2026-09-28T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 5,
    groups: ["sales"],
    body: "",
    lessons: [
      {
        id: "course-11-1",
        title: "Understand the impact",
        body: md`An escalation is a request for coordinated attention, not a judgment about who caused the problem. Confirm what the customer is experiencing, who is affected, when it began, and what work is blocked. Ask for only the information needed to investigate, and use approved channels for sensitive details.

Acknowledge the customer’s impact without guessing at the cause. “I understand this is blocking your team’s scheduled rollout” is more useful than “Our system is definitely at fault” before investigation begins.`,
      },
      {
        id: "course-11-2",
        title: "Assign an owner and route it",
        body: md`One person should coordinate the customer-facing thread, even when several specialists are investigating. Route the issue through the current escalation path and include a concise summary, impact, relevant timestamps, and what has already been tried. Avoid opening parallel requests that fragment the history.

| Include | Example |
| --- | --- |
| Impact | “Four users cannot complete sign-in” |
| Start | “First observed at 10:20 PT” |
| Scope | “Only the west-region workspace so far” |
| Next update | “We will update you by 1:00 PT” |`,
      },
      {
        id: "course-11-3",
        title: "Communicate what you know",
        body: md`Set a next update time, even if the investigation is still underway. If you cannot meet it, send a short note before the time passes. Distinguish a workaround from a fix and a hypothesis from a confirmed cause. Close the loop when the issue is resolved and share any follow-up that the customer needs. Keep status, owner, and update time in the shared case record so support, product, and the account team do not make conflicting promises.`,
      },
    ],
    questions: [
      {
        id: "course-11-q1",
        prompt: "The investigation is ongoing and the cause is unknown. Which update is best?",
        options: ["“We found the issue and it will never happen again.”", "“We are still investigating sign-in failures for four users. We will update you by 1:00 PT.”", "“Engineering has it now, so there is nothing to report.”"],
        answer: 1,
      },
    ],
  },
  {
    ...base,
    id: "course-12",
    kind: "course",
    title: "Speaking About Hooli Products",
    summary: "Describe what a product does today, support important claims, and explain limitations plainly.",
    category: "Trust and Customer Readiness",
    folder: "",
    updatedAt: "2026-09-28T12:00:00.000Z",
    status: "published",
    version: 1,
    duration: 5,
    groups: ["sales"],
    body: "",
    lessons: [
      {
        id: "course-12-1",
        title: "Start with the customer’s need",
        body: md`A useful product explanation connects a current capability to a customer problem. Avoid leading with internal architecture or a slogan unless it helps the customer understand the result. Ask enough questions to learn the customer’s context, then explain what the product can do in that context. Ask which workflow is slow or costly today, what success would look like, and who will evaluate it. Connect only a released capability to that need.`,
      },
      {
        id: "course-12-2",
        title: "Separate available from planned",
        body: md`A prototype, roadmap item, internal demo, and released capability are different things. Say which one you mean. If availability depends on configuration, plan, or rollout, name the condition. Do not imply a feature is generally available because it worked in one demonstration.

| Status | Clear wording |
| --- | --- |
| Available | “You can use this today in [supported context].” |
| Limited rollout | “Access is currently limited to [scope].” |
| Planned | “This is on the roadmap; timing is not confirmed.” |
| Unknown | “I’ll confirm before I give you an answer.” |`,
      },
      {
        id: "course-12-3",
        title: "Make evidence part of the claim",
        body: md`When describing performance or outcomes, include the context that makes the evidence meaningful. Avoid guarantees unless the company has approved that exact guarantee. If you discover that an earlier statement was inaccurate, correct it promptly and share the accurate version with the customer and internal team.

**A good pattern:** capability → evidence → limitation → next step. For a benchmark, name the test workload and baseline before quoting a result. If those details are unavailable, say what you will verify and when you will return with an answer.`,
      },
    ],
    questions: [
      {
        id: "course-12-q1",
        prompt: "A feature appeared in an internal demo but has no confirmed release date. What can you tell a customer?",
        options: ["“It launches next quarter.”", "“We demonstrated it internally, but availability and timing are not confirmed.”", "“It is available if your account team enables it.”"],
        answer: 1,
      },
    ],
  },
];
