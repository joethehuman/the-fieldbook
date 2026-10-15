import type { Content } from "../../types";
import { artwork, sampleContent, docLink as link, courseLink } from "./shared";

function update(
  id: string,
  title: string,
  shortTitle: string,
  summary: string,
  category: string,
  body: string,
): Content {
  return {
    ...sampleContent(id, "brief", title, summary),
    category,
    cardArt: artwork(id, shortTitle),
    body: body.trim(),
    duration: Math.max(2, Math.ceil(body.split(/\s+/).length / 200)),
  };
}

export const demoUpdates = [
  update(
    "brief-1",
    "We Solved Middle-out Again!",
    "Again. Somehow.",
    "Engineering has a new result. Product Marketing has a new paragraph. Please use them together.",
    "Product & Launches",
    `
The compression team has completed another internal evaluation. The result is encouraging enough for an announcement and specific enough to require reading the second paragraph.

In the tested configuration, the lab build reduced output size on the sample archive compared with the prior internal build. Engineering is checking repeatability and the tradeoffs in processing time. No customer savings figure has been approved.

Gavin has described this as another breakthrough. The team has described it as a useful result under documented conditions. Product Marketing is pleased to have found room for both views in the launch channel.

## What sellers should do

Keep using ${link("availability", "current product guidance")}. If a buyer asks whether the result applies to their archive, offer an SE review and a scoped evaluation. Do not replace the workload label on the graph with “all data.”

The ${link("compression", "compression guide")} explains how to discuss input, baseline, settings and results. ${courseLink(2, "Understanding Middle-out")} provides the short version, including the inconvenient part about Pied Piper's contribution to the subject.

## What happens next

Engineering will finish the review; Product will confirm any change in supported availability. Product Marketing will then update the brief and customer-facing material together.

Until that happens, the approved next step is an evaluation, not a guarantee. Please allow the result to finish becoming a result before announcing that it has become the future.`,
  ),

  update(
    "brief-2",
    "HooliForce CRM Is Here",
    "Your Optimism Has Fields",
    "One account record, one next action, and a dedicated place for the forecast to meet reality.",
    "Revenue Operations",
    `
HooliForce is now the shared account and opportunity workspace for revenue teams. It replaces the collection of private spreadsheets previously known as our customer intelligence architecture.

![Colleagues working together around a shared table](https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1400&q=80)

Start by finding the existing account, checking the owner and updating the next action. Do not import your personal account list until Revenue Operations has reviewed duplicates. We would prefer Aviato to appear once, regardless of how many times Erlich repeats the name.

## The fields that matter

| Field | Enter |
| --- | --- |
| Customer problem | What the buyer actually wants to change |
| Stage | Evidence of the current buying step |
| Forecast category | Confidence in closing this period |
| Next action | Something a named person will do |
| Open risk | The question that could change the plan |

Strategic Resonance remains visible while its original sponsor is located. Use the available Unknown value if it cannot be determined from the customer conversation. Revenue Operations does not require a spiritual interpretation.

Complete ${courseLink(4, "Using HooliForce CRM")} and keep ${link("fields", "the field FAQ")} nearby. For stage definitions, use ${link("crm", "the CRM guide")}; for Commit, use ${link("forecast", "the forecast guide")}.

If access fails, contact IT for your own account. If a field makes honest entry impossible, send Revenue Operations the field and blocked task.

The launch will be successful when a colleague can understand the deal without calling you. A fully populated dashboard is a promising visual development, but remains a secondary measure.`,
  ),

  update(
    "brief-3",
    "Pied Piper Is Back in the Deal",
    "Yes, Them Again",
    "The refreshed battlecard is ready for calls where the buyer has already watched the other demo.",
    "Competitive Intelligence",
    `
The Competitive team has refreshed ${link("piedPiper", "the Pied Piper battlecard")}. This follows several field requests and one slide in which “too small to matter” was still presented as a durable advantage.

The guide now starts with the customer's evaluation: compression performance, infrastructure economics or a broader network proposition. Please establish which before preparing a response to all three.

## What changed

- Questions for understanding the workload and evaluator
- Responses to benchmark and support comparisons
- A clear separation between product evidence and our feelings about Richard
- A reminder that an acquisition is not a customer-facing feature

Use ${courseLink(13, "Competitive Selling")} to practice the conversation. The trailer will do the scene-setting. You will still need to ask the buyer a question.

Send Competitive a dated source, sanitized account context and the buying impact when new claims appear. Do not forward the entire account workspace or treat a rumor as a release announcement.

${link("landscape", "The landscape guide")} also clarifies the roles of YaoNet, Endframe, Raviga, Bream Hall and K-Hole Games. The matrix is intended to prevent us from treating every company in the Valley as a compression vendor.

If the competitor has a stronger technical result, capture it accurately and involve an SE. If we failed to follow up, capture that accurately too. The updated battlecard does not provide a product explanation for an unanswered email.`,
  ),

  update(
    "hooli-update-04",
    "Security Refresher Assigned to Everyone",
    "Nice Try, “Gavin”",
    "The founder's name is not sufficient proof that a request for your recovery code is legitimate.",
    "Customer Trust",
    `
The security refresher is available in assigned learning. Complete the lessons and knowledge check within the window shown in Courses; the current deadline is there, rather than in a forwarded copy of this announcement.

This edition includes unexpected login prompts, clean customer demos, file-sharing mistakes and requests apparently sent by Gavin.

IT confirms that Gavin does not need your password in a direct message. A request to enlarge Gavin's portrait is more plausible, but still deserves verification through a known contact route.

## Before the next customer call

1. Use your own account and required multifactor authentication.
2. Check the workspace and tabs you are about to share.
3. Use agreed sample data for the demonstration.
4. Verify recipients and access before sending files.

If something goes wrong, report it through the Security queue promptly with the time, system and observed event. Do not include the exposed credential in the ticket. ${link("security", "The incident guide")} explains the route; ${link("data", "customer data handling")} covers evaluations.

${courseLink(10, "Security Basics: Don’t Paste That Here")} records completion in Courses. Managers can use progress reporting to help with access or time constraints. Please do not create a competing completion spreadsheet.

HooliCon gave the company considerable experience with technical issues in front of an audience. This refresher aims to keep the next one from beginning with your screen share.`,
  ),

  update(
    "hooli-update-05",
    "Responsible AI Guidance: Review Complete*",
    "Reviewing the Review",
    "The approved drafting workflow is ready. The committee's preferred name for it remains under discussion.",
    "Customer Trust",
    `
The review committee has approved the sales-assist workspace for general drafting using public product material and synthetic examples. Customer records, restricted documents and credentials are outside that approval unless Security explicitly clears the tool and use.

This completes the review of the stated workflow. It does not approve every tool with a sparkle icon.

## A person still checks the work

Before sharing an output, verify product availability, benchmark conditions, calculations, dates and citations. Confirm that statements attributed to the buyer appear in the actual account record. Remove invented features even when they would make the email considerably easier to write.

Gavin's Tethics initiative demonstrated the appeal of a highly visible pledge. Our committee has chosen the less photogenic requirement of checking the result.

Read ${link("ai", "the revised guidance")} and complete ${courseLink(9, "Responsible AI, Pending Review")}. The course includes an output that confidently launches an unconfirmed feature. Please correct it rather than admiring the positioning.

Questions about a different use case should include the task, data type and intended audience. Suspected exposure goes to Security immediately; it should not wait for the committee agenda.

*The asterisk refers to the naming review. “Responsible Intelligence Enablement Layer” and “Democratized Cognitive Assistance” remain in contention. Neither phrase changes which information you may submit.

Employees may continue to call it the drafting tool while the committee develops a more strategic relationship with brevity.`,
  ),

  update(
    "hooli-update-06",
    "Customer Escalations Have One Owner Now",
    "One Fire. One Owner.",
    "Technical teams can work in parallel. The customer should receive one current account of the facts.",
    "Customer Trust",
    `
The escalation route now names a customer communication coordinator on the Support case. This addresses the recurring situation in which five helpful colleagues send five different versions of “we are looking into it.”

Support still owns technical routing. The account team still owns the commitments it made. Adding Gavin to the thread remains an executive escalation, not an incident-management design.

## Include this in the first report

| Detail | Example |
| --- | --- |
| Impact | Evaluation team cannot retrieve the archive |
| Start | First observed at 10:20 PT |
| Scope | One workspace; other regions unconfirmed |
| Prior steps | Retry completed; same result |
| Communication | AE will update the buyer by 1:00 PT |

Use the existing case when one is open. Link restricted evidence in its approved location. Label hypotheses as hypotheses and do not promise a fix time the technical owner has not confirmed.

${courseLink(11, "Customer Escalations: Calm, Clear, Owned")} walks through the handoff and update. ${link("handoff", "The customer handoff guide")} helps surface promises before implementation discovers them.

Nucleus provided a well-attended lesson in the difference between a launch narrative and what the audience can actually see. Start customer updates with the observed impact, then the known status and next update time.

If the next update changes, tell the customer before the original time passes. The coordinator owns that sentence even when the investigation belongs to several teams.`,
  ),

  update(
    "hooli-update-07",
    "Introducing Hooli’s Three Comma Club",
    "Mind the Commas",
    "A recognition program with ambitious branding and several clarifications from Finance.",
    "Life at Hooli",
    `
Hooli is introducing the Three Comma Club to recognize exceptional commercial contribution. Revenue leadership proposed the name after a discussion about ambition. Finance has since requested a discussion about punctuation.

The program recognizes sellers who deliver strong results while maintaining sound customer commitments, clean account records and useful handoffs. The current compensation plan remains the source for eligibility, credit and payment. This announcement does not amend it.

## A brief numerical clarification

Russ Hanneman's Three Comma Club refers to billionaire status. This program does not confer billionaire status, authorize a sports car purchase or change the way the doors on your current car open.

| Program question | Answer |
| --- | --- |
| Does the award change my commission plan? | No |
| Do bookings equal cash? | No |
| Can I count the full contract value as ARR? | Read the finance guide |
| Is Tres Comas an approved expense category? | Not by itself |

${link("finance", "Finance for People Who Say ARR a Lot")} explains the numbers. ${courseLink(14, "Pricing and Negotiation")} covers protecting them while a deal is still negotiable.

Managers should nominate work with the account, outcome and supporting evidence. Include the customer handoff and material concessions. A large discount followed by a larger celebratory post is not the complete record.

The recognition team is reviewing an award design with three commas. Finance has asked that at least one of them be placed between clauses in a sentence about margin.`,
  ),

  update(
    "hooli-update-08",
    "Signature Box 3: Field Launch Briefing",
    "Same Box. More Gavin.",
    "The field brief brings product positioning, evaluation, quoting and the founder's signature into one manageable conversation.",
    "Product & Launches",
    `
The Signature Box 3 field briefing is ready. It covers the buyer problem, supported evaluation path, commercial preparation and the questions customers are likely to ask after noticing the product name.

“Same Box. More Gavin.” is the internal cover line. It is not a technical comparison between models. Use the actual configuration when discussing capability, sizing or performance.

## Prepare before the call

Read ${link("box", "the Box field guide")} and ${link("availability", "current product status")}. Review the workload with an SE. Confirm the offered model, evaluation criteria, quote and support arrangements.

The Hooli Launch Readiness curriculum brings together disruption, positioning and product conversations. Complete the assigned preparation in Courses and use ${link("launch", "the launch playbook")} for the working brief.

## The demonstration has an owner

Rehearse the actual scenario with agreed data, accounts and a fallback. Name who can stop the demonstration if it fails. A brief pause is preferable to discovering whether the keynote music can cover an outage.

Nucleus and HooliCon have already contributed enough material to the company's informal launch curriculum. We are attempting to apply it before the event this time.

For price or term exceptions, use ${link("discount", "Deal Desk guidance")}. For an executive briefing, prepare ${link("executive", "the requested account brief")} before approaching Gavin's office.

The customer should leave with a supported next step. Gavin should leave with the correct introduction. Both outcomes require preparation, although only one appears on the technical checklist.`,
  ),

  update(
    "hooli-update-09",
    "Hooli Wellness Week Begins Monday",
    "Gut Feelings at Scale",
    "Gavin has identified a new center of operational excellence. The calendar has been informed.",
    "Life at Hooli",
    `
Wellness Week begins Monday with an executive introduction to personal processing architecture. Gavin has asked that the session be scheduled before lunch, while employees are still receptive to the framework.

The accompanying ${link("gut", "Guide to Gut Health")} describes internal alignment, processing confidence and a measure currently called digestive velocity. Operations is working on the definition and has requested that teams refrain from submitting numbers in the meantime.

## What is on the calendar

| Session | Current state |
| --- | --- |
| Opening remarks from Gavin | Expanded |
| Quiet reflection | Moved to make room for opening remarks |
| Lunch | Awaiting terminology review |
| Gut dashboard preview | No employee data requested |
| Walking conversation | Available without a slide deck |

Participation in the activities is optional. Customer commitments remain owned, and managers should arrange coverage for colleagues who attend. No one needs to explain their lunch in HooliForce.

The office has confirmed that this program does not change ${link("forecast", "forecast criteria")}. A gut feeling remains insufficient evidence for Commit, even when recorded in the new template.

Gavin's longstanding interest in personal optimization has given this initiative unusually direct sponsorship. The events team has therefore secured the largest room and declined the suggestion of a leaderboard.

If you have a scheduling question, contact the organizer. If you have a definition for digestive velocity, Operations would appreciate receiving it before the dashboard review.

The review itself has been extended by forty minutes to allow for a more complete discussion of flow.`,
  ),

  update(
    "hooli-update-10",
    "Quarterly Revenue All-hands: The Numbers Behind the Numbers",
    "Record Pipeline. Next Slide.",
    "A review of customer progress, launch readiness and the distinction between a large pipeline and a purchasing decision.",
    "Revenue Operations",
    `
The quarterly revenue all-hands will review the forecast, current launches, competitive evaluations and the customer work behind the totals. The calendar invitation contains the current time and joining details.

Gavin will open with the market opportunity. Finance will then explain which parts of that opportunity appear in the current period.

## The working agenda

1. Customer outcomes and recent wins
2. Forecast changes, risks and decision plans
3. Signature Box field readiness
4. Pied Piper and other actual alternatives
5. Questions, owners and follow-up

Bring an account example with evidence. For a win, explain what mattered to the buyer. For a loss, separate product fit, price, process and no decision. “Competitive intensity” is not specific enough to tell Product what to improve.

${link("forecast", "The forecast guide")} and ${link("finance", "finance definitions")} establish the numbers. ${link("landscape", "The competitive landscape")} establishes which companies belong in the comparison.

The events team has reviewed RussFest as a model and selected a simpler production approach. There is no hologram dependency in the current run of show. Requests to add one must identify the customer outcome it supports.

After the session, Revenue Operations will post decisions, actions and owners. People who cannot attend should still be able to tell what changed. Use ${link("meetings", "the decision-note template")} for team follow-ups.

Please submit questions in advance with the account or process context. We will take difficult questions in the room when possible, and record an owner when not. “Let's take that offline” now requires somewhere to take it.`,
  ),
];
