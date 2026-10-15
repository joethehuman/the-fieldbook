import { article, D, docLink as link, courseLink } from "./shared";

export const demoDocs = [
  article(
    D.firstWeek,
    "Your First Week in Hooli Sales",
    "Find your territory, your tools, and the person who knows why your territory changed.",
    `
Welcome to Hooli. You have joined a company capable of putting a founder's signature on enterprise hardware. Your first week should feel modestly less ambitious.

![A bright shared office workspace](https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1400&q=80)

*Room for a useful conversation. And, inevitably, an alignment meeting.*

## Day one: establish that you exist

Meet your manager, confirm your territory and request your own system access. Your badge opens the building; it does not authorize a discount. These permissions are administered separately, following an incident.

Use ${link("systems", "the systems map")} to find HooliForce, product guidance and the help queue. If your account is missing, submit the system name, your role and the error. Do not borrow a colleague's login. We already have sufficient ambiguity about who owns which account.

## By Wednesday: learn what we sell

Read ${link("availability", "the current product status")}, then ask a Solutions Engineer to explain a recent evaluation. Learn the difference between compression, storage and Gavin's vision for the future. The customer may only have budget for the first two.

Your onboarding learning covers orientation, security and AI. Your sales curriculum adds customer conversations, HooliForce and negotiation. Start with the assigned items in Courses; completion is recorded there. Nobody needs a screenshot of your progress in the team channel.

## By Friday: follow one real deal

| Find out | Leave with |
| --- | --- |
| What the customer needs | Their words, not our campaign slogan |
| Who owns the account | One current name |
| What happens next | An action, owner and date |
| What we promised | Something the product team recognizes |

Sit in on a call, write a draft follow-up and review it with your manager before sending. ${link("discovery", "The first-conversation guide")} will help you ask useful questions without narrating the entire Hooli origin story.

Nelson Bighetti's career demonstrates that job titles can move quickly here. For now, focus on knowing your customer, finding the right colleague and keeping your commitments. Head Dreamer is not an entry in the sales career framework.`,
  ),

  article(
    D.systems,
    "Finding the System That Contains the Other System",
    "A map of Hooli's working tools, including the tool used to explain the tools.",
    `
Hooli has an application for nearly every task. Some were built internally. Some arrived through acquisitions. A few are still learning that the acquisition happened.

Start with the work you need to do, rather than whichever tab has the most notifications.

## The useful map

| Task | Starting point | Owner |
| --- | --- | --- |
| Accounts, opportunities, next steps | HooliForce | Revenue Operations |
| Product availability and positioning | Products & Launches in Hoolibook | Product Marketing |
| Competitive preparation | Competitive Intelligence in Hoolibook | Competitive team |
| Quote or discount exception | Deal Desk queue | Revenue Operations and Finance |
| Technical evaluation | Account's Solutions Engineer | Solutions Engineering |
| Access problem | IT help queue | IT |
| Customer incident | Support case, marked for escalation | Support |

Hoolibook holds the guidance. HooliForce holds the customer record. Copying this guide into an opportunity note does not create a more powerful source of truth.

## Request access once, with context

Include your role, the system, the action you need to take and the error you see. Your manager confirms the business need; the system owner grants access to your account. Attach a cropped screenshot when it helps. Passwords are not useful attachments.

If you find a tool named after Endframe, ask its owner whether it is still in use before creating an account. An old logo is not evidence of a new competitor inside the building.

## When two sources disagree

For an opportunity, use HooliForce and check with the account owner. For product behavior, use ${link("availability", "the product status guide")} and its Product owner. For pricing, use the approved quote and ${link("discount", "discounting rules")}.

Send the conflicting links to the relevant owner and ask for a correction. Please do not create a comparison spreadsheet called Final Truth. There are already two, and they disagree.`,
  ),

  article(
    D.crm,
    "Using HooliForce CRM",
    "Keep the account record useful enough that a colleague can survive your vacation.",
    `
HooliForce is where we record the customer's situation, our commitments and the next action. It is also where optimism becomes visible to Finance, so choose your words with care.

## Find the account first

Search by company name and domain before creating a record. Aviato, AVIATO and Erlich's Airline Thing should not become three accounts. If you find duplicates, ask Revenue Operations to merge them; do not create a fourth as a neutral meeting ground.

Confirm the owner, relevant contacts and current opportunity. Record only the business context the account team needs.

## Move stages when the customer moves

| Stage | Evidence required |
| --- | --- |
| Discovery | Customer problem and a relevant contact |
| Evaluation | Agreed scope, success criteria and evaluator |
| Commercial | Reviewed scope, buying process and commercial discussion |
| Commit | Customer-backed decision plan, remaining steps and credible date |
| Closed Won | Executed agreement accepted by Deal Desk |

A good meeting does not automatically move a deal. A meeting with Gavin does not move it twice.

## Write the next useful note

**Useful:** “Buyer needs a compression evaluation on archived video. SE will confirm supported test conditions Tuesday; buyer will nominate the evaluator.”

**Less useful:** “Amazing energy. Richard is worried. Huge.”

Keep customer statements separate from your interpretation. Add an owner and date to the next action. Update stale information instead of stacking a contradictory note on top and hoping the newest enthusiasm wins.

## Leave something a colleague can use

Link the evaluation, quote and decision plan. Store restricted files in their approved location and link them rather than copying the contents into notes. See ${link("data", "customer data handling")}.

Before the forecast call, review ${link("forecast", "the forecast definitions")}. Before handing over a signed deal, use ${link("handoff", "the customer handoff")}. HooliForce cannot prevent a surprise, but it can establish when somebody first wrote it down.`,
  ),

  article(
    D.discovery,
    "Your First Customer Conversation",
    "Learn why the buyer took the meeting before explaining why Hooli should own the category.",
    `
The first call should establish whether a useful next step exists. It is not an audition for Gavin's keynote, even if you have learned where he pauses for applause.

## Prepare a hypothesis, not a conclusion

Review the account, attendees and any prior notes. Know the current product and one relevant use case. Write down what you think the customer needs, then be prepared to discover that they accepted the invitation for a different reason.

If Pied Piper appears in the notes, read ${link("piedPiper", "the battlecard")}. Resist opening with a comment about their office size. A compression algorithm does not require a campus.

## Ask about the work

- What are you trying to change?
- How does that happen today?
- Where is the cost, delay or frustration?
- Who would evaluate a replacement?
- What would make an evaluation worth doing?

Follow the answer. If they say storage cost, learn what drives it. If they say reliability, ask what has failed. If they say “my manager likes Gavin,” establish whether the manager also owns a budget.

## Offer one relevant connection

Summarize the problem in their language. Explain which current Hooli capability may help, what you would need to verify and who can help verify it. ${link("availability", "The product status guide")} separates released behavior from announced ambition.

Do not turn a discovery call into a live experiment on customer data. Arrange a scoped evaluation with Solutions Engineering and agreed test inputs.

## Close with a mutual next step

> “You want to reduce the size of the archive without disrupting retrieval. We'll confirm a supported evaluation on Tuesday. You'll bring the storage lead, and we'll agree how to measure the result.”

Record that in ${link("crm", "HooliForce")}, including the owner and date. If there is no fit, say so. A small honest pipeline is easier to manage than a large collection of people who were simply too polite to leave the call.`,
  ),

  article(
    D.availability,
    "What We Sell, What We Demo, What Gavin Announced",
    "Product status for customer conversations that may eventually be replayed to Product.",
    `
Hooli's portfolio has room for established products, controlled evaluations and ambitious statements made near a large screen. These are different availability states.

## Start with the status

| Item | How to discuss it | Next step |
| --- | --- | --- |
| Hooli Box family | A storage appliance; confirm model, configuration and supported use case | Review the field guide with an SE |
| Compression capability | Discuss the specific implementation and measured workload | Agree on an evaluation |
| Nucleus references | Historical product context, not evidence of current readiness | Use current product material |
| Prototype or preview | Limited to its named evaluation scope | Ask Product about eligibility |
| Something Gavin announced | An announcement until Product confirms availability | Capture the request for Product Marketing |

The signature on a Box is not a compatibility matrix. Find the actual model and configuration in ${link("box", "the Box field guide")}.

## Use an answer the buyer can act on

State the capability, its availability, the evidence and the next step. For example: “We can evaluate this supported workflow with your storage team. We have not measured your archive yet; let's agree on test conditions.”

Avoid promising a percentage improvement because a graph in the keynote had a steep line. The axis labels must survive the transition into the sales deck.

## When the answer is still pending

Record the question, workload, buying impact and requested timing in HooliForce. Ask the Product owner to confirm the answer and give the customer a follow-up date. If that date moves, send an update before it passes.

Gavin may describe the future in the present tense. Account teams should use the tense supported by the release notes.

Before a launch, use ${link("launch", "the launch playbook")}. Before a performance conversation, read ${link("compression", "the compression explanation")}. Before an especially confident performance conversation, read it twice.`,
  ),

  article(
    D.compression,
    "Understanding Middle-out Without Crediting the Competition",
    "The technical explanation is straightforward. The institutional feelings require more care.",
    `
Middle-out is the breakthrough associated with Richard Hendricks and Pied Piper. Hooli's desire for a different origin story does not alter that sentence.

For a customer conversation, explain the user problem first and the method second. A clear problem statement gives a team something stable to work on, even when the positioning changes before lunch.

## The useful explanation

Compression reduces the space needed to represent data. The buyer cares about what that means for their workload: storage, transfer, speed and the ability to recover the information they need. Establish which outcome matters before discussing an algorithm.

The name “middle-out” does not tell you how a particular Hooli product behaves. Ask Solutions Engineering to confirm the implementation, supported configuration and appropriate test. A whiteboard reconstruction of Richard's breakthrough is not a supported customer deliverable.

## Make a comparison worth quoting

| Establish | Why |
| --- | --- |
| Representative input | A tiny convenient file may not resemble the archive |
| Baseline and settings | The comparison needs to compare something identifiable |
| Output size and processing time | One improvement may involve another tradeoff |
| Recovery requirements | Smaller is not sufficient if the workflow breaks |
| Repeatable conditions | The second run should recognize the first |

Have both teams agree on success criteria before running the evaluation. Report the result with the conditions, including where our product did not win. Removing those rows makes a stronger slide and a weaker decision.

## When they mention Pied Piper

Acknowledge the technology and ask which result matters. Use ${link("piedPiper", "the battlecard")} to prepare questions, not to dispute mathematics with brand guidelines.

An appropriate next step might be a scoped comparison with an SE. It is rarely “we'll beat anything they show you.” Nucleus already provided the company with a substantial learning opportunity in this area.`,
  ),

  article(
    D.box,
    "The Hooli Box Field Guide",
    "A storage conversation with room for capacity, operations and a very prominent signature.",
    `
The Hooli Box is a storage appliance. The Gavin Belson Signature Box 3 is also an opportunity to discuss Gavin Belson. Begin with the customer's storage requirements; the second conversation will generally arrange itself.

## Find the workload

Ask what data will be stored, how it is accessed, how quickly it grows and what the existing environment requires. Bring an SE into sizing, compatibility and recovery discussions. A photograph of a Box in a rack is not proof that it belongs in this rack.

| Buyer question | Prepare |
| --- | --- |
| Will it fit our environment? | Confirmed model, interfaces and configuration |
| How much capacity do we need? | Workload and growth assumptions reviewed by an SE |
| What happens during a failure? | Supported recovery and service arrangements |
| What will it cost? | Quote covering hardware, services and the stated term |
| Why is the signature so large? | A brief answer, followed by the workload |

## Explain the product, not the numbering

Customers may ask why the naming moved past Box 2. Keep the discussion on the offered model and its supported capabilities. A lengthy account of leadership transitions rarely improves a storage evaluation.

Do not suggest that a new name guarantees new performance. Use the actual configuration and agreed test. The signature is a brand element, not a compression setting.

## Set up an evaluation

Document the workload, environment, measures of success and owner. Agree on representative data and handling before a file arrives. Confirm what will happen at the end: technical review, commercial discussion or a decision to stop.

For launch positioning and seller actions, read ${link("launch", "the launch playbook")}. For price concessions, use ${link("discount", "Deal Desk guidance")}. Neither document authorizes customizing the founder's signature. That request has its own surprisingly long review path.`,
  ),

  article(
    D.launch,
    "The Hooli Launch Playbook",
    "Get the field ready before the keynote makes everyone else ready on our behalf.",
    `
A launch changes what customers can do and what sellers need to explain. A keynote changes what everyone has heard. Schedule both, and establish which happens first.

Nucleus taught us that a large audience is not a substitute for a completed readiness check. The lesson was expensive enough to deserve a reusable template.

## Start with a field brief

~~~text
What is available:
For which customer and problem:
Availability and restrictions:
Positioning and evidence:
Demo path and fallback:
Pricing and quote changes:
Seller action:
Customer/support owner:
~~~

Product confirms availability. Product Marketing owns the brief and messaging. Solutions Engineering validates the demo. Revenue Operations confirms the quote path. Support receives the known limitations before customers discover them collaboratively.

## Prepare the seller

Give the field one current brief, a short training path, objection handling and links to maintained Docs. Publish an Update that states what changed and what sellers must do. A folder containing seventeen decks is not launch readiness; it is a scavenger hunt with commission implications.

Use ${courseLink(3, "How to Democratize Anything")} for positioning and ${courseLink(12, "Speaking About Hooli Products")} for availability claims. The launch curriculum brings the preparation together.

## Rehearse the actual path

Run the customer scenario in the intended environment. Check accounts, sample data, network needs and the handoff between presenters. Keep a prepared fallback and name who can stop the demonstration. HooliCon branding does not improve wireless capacity.

| Before launch | Owner must confirm |
| --- | --- |
| Product | Supported behavior and remaining limits |
| SE | Rehearsed demo and fallback |
| Sales Operations | Quote and approval routes |
| Support | Intake, escalation and customer communication |

## Close the loop

After launch, collect actual questions, evaluation results and lost deals. Update the brief and reference articles together. If the field cannot explain the release, another victory animation is unlikely to resolve it.

Gavin gets the closing remarks. The customer gets a working next step.`,
  ),

  article(
    D.discount,
    "Discounting Without Disrupting Our Margin",
    "A concession needs a reason, an approver and something more durable than quarter-end energy.",
    `
Hooli pricing reflects the value of our products, the cost of supporting our customers, and several meetings that Finance would prefer not to repeat.

Discounts are available when they help secure a sound agreement. They are not a standard courtesy extended to anyone who asks whether we can “do better.”

## Before you offer a number

Find out what is preventing the purchase.

A budget limit, a timing issue, an uncertain business case, and a procurement team completing its traditional final lap are different problems. A lower price will not reliably solve all four.

Ask what needs to change, whether price is the remaining issue, what scope and term the customer will commit to, who approves the purchase and what happens next if we agree.

“We would be very excited” is encouraging. It is not a signature date.

## Who approves what

Calculate the discount against the current list price for the same scope and term.

| Discount | Approval required |
| --- | --- |
| Up to 10% | Account executive, using standard terms |
| More than 10%, up to 20% | Sales director |
| More than 20%, up to 30% | Sales director and Finance |
| More than 30% | Revenue leadership and Finance, with a written exception |

Changes to payment terms, free periods, services, or contractual commitments need their own review. Moving a concession into another column does not make it disappear.

Jack Barker's triangles explain many things. They do not increase your approval limit.

## Trade something; do not just subtract something

A concession should support a specific agreement. Depending on the deal, that might mean annual prepayment, a longer commitment, or a clearly defined purchasing timeline. Avoid trading a permanent price reduction for a general sense of momentum.

> “If we can agree on annual prepayment and the scope we reviewed, I can request approval for this price.”

Do not say the price is approved while requesting approval. Finance notices this tense change immediately.

## Submit an exception someone can decide on

Include list and proposed price, total discount, scope, term, payment terms, the customer's constraint, what Hooli receives, competitive evidence, decision-maker and remaining steps.

For a $120,000 annual agreement, a proposed price of $90,000 is a 25% discount. Describe the $30,000 concession plainly. “Strategic investment in logo visibility” can go in the rationale, where Finance can disagree with it.

## Things that do not count as approval

- Gavin nodded during a different conversation.
- The customer is attending HooliCon.
- The opportunity has been marked Commit.
- You already sent the quote.
- The quarter ends tomorrow.

Quarter-end urgency changes how quickly we should review a request. It does not change the arithmetic.

The Three Comma Club remains an aspiration. Please do not fund it entirely through concessions.

Practice the conversation in ${courseLink(14, "Pricing and Negotiation at Hooli")}.`,
  ),

  article(
    D.fields,
    "HooliForce FAQ: Is This Field Required?",
    "Usually for a reason. Occasionally because someone once asked Gavin a question.",
    `
HooliForce contains fields that support customer work, fields that support reporting, and a field called Strategic Resonance that Revenue Operations is still negotiating to remove.

This FAQ explains how to complete the record without inventing a more cooperative customer.

## The form requires a value I do not know

Use the defined Unknown value where available. If the field has no honest answer, send Revenue Operations the field name, opportunity and blocked action. Do not enter a colleague's birthday as the close date.

Account owner, stage evidence and next action are required because somebody has to do the next thing. “Executive interest” does not replace these fields, even when the executive is Gavin.

## Is the close date a promise?

It is the current supported estimate of the purchasing milestone. Record what supports it and update it when the buying process changes. Follow ${link("forecast", "the forecast definitions")} rather than moving every open deal to the final day of the quarter. That date has already accepted enough responsibility.

## Why do we need both stage and forecast category?

Stage describes where the deal is. Forecast category describes how confidently we expect it to close in the period. A technical evaluation can be progressing well without belonging in Commit. The two fields are allowed to disagree politely.

## Can I skip the competitor field?

Record the actual alternative: a named vendor, the current system or no decision. Do not select Pied Piper merely because you dislike the account. Use ${link("landscape", "the landscape guide")} if a name is unfamiliar.

## Can we remove a field?

Yes. Submit its purpose, who uses the output, what breaks today and a sanitized example. Revenue Operations will check downstream uses before changing it.

You may not rename an unwanted field “Gavin's Vision” to discourage further questions. We tried that with Strategic Resonance. It became mandatory.`,
  ),

  article(
    D.forecast,
    "Forecasting: Commit Is Not a Feeling",
    "A shared language for numbers that will be discussed with increasing volume.",
    `
The forecast is our current view of what will close in the period. It should change when the evidence changes. It should not change because the meeting now includes a more senior person.

Russ Hanneman's relationship with his third comma is a useful reminder that numbers can move in both directions. Please allow the forecast the same freedom.

## Use the categories consistently

| Category | What belongs here |
| --- | --- |
| Pipeline | Qualified opportunity without a supported path to close this period |
| Upside | A plausible path exists; named steps or decisions remain uncertain |
| Commit | Customer-backed decision plan, credible date and understood remaining steps |
| Closed Won | Executed agreement accepted by Deal Desk |

An encouraging champion is not necessarily the economic buyer. A verbal yes is not necessarily completed procurement. A scheduled call is not necessarily progress if its purpose is to schedule the next call.

## Bring the decision plan

Before the review, confirm the buyer, scope, decision process, security and legal steps, commercial approval and signature path. Put an owner and date against each open item. Identify the fact that could move the deal out of the period.

> “Upside: technical review is complete; procurement has not accepted the proposed timeline. Buyer will confirm on Thursday.”

This is more useful than “Commit: Gavin has a good feeling.” Gavin's feelings are tracked in a different initiative.

## When a deal slips

Update HooliForce, explain which assumption changed and agree on a new next step. Keep the account history. Do not create a fresh opportunity to give an old delay a more youthful appearance.

Managers should ask what evidence is missing and how they can help obtain it. Asking the same question more firmly does not count as additional coverage.

For commercial blockers, use ${link("discount", "the discounting guide")}. For inconsistent amounts, read ${link("finance", "the finance guide")}. For a desire to replace the categories with colors, contact Revenue Operations before ordering the dashboard.`,
  ),

  article(
    D.finance,
    "Finance for People Who Say ARR a Lot",
    "Bookings, recurring revenue, cash and commission may refer to the same deal. They are still different numbers.",
    `
Finance welcomes commercial ambition. It also requests that we stop calling every amount on a slide ARR.

Sliceline's pizza operation demonstrated that growth can be energetic without improving the underlying economics. We would prefer to discover that distinction before ordering the celebration catering.

## Follow one agreement

Consider a three-year agreement with $90,000 of recurring subscription charges per year and a separate $10,000 implementation fee. Assume no other adjustments for this example.

| Term | What it means in this example |
| --- | --- |
| Contract value | $280,000 across the stated term, including implementation |
| ARR | $90,000 of annualized recurring subscription value |
| Invoice | The amount billed according to the payment schedule |
| Cash | What the customer has actually paid |
| Recognized revenue | What Finance records under the applicable accounting treatment |
| Commission | What the compensation plan credits and pays |

The implementation fee is not recurring simply because we would enjoy receiving it again. An executed agreement does not mean the full contract value is recognized as revenue immediately. Let Finance own that schedule.

## Check the economics before the quote

Calculate concessions across the same scope and term. Include free periods, services and payment changes in the review. A lower hardware price plus additional free services is not two separate acts of generosity with no combined cost.

Use ${link("discount", "the approval matrix")} and make the proposed exchange explicit. If the business case depends on expansion, label expansion as an assumption until it is contracted.

## About your commission

Check the compensation plan and accepted booking record. Eligibility, credit splits, payment timing and adjustments come from that plan. Do not derive your payout from the largest number visible in HooliForce.

Send discrepancies to Sales Compensation with the deal ID, plan period and calculation you expected. Russ measures success in commas. Payroll requires a little more supporting detail.`,
  ),

  article(
    D.handoff,
    "Closed Won. Now Tell Customer Success.",
    "The signature ends the buying process. It does not upload your memory into the implementation team.",
    `
A Closed Won deal needs a handoff before the customer has to explain what Sales promised. This is especially important when Sales used the word seamless.

The account executive coordinates the transfer. Customer Success accepts ownership of adoption; the implementation lead accepts the delivery scope. Solutions Engineering supplies the technical context. Each person needs to know what they own before the kickoff invitation goes out.

## Send the useful version

~~~text
Customer outcome and success measure:
Purchased scope and signed agreement:
Stakeholders, champion and decision-maker:
Promised dates and dependencies:
Evaluation results and technical constraints:
Open commitments, owner and due date:
First customer milestone:
~~~

Link the approved records rather than attaching a new local copy called Final Final. Include the quote, agreement and evaluation. See ${link("data", "customer data handling")} for restricted material.

## An example worth handing over

**Customer:** a games studio preparing an archive migration. **Goal:** reduce storage pressure while preserving retrieval requirements. **Open item:** SE has not validated one file format. **Promise:** the team will confirm support before the customer schedules migration. **Owner:** SE, with a customer update due Thursday.

“They're a lot like K-Hole” can help establish industry context. It does not describe a file format, an acceptance criterion or a delivery commitment.

## Resolve the surprise together

If the signed scope and the customer's expectation differ, surface the gap before kickoff. Sales stays involved in correcting its commitments. Customer Success should not have to discover that “included” was being used aspirationally.

Confirm ownership in HooliForce and hold a short handoff conversation for material risks. Then introduce the customer to the actual team and explain the next milestone.

Jack Barker's triangles make Sales and Engineering look adjacent. A good handoff gives them something to say to each other.`,
  ),

  article(
    D.landscape,
    "The Competitive Landscape, According to Hooli",
    "Know whether the logo belongs to a rival, an investor, a customer or a very successful T-shirt.",
    `
Not every company Gavin dislikes competes with the product you are selling. Establish what the buyer is comparing before requesting a new red column in the competitive matrix.

## Who is who

| Name | Place in the landscape | Field use |
| --- | --- | --- |
| Pied Piper / PiperNet | Compression technology and decentralized-network ambitions | Confirm the specific product and evaluation |
| YaoNet | A rival network initiative tied to Yao | Ask about architecture, operation and control |
| Endframe | Former compression rival acquired by Hooli | Use the acquisition context, not an old attack slide |
| Raviga / Bream Hall | Venture investors | Account and funding context, not product comparison |
| K-Hole Games | Games company associated with the PiperNet ecosystem | Workload and ecosystem context |
| Sliceline / Optimoji | Startup and acquisition history | Growth-economics and integration examples |
| Aviato | Erlich's airline-booking venture | Background context; occasionally apparel |

The current system and no decision also compete. Neither has a booth at HooliCon, which may explain why we keep underestimating them.

## Capture something useful

Record the alternative, the source, the customer requirement it addresses and where the information changes our next action. A customer statement is not the same as a published feature; a rumor from an investor is not a release note.

Use ${link("piedPiper", "Pied Piper")} and ${link("yaoNet", "YaoNet")} battlecards for questions and response planning. ${link("endframe", "The Endframe history")} explains why a familiar logo may now appear on our side of the diagram.

## Send intelligence, not folklore

Send Competitive the source link or sanitized call note, the date, the claim and its buying impact. Explain what needs checking. Do not attach a recording without the required permission.

If a battlecard is wrong, report the line and supporting evidence. If it merely makes us less comfortable, it may be working correctly.

Our objective is to help the buyer compare real choices. Collecting every Silicon Valley logo in one slide remains Marketing's separate and surprisingly well-funded hobby.`,
  ),

  article(
    D.piedPiper,
    "Pied Piper: Small Company, Inconvenient Algorithm",
    "Take the technology seriously. Keep the institutional feelings out of the evaluation.",
    `
Pied Piper is a compression company, a new internet company, or a reminder that the account plan needs updating. Confirm which conversation you are having before opening the deck.

Their technology deserves serious attention. Their ability to make Gavin visibly uncomfortable is well established, but is not a useful qualification criterion.

## Why customers consider them

Pied Piper has a compelling technical story built around middle-out compression. Technical buyers may be interested in efficiency, performance, or an alternative to buying another box from a company that already occupies several rows of their procurement spreadsheet.

Do not assume a small team means a weak competitor. Richard Hendricks has repeatedly demonstrated that an uncomfortable presentation can contain a very good algorithm.

## What to learn before responding

Ask whether the customer is comparing compression performance, infrastructure costs or a broader platform. Establish the workload, the measurements, the evaluator and the operational requirements.

Is Pied Piper running an evaluation, or did someone forward a particularly impressive video? Record the answer in HooliForce. “They like the algorithm” is useful context. “Richard seems nervous” is not a competitive strategy.

## Where to take the conversation

| If the customer says… | Try this |
| --- | --- |
| “Their benchmark is better.” | “Let's understand the workload and agree on a comparison using your requirements.” |
| “They're more innovative.” | “Which capability would change the outcome for your team?” |
| “You're a much larger company.” | “Which implementation, support and vendor-management requirements matter to your decision?” |
| “Didn't Nucleus have that livestream problem?” | Acknowledge it. Return to the current product and available evidence. Do not suggest their Wi-Fi was responsible. |

Hooli's existing footprint, support arrangements and purchasing relationships may matter. Establish whether they matter to this buyer. Company size is not a substitute for winning the technical evaluation, although it does make our booth easier to find.

## Claims to leave out of the call

**“Middle-out is basically ours.”** It is not an approved response to an inconvenient origin story.

**“They won't be around next year.”** We have made this prediction before. It has not improved with repetition.

**“We can acquire them.”** Acquisition is not a feature available on the customer's current plan.

## The next move

Agree on the evaluation criteria, bring in Solutions Engineering and document the result—including where Pied Piper performs well.

If we lose a technical comparison, send the findings to Product. If we lose because nobody followed up for eleven days, send them to the sales manager.

Please keep these two reports separate. Engineering has asked.

Continue with ${courseLink(13, "Competitive Selling")} or ${link("compression", "the compression guide")}.`,
  ),

  article(
    D.yaoNet,
    "YaoNet: Another New Internet",
    "Ask who operates the network before debating who owns the future.",
    `
YaoNet belongs in conversations about competing network initiatives, control and operation. It is not a synonym for every unfamiliar vendor in a regional deal.

Yao's involvement in the struggle around PiperNet demonstrated that a network's growth and its control can become the same conversation. Learn the customer's requirements before adopting either side's grand theory of the internet.

## Qualify the comparison

Ask what the buyer has actually been offered, which organization operates it and which capability they plan to evaluate. Confirm whether they are discussing a network, infrastructure, software or a proposed partnership.

| Learn | Ask |
| --- | --- |
| Operation | Who runs the service and resolves incidents? |
| Control | Who can change participation or operating rules? |
| Fit | Which workload and deployment model are in scope? |
| Support | What commitment is written into the offer? |
| Evidence | What can be tested in the customer's environment? |

Use these questions with Hooli too. A large logo does not explain a dependency.

## Respond without inventing a weakness

If we lack a verified specification, say what we need to check. Do not improvise security findings, regional availability or commercial terms. Send the source material to Competitive and Product for review.

> “Let's compare the proposed operating model and support commitments against your requirements, then agree on a test of the workload.”

This is less dramatic than declaring a battle for the internet. It is also more likely to produce an evaluation plan.

## Keep the account map current

Investors, infrastructure partners and product suppliers can have different interests. Record the relevant relationship and its effect on the decision. A handshake in a different deal is not a durable architecture diagram; Gavin has supplied several demonstrations.

Close with the next fact to verify, its owner and a date. Use ${link("landscape", "the landscape guide")} for company context and ${link("availability", "current Hooli availability")} for our side of the comparison.`,
  ),

  article(
    D.endframe,
    "Endframe: From Competitive Threat to Strategic Capability",
    "An acquisition changes the account narrative faster than it changes the slide archive.",
    `
Endframe competed in compression before Hooli acquired it. That makes it part of our product history, not a permanent independent rival to select whenever a deal becomes awkward.

The acquisition also means some remarkably confident old comparisons now describe colleagues. Please update your slides before the joint customer call.

## Retire the old argument

Remove material that presents Endframe as an independent current competitor. Do not replace every negative adjective with “strategic” and consider the review complete. Product Marketing must confirm how acquired capabilities map to the product being offered.

| Old claim | Better next step |
| --- | --- |
| “Endframe cannot scale.” | Verify the current implementation and supported configuration |
| “Their team lacks experience.” | Meet the colleagues now supporting the account |
| “We have no dependency on them.” | Confirm the actual product architecture |
| “The acquisition solved everything.” | Ask which integration work is complete |

## Describe the current product

A buyer needs to know what they can buy, how it works in their environment and who supports it. The acquisition announcement establishes ownership; it does not establish that every capability appears in every Hooli offer.

Use ${link("availability", "the availability guide")} and bring an SE into detailed questions. Keep pricing tied to the approved quote rather than the amount paid for the company. Those are different purchasing processes, despite the shared enthusiasm for negotiation.

## Carry the learning forward

Endframe's history is a reminder to evaluate a competitor's capability on evidence. A smaller organization may have something valuable. If our first response is disbelief, arrange the test before arranging the all-hands.

Send outdated material to Competitive with its location and the claim that needs review. The team can correct the shared source instead of letting six sellers perform six quiet rewrites.

We welcome our acquired colleagues. We particularly welcome them when they point out which customer-facing diagrams still label their work a threat.`,
  ),

  article(
    D.security,
    "Security Basics: Don’t Paste That Here",
    "Protect the account, verify the request and report the mistake before it becomes an all-hands example.",
    `
An urgent message from Gavin may be a real urgent message from Gavin. That does not make it an approved way to request your password.

Revenue teams handle customer contacts, pricing, evaluation data and agreements. Protect those records with the same attention you give the account plan, including on the last day of the quarter.

## Verify the request

Use your own account, the company password manager and required multifactor authentication. Check unexpected requests through a separate known contact route. Do not approve a login prompt merely because it is interrupting a demo.

If somebody claims to be Gavin and asks for gift cards, contact IT. If somebody claims to be Gavin and requests a larger photograph of Gavin, verify that too. The second request is plausible enough to be effective.

## Prepare a clean demonstration

Use sample records, close unrelated tabs and check the account shown on screen. Keep credentials out of slides, chat and notes. Ask an SE for the right evaluation environment rather than improvising with a customer's live workspace.

HooliCon taught us that a room full of devices can make a technical problem highly visible. “It's only a demo” is not an access-control strategy.

## Report promptly

If you send a file to the wrong recipient, expose a credential or lose a device, contact the Security queue immediately. Include what happened, when, which account or system is involved and the relevant case link. Do not include the exposed password in the report.

Preserve the original message and follow responder instructions. Security owns investigation and containment. The account owner coordinates customer communication with the response team; a speculative apology to every contact in HooliForce will not help.

Complete ${courseLink(10, "the security refresher")} and read ${link("data", "customer data handling")} before your next evaluation. Early reporting is useful. Quietly hoping nobody noticed is a process we have decided not to scale.`,
  ),

  article(
    D.data,
    "Customer Data: Fewer Copies, Fewer Problems",
    "A representative test does not require the customer's entire company in your Downloads folder.",
    `
Request only the information needed to qualify or evaluate the use case. The phrase “send us a sample” should describe an agreed sample, its purpose and its destination.

Pied Piper's compression ambitions do not excuse us from managing the uncompressed customer list somebody just attached to an email.

## Agree before collecting

An SE should define the test inputs and confirm whether synthetic or sanitized data is sufficient. The account owner confirms the permitted transfer and recipient. If restricted data is necessary, involve Security before it moves.

| Record | Keep it here |
| --- | --- |
| Business contacts and next steps | HooliForce |
| Signed agreement and approved quote | Restricted deal workspace |
| Evaluation files | Agreed evaluation storage with named access |
| Customer credentials | Do not request or store them in sales notes |
| Notes about Gavin's reaction | Usually nowhere useful |

## Link the source

Use the approved location and share links with the intended audience. Check access and recipients before sending. Do not make a private file public because the customer cannot open it; fix the access with the owner.

Avoid copying support logs into a deck, a chat thread and an AI prompt. Three copies do not constitute backup planning. See ${link("ai", "AI guidance")} before using generated summaries.

## Finish the evaluation properly

Confirm the results, record the business decision and ask the data owner to apply the agreed retention or removal schedule. Keep the durable summary in the account record without retaining unnecessary source files.

If data reaches the wrong destination, follow ${link("security", "the incident route")} promptly. Tell responders where it went and when. They will coordinate the response; do not attempt an independent investigation from your hotel Wi-Fi.

Hooli sells ways to manage information. The account team should not become a parallel storage product.`,
  ),

  article(
    D.ai,
    "Responsible AI, Pending Review",
    "Draft faster. Verify at the speed the facts require.",
    `
Hooli supports the use of approved AI tools for appropriate work. The review committee would like everyone to distinguish this sentence from “paste the entire opportunity history into whichever tab is open.”

Gavin's Tethics initiative demonstrated that a well-designed pledge can attract considerable attention. Our review requires the actual output as well.

## Choose the task and the input

Use the approved sales-assist workspace for general drafting with public product material and synthetic examples. Customer records, restricted documents and credentials stay out unless the tool and use have been explicitly cleared by Security.

Ask the tool to propose an outline, improve a sentence or organize approved information. Do not ask it to turn an unknown feature into an objection-handling answer. It will often accept the assignment with alarming enthusiasm.

## Check before the customer sees it

| Check | Example |
| --- | --- |
| Product availability | Does the feature exist in the offered configuration? |
| Evidence | Can the benchmark be traced to an approved source? |
| Customer context | Did the buyer actually say this? |
| Price and dates | Do the numbers match the quote and decision plan? |
| Citations | Does the linked source support the sentence? |

A paragraph that sounds like Gavin may still be wrong. Similarity is not validation.

## Own the result

The seller sharing the work is responsible for checking it. Correct a false claim before sending; if it already reached the customer, correct it with the account team promptly. Use ${link("availability", "current product guidance")} as the source.

For suspected exposure, stop the task and use ${link("security", "the security route")}. For an uncertain tool, ask the review committee with the use case and data type. Committee approval of a logo does not imply approval of data processing.

Practice with ${courseLink(9, "Responsible AI, Pending Review")}. The course is available now. The committee's naming decision remains open.`,
  ),

  article(
    D.values,
    "Our Values: The Conjoined Triangles of Success",
    "A practical interpretation of a framework whose geometry has already received executive approval.",
    `
Jack Barker's Conjoined Triangles of Success bring Engineering and Manufacturing together with Sales and Growth through compromise.

Hooli has adopted the framework's most useful implication: the people selling the product and the people building it should speak before either group makes a commitment on the other's behalf.

The framed diagram remains available in several executive offices. This page explains what to do when it is not within pointing distance.

## Make something useful

Start with the customer problem and a capability we can deliver. Sales supplies the use case, buying context and evaluation criteria. Engineering supplies the supported behavior and constraints. Neither group can substitute a rectangle labeled Synergy for the missing information.

## Compromise with the facts present

| Situation | Useful compromise |
| --- | --- |
| Customer needs an unsupported feature | Explore a supported alternative and record the gap |
| Launch date is under pressure | Agree on available scope and name what will follow |
| Deal needs a concession | Trade defined value through Deal Desk |
| Evaluation exposes a weakness | Share the result and plan the next decision |

Compromise does not mean an SE promises something unreliable so the opportunity stays green. The shared hypotenuse has limits.

## Own the next step

Hooli values clear ownership, useful evidence and follow-through. A cross-functional meeting should end with a decision or a named question, owner and date. If it ends with everyone feeling aligned but nobody doing anything, revisit ${link("meetings", "the meeting guide")}.

## Let the behavior carry the slogan

We do not need a new values campaign every time we encounter a difficult tradeoff. We need the people involved to explain the choice and keep their commitments.

Gavin may still commission the campaign. If asked to participate, bring a specific customer example. It will give the creative team something to place beneath the triangles.`,
  ),

  article(
    D.coaching,
    "Sales Coaching Without Another Dashboard",
    "Review the work, identify one change and resist assigning a score to the person's entire existence.",
    `
A dashboard can tell you a deal is stalled. It cannot tell you whether the seller misunderstood the buyer, missed a handoff or is waiting for an answer from the person reviewing the dashboard.

Monica and Gilfoyle found common ground in their dislike of a management scoring system. We can avoid a similar alliance by making coaching useful before making it measurable.

## Bring one observable example

Choose a call, follow-up or opportunity. Agree on what to review and use a recording only where it is permitted. Ask the seller what they intended and where they want help.

> “The buyer asked about implementation timing. We moved to pricing before confirming their dependency. What did you hear in that part of the call?”

This opening gives you a conversation. “You need more executive presence” gives you an unresolved phrase and, eventually, a training request.

## Coach the decision

Look at the question asked, the evidence gathered and the next action. Separate skill gaps from system problems. If pricing approval has been waiting four days, practicing objection handling may not be the intervention the seller needs.

| Observation | Coaching question |
| --- | --- |
| No identified decision-maker | How will we learn who approves this? |
| Unsupported product promise | What source should we use to correct it? |
| No next step | What would both sides find useful? |
| Repeated slip | Which assumption needs to change? |

## Agree on one experiment

Choose a change the seller can try, the support they need and a date to review it. Record the agreement privately. Recognize the improved behavior when it appears; do not wait until it changes the quarterly chart.

Use ${courseLink(5, "the candor refresher")} for feedback and ${link("forecast", "the forecast guide")} for deal evidence. Your role is to improve the work, not to introduce a new employee pulse metric called Coachability Velocity.`,
  ),

  article(
    D.meetings,
    "Meetings and Decision Notes",
    "A meeting has a purpose. Recurrence is a calendar setting.",
    `
Hooli meetings range from short deal reviews to executive presentations requiring an animal metaphor. Both should leave the audience able to identify what happens next.

Gavin's zoological comparisons are not a standing invitation to bring an animal to the customer briefing. Facilities has asked us to put that in writing.

## Decide whether to meet

Use writing for a status update that requires no discussion. Meet when people need to make a decision, resolve a disagreement or coordinate work. Before inviting anyone, complete the sentence: “When this ends, we will have…”

If the answer is “met,” keep working on the invitation.

## Invite for the decision

Name the owner, question, required context and outcome. Include the people who can decide or materially improve the decision. Send the result to everyone else. Attendance is not a reliable measure of account coverage.

For a deal review, bring the buyer's problem, stage evidence, decision plan, risks and the help needed. Read ${link("forecast", "the forecast definitions")} before asking a room to reinterpret Commit.

## Leave a usable note

~~~text
Decision or recommendation:
Approver:
Action and owner:
Due date:
Open question and next checkpoint:
~~~

Say whether the group decided, recommended or deferred. Agreement among people without approval authority is an input, not approval with a softer font.

## Close the loop

Put customer commitments in HooliForce and durable guidance in its maintained Doc. Link the record in the follow-up. If the decision changes, update the original source so people do not have to reconstruct policy from calendar attachments.

Cancel a recurring meeting when its purpose disappears. You may announce the recovered time as an efficiency initiative if that makes the decision easier to approve.

Gavin's presentation slot requires a separate conversation. Start with his office, not the animal supplier.`,
  ),

  article(
    D.gut,
    "Gavin’s Guide to Gut Health",
    "An executive perspective on personal processing architecture, now distributed to all revenue teams.",
    `
**From the office of Gavin Belson**

**Distribution: All revenue teams**

**Priority: Previously underestimated**

For years, Hooli has focused on what happens inside the data center.

Today, I am asking us to consider a more important center.

The gut.

I arrived at this insight during a leadership offsite, shortly after a working lunch and immediately before rejecting a recommendation from Finance. The feeling was unmistakable. Something inside me knew we were right.

We must learn to scale that feeling.

## Listen to your internal leadership

Your gut is communicating constantly. Most people fail to listen because they are distracted by email, customer objections, or evidence.

Begin each morning with a brief moment of internal alignment. Close your laptop. Sit quietly. Ask yourself:

*What is my body telling me about our market position?*

Write down the answer.

If the answer concerns breakfast, give it another minute. We are looking for strategic signals.

## Establish a single source of truth

At Hooli, we know what happens when information moves through too many disconnected systems. Digestion offers a powerful metaphor, which I have asked the brand team to develop.

Until that work is complete, please use the phrase **personal processing architecture**.

I recognize that some employees will find this terminology unfamiliar. That is how we know we are leading.

## Avoid unnecessary compression

Pied Piper would have you believe that smaller is always better.

I disagree.

Some things should be allowed to occupy the space they deserve: a thoughtful lunch, an ambitious vision, the founder's remarks at the beginning of an otherwise unrelated event.

Do not rush through these moments merely because your calendar contains a customer call.

Have your manager move the call. Explain that you are working on throughput.

## Bring the whole person to the forecast

Sales leadership has asked whether this initiative changes our forecasting requirements.

It does not.

You must still provide a customer-confirmed next step, a credible close date, and evidence for your stage. “Gavin told me to trust my gut” will not satisfy the Commit criteria.

I appreciate that this may appear inconsistent with the opening of this memo. Leadership requires holding several ideas at once. This is why we have an executive team.

## Measuring our progress

The pilot dashboard will include:

| Measure | Intended outcome |
| --- | --- |
| Internal alignment | Fewer conflicting signals |
| Processing confidence | Greater decisiveness after lunch |
| Digestive velocity | Definition pending |
| Executive participation | Already exemplary |

Please do not begin reporting against digestive velocity until Operations has resolved the unit of measurement.

The proposed leaderboard is also on hold. Apparently, some forms of transparency reduce participation.

## A final thought

When I introduced Nucleus, people asked whether the world was ready.

Today, I ask a different question.

Are we ready to look within?

Please reflect on this before Friday's all-hands. I have added forty minutes to the agenda.

**Gavin**`,
  ),

  article(
    D.executive,
    "Requesting an Executive Briefing with Gavin",
    "Bring a customer decision, a prepared team and a slide order that can withstand executive interest.",
    `
An executive briefing should help a customer make a significant decision. It should not be the first moment the account team discovers what decision that is.

Gavin can bring vision, executive attention and an unexpected analogy. The seller remains responsible for the account plan.

## Submit the brief

Send Gavin's office the account, opportunity, customer attendees, business issue and decision you want to advance. Include the deal stage and the help only an executive can provide. “They would like to meet Gavin” describes an understandable interest, not a briefing objective.

| Include | Example |
| --- | --- |
| Customer decision | Whether to proceed with a scoped evaluation |
| Executive contribution | Confirm the relationship and resolve a sponsorship gap |
| Product boundary | Current model and supported workload |
| Sensitive topic | Existing concern about Nucleus; prepared response attached |
| Follow-up owner | AE, with SE owning technical actions |

## Prepare the room

Agree on the agenda, introductions, product claims and closing question. Check the meeting setup and prepare a shorter version of the deck. The opening remarks may develop additional strategic depth.

Put the customer problem before the company history. Keep the approved product evidence nearby. For Box conversations, confirm that the model on the slide matches the quote; Gavin's signature will not help the SE identify the configuration.

## Handle the unscheduled promise

If the discussion moves into unconfirmed capability or timing, capture the request and explain that the team will confirm the details. Do not silently convert an executive possibility into a delivery obligation.

Send a customer-facing recap with decisions, actions, owners and dates. Resolve uncertain commitments internally before treating them as approved scope. Update ${link("crm", "HooliForce")} and use ${link("handoff", "the handoff guide")} if implementation is approaching.

Gavin's office handles scheduling. Facilities handles room setup. Neither team can qualify the opportunity for you, although both may have developed an opinion.`,
  ),
];
