import type { Content, Question } from "../../types";
import { sampleContent, artwork, docLink as link } from "./shared";

type Check = [string, string[], number | number[], string];
function course(
  n: number,
  title: string,
  shortTitle: string,
  summary: string,
  category: string,
  lessons: [string, string][],
  checks: Check[],
): Content {
  const id = `course-${n}`;
  return {
    ...sampleContent(id, "course", title, summary),
    category,
    duration: 7,
    cardArt: artwork(id, shortTitle),
    requirePassing: n !== 8,
    lessons: lessons.map(([title, body], index) => ({
      id: `${id}-${index + 1}`,
      title,
      body: body.trim(),
    })),
    questions: checks.map(
      ([prompt, options, correct, explanation], index): Question => {
        const questionId = `${id}-q${index + 1}`;
        return {
          id: questionId,
          prompt,
          options,
          explanation,
          ...(Array.isArray(correct)
            ? {
                multiple: true,
                correctOptionIds: correct.map((i) => `${questionId}:${i}`),
              }
            : { answer: correct }),
        };
      },
    ),
  };
}
const sales = "Sales Foundations",
  product = "Products & Competition",
  leadership = "Leading at Hooli",
  trust = "Trust & Customer Readiness";

export const demoCourses: Content[] = [
  course(
    1,
    "Disrupting the Disruption",
    "Pivot With Confidence",
    "Keep the customer problem in view while the initiative acquires its third strategic name.",
    product,
    [
      [
        "Name the actual problem",
        `At Hooli, an initiative can acquire a new name before it acquires a customer. Begin with the observable problem: who encounters it, what happens and what would improve. A clear problem statement gives a team something stable to work on even when the presentation changes.

“The archive takes too long to retrieve” can lead to an evaluation. “We will disrupt enterprise memory” can lead to a keynote. Keep track of which assignment you accepted.

Write one sentence about the customer's current workflow. Ask the buyer to correct it before choosing the solution. Nucleus had plenty of positioning; positioning did not repair the livestream.`,
      ],
      [
        "Give the work an owner",
        `Identify one person coordinating the next decision. Bring Sales, SE and Product together around the customer requirement, then name who can decide scope and availability. Jack Barker's triangles look connected on paper. Your account plan should establish the actual connection.

| Record | Example |
| --- | --- |
| Problem | Archive retrieval misses the operating target |
| Owner | Account SE |
| Next decision | Whether the workload fits a supported evaluation |
| Evidence needed | Representative input and agreed measurements |

An executive sponsor can remove a blocker. They should not become the unnamed owner of every open item.`,
      ],
      [
        "Change the name without losing the work",
        `When the initiative is renamed, preserve its problem, decisions, owners and risks. Ask whether the goal, buyer or scope changed too. If so, review those changes explicitly rather than letting the new branding authorize them.

Use this handoff:

~~~text
Current name:
Customer problem:
What actually changed:
Decision owner:
Next checkpoint:
~~~

Update the shared source and tell the people doing the work. Do not create a second account plan just because the first has the old logo. Endframe's journey into Hooli is complicated enough without reproducing it in the folder structure.

Continue with ${link("launch", "the launch playbook")}.`,
      ],
    ],
    [
      [
        "A sponsor renames the initiative but describes the same goal. What should the owner do?",
        [
          "Restart discovery because the old name is obsolete",
          "Update the name, preserve decisions and confirm whether scope changed",
          "Treat the new name as approval to launch",
        ],
        1,
        "A rename changes presentation. Confirm any real scope change and preserve the work already agreed.",
      ],
      [
        "Which problem statement gives the team something to test?",
        [
          "Support spends twenty minutes finding the latest account status",
          "We will redefine the customer continuum",
          "Gavin wants a bigger launch",
        ],
        0,
        "An observable workflow problem supports a measurable evaluation. A slogan does not supply the missing baseline.",
      ],
    ],
  ),

  course(
    2,
    "Understanding Middle-out",
    "They Have an Algorithm",
    "Explain compression, interpret the evidence and survive the moment somebody mentions Pied Piper.",
    product,
    [
      [
        "The short version",
        `Compression reduces the space needed to represent data. Middle-out is associated with Richard Hendricks and Pied Piper. Hooli's preferred origin story is not a technical specification.

In a customer conversation, explain the user problem first and the method second. Ask whether the buyer needs lower storage use, faster transfer or a different operating outcome. Those requirements can involve tradeoffs.

Learn the offered product's implementation from an SE. The name of an algorithm does not establish what a particular Box configuration can do. Gavin's signature is also not a performance setting.`,
      ],
      [
        "Separate measurement from promise",
        `Agree on representative input, a baseline, settings and success criteria before running a comparison. Include processing time and recovery requirements as well as output size. Repeat the test under the agreed conditions.

| Result | Responsible interpretation |
| --- | --- |
| Smaller output on one file | Improvement on that input and configuration |
| Faster run on different hardware | A result needing the hardware difference explained |
| An impressive trailer | Marketing has delivered a trailer |

Do not generalize a single win to every workload. Nucleus established that confidence can scale faster than readiness.`,
      ],
      [
        "Make the claim useful",
        `Use capability, evidence, limitation and next step. “We can evaluate the supported workflow with your storage team; we have not tested this archive yet” gives the buyer something to act on.

If the buyer cites Pied Piper's benchmark, acknowledge it and ask how it maps to their requirement. Bring an SE into the comparison. Do not challenge the result because Richard delivered it while looking uncomfortable; this has proved an unreliable weakness.

Read ${link("compression", "the compression guide")} and ${link("piedPiper", "the battlecard")} before preparing a technical response. Record results that favor the competitor too. Product needs those rows more than Marketing wants them removed.`,
      ],
    ],
    [
      [
        "A benchmark improves output size on one input. Which claim is supported?",
        [
          "Hooli will compress every file better",
          "The result improved on that input; other workloads need evaluation",
          "The customer's storage bill is guaranteed to fall",
        ],
        1,
        "A benchmark supports the measured case, with its conditions. It does not guarantee every customer's outcome.",
      ],
      [
        "What should happen before a competitive evaluation?",
        [
          "Choose the smallest file that makes our graph look good",
          "Promise to beat Pied Piper",
          "Agree on representative input, baseline and success criteria",
        ],
        2,
        "Agree on the comparison before seeing the result so both teams can use it to decide.",
      ],
    ],
  ),

  course(
    3,
    "How to Democratize Anything",
    "Now With More Everyone",
    "Turn a category-defining announcement into a message a buyer can understand and a seller can use.",
    product,
    [
      [
        "Decide who everyone is",
        `Democratizing a capability should make it easier for a specific person to do something useful. Name that person and task before enlarging the audience to humanity.

Pied Piper's new-internet ambition is a memorable positioning story. A buyer still needs to know which workload it supports and what changes for them. Hooli sellers face the same obligation, despite having more room on the booth.

Write a plain sentence: “For [buyer] who needs [outcome], this capability enables [action].” If the sentence requires the words paradigm or inevitable, ask a colleague outside the launch team to explain it back.`,
      ],
      [
        "Make the message travel",
        `Build the message from a customer problem, a current capability and evidence. Add the important boundary and a useful next step. Give sellers one approved example, not eight interchangeable superlatives.

| Message component | Example |
| --- | --- |
| Buyer | Storage lead managing an expanding archive |
| Need | Reduce pressure without breaking retrieval |
| Evidence | A scoped evaluation under agreed conditions |
| Next step | Review supported inputs with an SE |

Hooli may democratize the future in the headline. The paragraph beneath it should say whether the customer can use the product this week.`,
      ],
      [
        "Give the launch an operating plan",
        `Publish the availability, audience, owner and seller action. Link the product Doc, learning and quote path. Ask Support what they need before asking Design for another countdown animation.

Capture field questions and update the maintained source. A launch does not end when Gavin leaves the stage; that is often when the requests become specific.

Use ${link("launch", "the launch brief")} to prepare the field. If the release is a preview, say so. If an item remains a proposal, give it an owner. “Universal empowerment layer” is not an availability state, although the brand team has requested that we keep the phrase available.`,
      ],
    ],
    [
      [
        "A launch invites feedback from everyone. What else should the announcement explain?",
        [
          "Every idea will be implemented",
          "Who reviews feedback and how people will hear back",
          "Ownership is no longer needed",
        ],
        1,
        "An open invitation needs a clear review owner and response path.",
      ],
      [
        "Which line best helps a seller act?",
        [
          "The future has become inevitable",
          "Hooli democratizes possibility",
          "The preview supports this workload; request an SE review to evaluate it",
        ],
        2,
        "A useful launch message states availability and a concrete next step.",
      ],
    ],
  ),

  course(
    4,
    "Using HooliForce CRM",
    "Log It or It Didn’t Happen",
    "Write account records that survive handoffs, forecast calls and the arrival of another executive.",
    sales,
    [
      [
        "Record what helps the next person",
        `Search for the account before creating a record. Confirm the company, domain and owner. Aviato and Erlich's Airline Thing should not become competing entries simply because the second name was more memorable.

Record the customer's stated problem, relevant contacts, status and next action. Separate the buyer's statement from your interpretation. “Buyer will review timing internally” is a fact. “Their executive energy suggests quarter-end” is a forecast in need of adult supervision.

Use the approved location for restricted material and link it. HooliForce is a shared account record, not a place to paste everything you can obtain.`,
      ],
      [
        "Keep stages honest",
        `Move an opportunity when the evidence supports the next stage. An agreed evaluation needs scope and success criteria. Commit needs a customer-backed decision plan and understood remaining steps. Closed Won needs an accepted executed agreement.

| Write | Avoid |
| --- | --- |
| Buyer will confirm evaluator Thursday | Great energy |
| Legal review open; owner identified | Basically signed |
| SE validating one file format | Technical team very confident |

Use ${link("crm", "the stage guide")} and ${link("forecast", "forecast definitions")}. Gavin joining a call is an activity; it does not automatically satisfy the exit criteria.`,
      ],
      [
        "Write notes that travel well",
        `A note should let a colleague act without replaying the meeting in your imagination. Include the customer question, what is confirmed, the owner and next update date.

> “Buyer needs regional storage confirmed. SE review requested; AE will update the buyer Thursday.”

Correct stale information when it changes. Link the current quote and evaluation. Before signature, identify open commitments; after signature, use ${link("handoff", "the customer handoff")}.

The dashboard will look better when the deal improves. Improving the note first is permitted. Revenue Operations has confirmed this does not require an exception.`,
      ],
    ],
    [
      [
        "The buyer will discuss timing internally but supplies no date. What belongs in HooliForce?",
        [
          "A guessed close date",
          "The buyer's statement and a follow-up action",
          "High intent, without a supporting note",
        ],
        1,
        "Record the fact and the next action. Do not turn an unknown date into a customer commitment.",
      ],
      [
        "Which note is most useful for a handoff?",
        [
          "SE will validate the file format Tuesday; AE will update the buyer Wednesday",
          "Excellent meeting; everyone aligned",
          "Gavin joined, so the technical risk is resolved",
        ],
        0,
        "A useful handoff names the open question, owner and next update.",
      ],
    ],
  ),

  course(
    5,
    "Radical Candor: A Required Refresher",
    "Feedback Has Entered the Chat",
    "Coach the work without introducing a new management score or making the seller regret asking.",
    leadership,
    [
      [
        "Describe the work, not the person",
        `Choose something observable in a call, note or handoff. Explain its effect and invite the seller's context. “The handoff omitted the customer's storage constraint” gives you a useful starting point. “You lack strategic hunger” gives you a phrase nobody can practice.

Monica and Gilfoyle's response to management scoring suggests that people may become impressively collaborative when united against a bad measurement. Prefer useful feedback to a new Coachability Index.

Discuss sensitive feedback privately and close to the event. Ask what the seller intended before deciding why they did it.`,
      ],
      [
        "Be direct and curious",
        `Use a specific event, its impact and a question.

> “We moved to price before confirming who approves the evaluation. That leaves the next step unclear. What did you hear from the buyer?”

Listen for information you missed. Separate a skill gap from a dependency. If Finance has not answered an exception request, another negotiation role-play may not unblock the deal.

Gavin's confidence is not a prerequisite for giving feedback. Neither is certainty about a colleague's motives. Be clear about the work and open about what you still need to understand.`,
      ],
      [
        "Agree on the next experiment",
        `Choose one behavior to try, the support needed and a review date. “On the next discovery call, confirm the decision process before discussing a proposal” can be practiced and reviewed.

Record the coaching agreement privately. Recognize improvement specifically. Avoid turning every conversation into a miniature performance review; sellers should not need a defense deck to discuss a missed question.

Use ${link("coaching", "the coaching guide")} for examples. If the problem affects a customer commitment, correct the commitment as well. A thoughtful feedback session does not update the account record by proximity.`,
      ],
    ],
    [
      [
        "A handoff omitted a customer constraint. Which opening is useful?",
        [
          "You never pay attention",
          "The missing constraint changed the implementation assumptions. What happened?",
          "Try to be more strategic",
        ],
        1,
        "A specific event and impact invite context and make improvement actionable.",
      ],
      [
        "Which follow-up makes coaching concrete?",
        [
          "Agree to demonstrate more executive energy",
          "Create a new attitude score",
          "Choose one question to practice on the next call and review it together",
        ],
        2,
        "A defined behavior and review point turn feedback into something the seller can try.",
      ],
    ],
  ),

  course(
    6,
    "New Hire Orientation: Welcome to the Future",
    "Your Badge Has a Quota",
    "Find your people, systems and first customer problem before memorizing the company mythology.",
    sales,
    [
      [
        "Start with the essentials",
        `Meet your manager, confirm the territory and request your own access. Find the team's current priorities and learn the customer escalation route. Hooli's campus is large; the first-day checklist does not need to match it.

Your badge and your account permissions are separate. If something is missing, contact the IT help queue with your role, requested access and error. Do not borrow a teammate's credentials.

Nelson Bighetti's upward mobility is a memorable part of Hooli life. Treat it as company history rather than your first-month development plan. Start by finding the person who actually owns the account.`,
      ],
      [
        "Learn the product and the buyer",
        `Read the current product status and follow one opportunity with an experienced seller. Ask an SE to explain the evaluation, then write a short summary in the buyer's language.

| Find | Ask |
| --- | --- |
| Product fit | Which current capability addresses the need? |
| Buying process | Who evaluates and who approves? |
| Next action | What have both sides agreed to do? |

Learn where Hooli's claims end and Gavin's vision begins. The boundary is documented in ${link("availability", "product status")}, even when the keynote makes it difficult to see.`,
      ],
      [
        "Make the first week useful",
        `Complete the assigned foundations, review one customer call and draft a follow-up for your manager to review. Learn which channel is for urgent help and where durable account decisions belong.

Use ${link("firstWeek", "the first-week guide")} and ${link("systems", "the systems map")}. Write down unfamiliar terms and ask what they mean. An acronym can be important without the person using it being able to expand it.

At the end of the week, agree on the next learning priority and one piece of customer work you can own. Head Dreamer remains outside the standard onboarding sequence.`,
      ],
    ],
    [
      [
        "You cannot access a tool required for your role. What should you do?",
        [
          "Use a teammate's account",
          "Ask IT for the access and explain the role and task",
          "Look for a shared password in chat",
        ],
        1,
        "Request access for your own account so the system owner can grant the right permissions.",
      ],
      [
        "Which first-week activity most improves customer readiness?",
        [
          "Review an actual opportunity and summarize the buyer's problem with your manager",
          "Memorize every keynote slogan",
          "Create a new territory spreadsheet before checking ownership",
        ],
        0,
        "Real account context connects product learning to a buyer and a next action.",
      ],
    ],
  ),

  course(
    7,
    "Managing Through Reorganization",
    "Same Accounts. New Org Chart.",
    "Change the reporting lines without losing the customer, the owner or the commitments.",
    leadership,
    [
      [
        "Separate known from proposed",
        `A reorganization changes people's work before the new slide becomes familiar. State what is decided, when it takes effect and which questions remain open. A draft chart is not an announcement, even if its gradient looks final.

Hooli has given Nelson Bighetti more than one interpretation of organizational importance. Your team needs something more concrete than a new title: account ownership, priorities, approvals and support.

Name the decision owner and next update date. Avoid promising a role or reporting line that has not been confirmed. It is easier to explain an open question than to withdraw a confident invention.`,
      ],
      [
        "Protect the account handoff",
        `List active opportunities, customer commitments and pending approvals. Name an interim owner for each until the final mapping is confirmed. Tell the customer when their working contact changes and preserve the account history.

| Check | Prevents |
| --- | --- |
| Opportunity owner | Two teams assuming the other will follow up |
| Approval route | An exception resting in a departed manager's queue |
| Customer commitment | A promise becoming an organizational orphan |

Do not recreate an opportunity to make it fit the chart. HooliForce should retain the customer history, including the inconvenient parts.`,
      ],
      [
        "Keep the update loop",
        `Maintain a short list of questions, owners and dates. Correct the original source when a decision changes. Use private conversations for individual concerns and avoid speculating about colleagues' circumstances.

Ask what support the team needs to maintain customer continuity. A new reporting line does not automatically grant system access or settle credit splits; send those questions to the relevant owners.

Use ${link("handoff", "the handoff template")} for transferred work and ${link("finance", "the finance guide")} for commercial questions. The roof is not an acceptable destination for an unowned escalation.`,
      ],
    ],
    [
      [
        "A team asks whether a proposed reporting line is final. You have no confirmation. What do you say?",
        [
          "Probably; start operating that way",
          "It is unconfirmed. I'll check with the owner and update you Thursday",
          "Stop asking until the org settles",
        ],
        1,
        "State what is unknown and give a concrete route and date for clarification.",
      ],
      [
        "What should be protected during the transition? Select all that apply.",
        [
          "A named interim owner for open customer commitments",
          "A fresh opportunity record with no history",
          "The current approval route or a confirmed replacement",
        ],
        [0, 2],
        "Keep commitments owned and approvals routed while preserving the existing account history.",
      ],
    ],
  ),

  course(
    8,
    "Meetings That Could Have Been an Email",
    "You’re on Mute",
    "Make the next deal review earn its place between the launch briefing and the launch-briefing debrief.",
    leadership,
    [
      [
        "Choose the right format",
        `A meeting is useful when people need to decide, resolve ambiguity or coordinate work. A status update may be better in writing. Hooli's recurring invitation for strategic alignment does not settle this question.

Before inviting the team, finish: “When this ends, we will have…” Name a decision or useful next action. If the answer is “heard everyone's updates,” try a written summary first.

Gavin can build a presentation around an animal. The rest of us can begin with a question. This also reduces the number of dependencies Facilities has to manage.`,
      ],
      [
        "Invite for the outcome",
        `Bring the decision-maker and people with relevant information. Send the context in advance and mark optional attendees honestly. A customer call does not become better covered when the whole department watches silently.

For a deal review, ask the seller to bring the buyer's need, decision plan, stage evidence and the specific help requested. Discuss the unresolved point rather than reading every field aloud.

If the approver cannot attend, collect input and label the result a recommendation. Approval does not emerge spontaneously from a sufficiently well-attended video call.`,
      ],
      [
        "End with a record",
        `Close with the decision, owner, date and open question. Put customer commitments in HooliForce and link the durable record in the follow-up. Correct it when the decision changes.

~~~text
Decision:
Approver:
Action, owner and date:
Remaining question:
~~~

Use ${link("meetings", "the meeting guide")} for the template. Cancel recurring meetings when the purpose disappears. You may describe the recovered time as democratized productivity if that helps the approval.

This course records completion after a quiz attempt; passing is not required. We wanted one meeting-related activity to end without another approval.`,
      ],
    ],
    [
      [
        "A weekly meeting has no discussion or coordination need. What is a reasonable change?",
        [
          "Keep it because the invitation exists",
          "Try a written update and meet when a decision is needed",
          "Add more attendees",
        ],
        1,
        "Choose the format based on the work, not the age of the recurring invitation.",
      ],
      [
        "Which note establishes a real next step?",
        [
          "The group felt aligned",
          "Product will consider the future",
          "SE will validate the format Tuesday; the buyer review is Wednesday",
        ],
        2,
        "An owner, action and date let people act after the meeting.",
      ],
    ],
  ),

  course(
    9,
    "Responsible AI, Pending Review",
    "Confidently Pending",
    "Use approved tools without letting a generated paragraph launch a product on your behalf.",
    trust,
    [
      [
        "Know what may be shared",
        `Use the approved sales-assist workspace with public product information and synthetic examples. Keep customer records, credentials and restricted documents out unless Security has cleared the exact tool and use.

Gavin's Tethics campaign made values language highly visible. It did not remove the need to check what happens to information after you submit it.

Define the task: an outline, an edit, a summary of approved material. If the task is “make this unsupported feature sound available,” the problem is in the request before the tool begins answering.`,
      ],
      [
        "Check the output",
        `Verify product statements against maintained guidance. Recheck numbers, dates, customer assertions and citations. Open the source and confirm it supports the claim; a plausible title is not a document.

| Generated line | Check |
| --- | --- |
| Available everywhere | Supported configuration and release status |
| Saves thirty percent | Approved evidence and conditions |
| Buyer confirmed Friday | Actual call note and decision plan |

A response that resembles Gavin may still be wrong. Keep the accurate part and correct the rest before it reaches the customer.`,
      ],
      [
        "Keep a person accountable",
        `The person sharing the work owns the verification. If a false claim reached a customer, correct it with the account team. If restricted data entered an unapproved tool, stop the task and use the security route.

Read ${link("ai", "the AI guide")} and ${link("availability", "product status")}. Give reviewers the use case and data type when seeking a new tool decision.

Do not use an AI system to approve a pricing exception. It may sympathize with your quarter-end pressure, but Finance has not delegated authority to sympathy.`,
      ],
    ],
    [
      [
        "An AI draft contains an unverified launch claim. What should you do?",
        [
          "Share it because the wording sounds certain",
          "Verify it against current product guidance and correct it",
          "Add AI-generated and keep the claim",
        ],
        1,
        "Disclosure does not make an unsupported claim accurate. Verify and correct it.",
      ],
      [
        "Which actions are appropriate before sharing? Select all that apply.",
        [
          "Verify the benchmark and its conditions",
          "Assume a linked citation exists",
          "Check product availability against the maintained source",
        ],
        [0, 2],
        "Check the evidence and availability directly. A model's citation needs verification too.",
      ],
    ],
  ),

  course(
    10,
    "Security Basics: Don’t Paste That Here",
    "That Was the Customer List",
    "Protect access and information even when the message appears to come from the largest signature in the company.",
    trust,
    [
      [
        "Protect your account",
        `Use your own credentials, the company password manager and required multifactor authentication. Verify unexpected requests through a known separate route. Do not approve an unfamiliar prompt to make it disappear during a call.

A message asking for a password is suspicious even when it says Gavin needs it urgently. A request for a larger founder portrait is more plausible and should still be verified.

If access is missing, ask IT for the permission you need. Borrowing an account hides who took an action and can expose information beyond your role. Quarter-end is a date, not an authentication method.`,
      ],
      [
        "Handle information with care",
        `Prepare a clean demo environment with sample records. Check the account and tabs visible before sharing your screen. Agree on evaluation inputs before the customer sends a file.

Use restricted storage for sensitive material and links for collaboration. Check the recipients and access. Do not make a private file public to fix an inconvenient permission prompt.

HooliCon demonstrated that device problems can find a large audience. Keep your own demonstration from expanding the incident scope. If you need help, pause and ask the SE rather than improvising access in front of the buyer.`,
      ],
      [
        "Report the mistake promptly",
        `If you send data to the wrong recipient, expose a credential or lose a device, contact Security immediately. Include what happened, when and the system or account involved. Preserve the original message and follow responder instructions.

Do not paste the exposed password into the incident ticket. Do not run an independent investigation using another customer's data. The response team owns containment; the account owner coordinates customer communication with them.

Read ${link("security", "the incident guide")} and ${link("data", "customer data handling")}. Reporting promptly is useful. Waiting until the forecast call supplies no additional security benefit.`,
      ],
    ],
    [
      [
        "A customer file went to the wrong recipient. What should happen first?",
        [
          "Report through the Security route promptly",
          "Delete your sent message and assume it is gone",
          "Wait to see whether anyone notices",
        ],
        0,
        "Fast reporting lets responders assess and contain the exposure.",
      ],
      [
        "An unexpected message from Gavin asks for your recovery code. What should you do?",
        [
          "Send it; he owns the company",
          "Verify separately and report the suspicious request without sharing the code",
          "Forward the code to your manager for approval",
        ],
        1,
        "A senior name does not authorize credential sharing. Use a known independent route.",
      ],
    ],
  ),

  course(
    11,
    "Customer Escalations: Calm, Clear, Owned",
    "Please Stop Replying All",
    "Coordinate the response without turning the customer into the project manager of our reply chain.",
    trust,
    [
      [
        "Understand the impact",
        `Confirm what is blocked, who is affected, when it began and what has already been tried. Acknowledge the impact without guessing at the cause. “Your scheduled rollout is blocked” is useful. “It must be the network” is a hypothesis looking for a microphone.

Nucleus's livestream failure is an unusually public reminder that the audience experiences the problem before leadership finishes naming it. Describe what the customer can observe.

Ask for only the evidence responders need and use the agreed channel for restricted files. Link the existing case rather than collecting the same data in five threads.`,
      ],
      [
        "Assign an owner and route it",
        `Create or update the Support case, flag the impact and name one customer communication coordinator. Support owns technical routing; the coordinator owns keeping the customer informed.

| Include | Example |
| --- | --- |
| Impact | Evaluation team cannot retrieve the archive |
| Start | First observed at 10:20 PT |
| Known scope | One workspace; other regions unconfirmed |
| Next update | AE will update the buyer by 1:00 PT |

Adding Gavin to the thread does not identify an incident commander. It does identify another person who will request an update.`,
      ],
      [
        "Communicate what is known",
        `Give a next update time even when the cause is unknown. If it changes, tell the customer before the original time passes. Distinguish a workaround from a confirmed fix, and a test result from a theory.

When resolved, confirm the customer outcome and record any follow-up. Sales remains involved in commitments it made; forwarding the case to Support is not a ceremonial transfer of responsibility.

Use ${link("handoff", "the handoff guide")} for open promises and ${link("security", "the security route")} for a suspected exposure. Hooli's response should have one current account of the facts, even if the meeting about it requires several triangles.`,
      ],
    ],
    [
      [
        "The cause is unknown and investigation continues. Which update is best?",
        [
          "It is fixed and will never recur",
          "We are investigating the retrieval failure and will update you by 1:00 PT",
          "Engineering has it, so there is nothing to report",
        ],
        1,
        "State known impact and the next update without inventing a cause or fix.",
      ],
      [
        "Which two items belong in the first escalation? Select all that apply.",
        [
          "Observed impact and start time",
          "An unsupported theory presented as the cause",
          "A named communication coordinator and next update",
        ],
        [0, 2],
        "Responders need facts and the customer needs clear communication ownership.",
      ],
    ],
  ),

  course(
    12,
    "Speaking About Hooli Products",
    "Sell What Exists",
    "Translate the product story into a claim the buyer, the SE and the release notes can all recognize.",
    product,
    [
      [
        "Start with the customer's need",
        `Ask which workflow is slow, costly or unreliable and how the customer would measure improvement. Explain the relevant current capability in that context. Lead with the buyer's problem before explaining the strategic importance of the signature on the Box.

A useful product conversation may cover supported configuration, evaluation and operations. It does not require a complete history of Gavin and Richard's relationship.

Use ${link("box", "the Box guide")} or ${link("compression", "compression guidance")} for preparation. Bring an SE into the technical details; do not treat the absence of an SE as an invitation to invent them.`,
      ],
      [
        "Separate available from announced",
        `A released capability, preview, prototype and keynote statement are different states. Name the one that applies, including any supported context or restrictions.

| State | Useful wording |
| --- | --- |
| Available | We can use this in the stated configuration |
| Preview | We can request an evaluation within the defined scope |
| Planned | Timing is not confirmed |
| Unknown | I will confirm with the Product owner |

Gavin often describes the future with admirable grammatical certainty. Use ${link("availability", "the maintained status")} before adopting the same tense.`,
      ],
      [
        "Put the evidence in the claim",
        `Name the workload and conditions behind performance results. Explain the limitation and a next step. A smaller output in one evaluation does not guarantee a lower bill for every buyer.

If an executive briefing creates an uncertain promise, capture it and confirm with the owner. Correct inaccurate statements promptly rather than waiting for implementation to reinterpret them.

Use ${link("executive", "the executive briefing guide")} and ${link("launch", "the launch playbook")}. A customer should leave knowing what happens next. “The future” is an acceptable keynote theme and an inadequate implementation date.`,
      ],
    ],
    [
      [
        "A feature appeared in a keynote but its availability is unconfirmed. What should you say?",
        [
          "It is generally available",
          "I will confirm supported availability with Product before committing",
          "It will ship whenever the buyer signs",
        ],
        1,
        "An announcement does not establish supported availability or timing.",
      ],
      [
        "Which performance statement is useful?",
        [
          "It wins every benchmark",
          "The signature makes it faster",
          "In this test and configuration output size improved; let's evaluate your workload",
        ],
        2,
        "The statement preserves conditions and offers a next step relevant to the customer.",
      ],
    ],
  ),

  course(
    13,
    "Competitive Selling: When They Mention Pied Piper",
    "Yes, Their Demo Was Good",
    "Build a useful comparison instead of asking the buyer to share our feelings about Richard.",
    product,
    [
      [
        "Diagnose the comparison",
        `When a buyer mentions Pied Piper, establish which product and requirement they mean. They may be evaluating compression, a network model or simply a video somebody forwarded.

Ask who is evaluating, which workload matters and what criteria will decide. Include the current system and no decision as alternatives. They close more deals than their nonexistent booths would suggest.

Read ${link("landscape", "the company landscape")}. Raviga and Bream Hall are investors, not compression products. Aviato is not a new-internet vendor merely because Erlich pronounces it with conviction.`,
      ],
      [
        "Use the battlecard as preparation",
        `Learn why the competitor attracts buyers, which questions reveal fit and what evidence supports our response. A battlecard should improve discovery, not supply insults for a call.

| Avoid | Do instead |
| --- | --- |
| They are too small | Ask about support and operation requirements |
| We can acquire them | Discuss the product available to the buyer |
| Their benchmark is irrelevant | Agree on representative test conditions |

Use ${link("piedPiper", "Pied Piper")} or ${link("yaoNet", "YaoNet")} guidance. Remember ${link("endframe", "Endframe's acquisition")} before treating an old competitor slide as timeless truth.`,
      ],
      [
        "Run the evaluation and learn",
        `Agree on criteria, owners and dates with the buyer and SE. Preserve both favorable and unfavorable results. Explain gaps honestly and ask whether another requirement changes the decision.

If we lose, record whether the reason was capability, commercial fit, process or no decision. Capture the source and next learning. A missing follow-up should not become a product weakness because that makes the debrief less personal.

Competitive receives intelligence; Product receives technical findings; the account manager receives the lesson about returning calls. Gavin may request all three, but the routing still matters.`,
      ],
    ],
    [
      [
        "A buyer praises Pied Piper's benchmark. What is the best next step?",
        [
          "Ask about their workload and agree on a representative comparison",
          "Say Richard cannot support enterprise buyers",
          "Offer an immediate discount without understanding the test",
        ],
        0,
        "Understand the criterion and establish a fair evaluation before choosing a response.",
      ],
      [
        "Which entries are useful competitive intelligence? Select all that apply.",
        [
          "The buyer's actual alternative and the criterion it addresses",
          "A rumor presented as a confirmed release",
          "A dated source and its effect on the account decision",
        ],
        [0, 2],
        "Intelligence needs a source, context and an implication. Rumor should be labeled and verified.",
      ],
    ],
  ),

  course(
    14,
    "Pricing and Negotiation at Hooli",
    "Protect the Commas",
    "Find the commercial blocker, exchange value and request approval before announcing that you have it.",
    sales,
    [
      [
        "Understand the economics",
        `A price objection may concern budget, value, scope, payment timing or a procurement ritual. Ask which issue remains and what would happen if you resolved it.

Compare the same scope and term. Include free periods, services and payment changes in the review. Sliceline's growth story is a useful reminder that an enthusiastic transaction can still lose money.

Use ${link("finance", "the finance guide")} to distinguish contract value, recurring value and cash. A large number is not automatically ARR, and a signed agreement is not automatically your next commission payment.`,
      ],
      [
        "Trade concessions",
        `Ask what the customer can commit to in exchange for a concession: a defined scope, annual prepayment, a longer term or an agreed purchasing step. Avoid a permanent reduction in exchange for general excitement.

> “If we agree on annual prepayment and the scope we reviewed, I can request approval for this price.”

Do not remove “request.” Finance notices the difference immediately.

Record the proposed exchange and check ${link("discount", "the approval matrix")}. Russ Hanneman may measure progress in commas. The quote still needs to explain where each one came from.`,
      ],
      [
        "Submit a decision-ready exception",
        `Include list price, proposed price, discount, scope, term, payment schedule, customer constraint, our return and remaining buying steps. At $120,000 list and $90,000 proposed annual price, the discount is 25% and the annual concession is $30,000.

That request needs Sales director and Finance approval. More than 30% needs Revenue leadership and Finance with a written exception. Changes to terms need review even when the headline percentage looks small.

The end of the quarter justifies a prompt decision. It does not grant a new approval limit. Neither does attending HooliCon with a very expensive badge.`,
      ],
    ],
    [
      [
        "An annual quote falls from $120,000 to $90,000 for unchanged scope. What is the discount?",
        [
          "25%, requiring Sales director and Finance approval",
          "30%, which the AE can approve",
          "It depends on the customer's enthusiasm",
        ],
        0,
        "The $30,000 reduction divided by $120,000 is 25%. Apply the stated approval band.",
      ],
      [
        "What belongs in an exception request? Select all that apply.",
        [
          "Scope, term, price and all concessions",
          "A claim that Gavin nodded in another meeting",
          "The customer's constraint, our return and the buying plan",
        ],
        [0, 2],
        "An approver needs the economics and the proposed agreement. Executive proximity is not approval.",
      ],
    ],
  ),
];
