# Summit Updates

A first-version prototype for **Summit Retail Group** (5 stores, ~200 employees): managers post updates, employees see the ones meant for them on their phone, and for the few that really matter, managers can see exactly who has confirmed and who hasn't.

> MangoApps take-home · Scenario 2: Important Employee Updates

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 43 unit tests
```

No login, backend or API key needed. Use **View as** in the top bar to switch between managers and employees. **Reset demo** restores the sample data.

---

## 1. What I built

**The user and the problem.** Store managers like Rachel can't tell who has seen a safety or policy update; it goes out by text, printed notice or huddle and nobody can check. Floor staff like Alex don't read email and are already buried in messages.

**The one workflow I built end to end:**

> A manager posts an update → employees see it on their phone → for important posts they tap **"I've read this"** → the manager sees who has confirmed and who hasn't, and nudges the rest.

| Michael asked for | In the prototype |
|---|---|
| Managers post announcements | Composer with audience (stores × roles), live "Reaches N people", phone preview, AI assist and pre-post checks |
| Employees see updates that apply to them, on phones | Phone-first feed filtered by store and role. Posts needing confirmation sit at the top, everything else below |
| Employees confirm important announcements | One tap, no pop-ups. Only posts the manager marks **Needs confirmation** ask for it |
| Managers see who has / hasn't acknowledged | Per-post tracker: confirmed / opened but not confirmed / not opened, per-store breakdown, search, reminders, CSV export |
| Employees ask questions / give feedback ("eventually") | **Left out of v1**, see [section 4](#4-what-i-left-out-and-why) |

**Sample data:** 5 stores, 200 named employees across 5 roles, 7 announcements with realistic partial confirmation (Lakeview is noticeably behind, a few new hires, one edited post). It's generated from a fixed seed, so every reset is identical.

---

## 2. Walkthrough (about 5 minutes)

Click **Reset demo** first.

1. **Michael (Operations Manager, all stores).** The dashboard shows how many people still owe a confirmation and how many are overdue. Open *Keep fire exits clear*: the **By store** bars show Lakeview is behind (23/40). Click Lakeview to filter the list.
2. **Post something.** Click **+ New announcement**, write a safety update, then click **Suggest**. The AI drafts a one-line summary, picks *Safety* and recommends asking for confirmation. Untick Lakeview: the checks flag *"Mentions Lakeview, but that store isn't in the audience."* Turn on **Needs confirmation** and the composer shows what employees will get (one notification). Post it.
3. **Alex (Sales Associate, phone view).** *Please confirm* is at the top with the new post. Routine posts are below and ask for nothing. Open a post and tap **I've read this**, which takes one tap.
4. **Rachel (Store Manager, Downtown).** She only sees her own 40 people. Open the box cutter post and use the **Not confirmed** list, which separates *not opened* from *opened, not confirmed*. Click **Remind**: it's capped at once per person per day, and people Michael already reminded are skipped. For someone without the app, use **Confirmed in person?** to record a huddle sign-off.
5. **A post changes.** As Michael, edit the box cutter post and save. Pick **Small fix** (confirmations kept) or **Real change** (everyone re-confirms) and write what changed. As **Jordan**, the card now reads *"What changed: …"*.
6. **New hire (Sam).** Sam joined yesterday, so instead of being "overdue" on an older safety post he gets 3 days.

---

## 3. What I had to guess about

### Rachel vs Alex

Rachel wants proof that everyone saw safety and policy updates. Alex doesn't want another app nagging him. I treated these as compatible, provided "confirm" stays rare:

- **Two tiers.** Routine posts are read-only: no notification, nothing to tap. Only posts marked **Needs confirmation** send a notification and wait for a tap. The AI suggests this only for safety and policy.
- **The composer warns against overuse.** It flags confirmation on a routine post (*"people start tapping without reading"*) and says when a manager has already asked for it twice that week.
- **One tap, never a pop-up.** Important posts wait at the top of the feed. Nothing blocks the screen.
- **Reminders are manual and capped.** At most one per person per 24 hours, shared across all managers, so Rachel and Michael can't both ping the same person.
- **A real change gets a "What changed" line,** so people don't have to re-read the whole post.
- **Rachel can still reach 100%.** Anyone who never opens the app can be marked **confirmed in person**. It's labelled that way in the list and CSV, and the employee is told who recorded it.

### Other assumptions

| Unclear in the request | What I assumed |
|---|---|
| Who can post where | Michael (ops) posts to any store. Store managers post only to their own store. |
| Who decides what's "important" | The author, via a toggle. The AI suggests it and checks flag misuse. |
| How employees are notified | Employees have a phone. Confirmation posts send one push or text with a link (simulated). Routine posts are silent. |
| Targeting | By store × role, not individuals. Authors aren't counted in their own audience. |
| Managers as recipients | Store managers get company-wide posts and must confirm them too. |
| Who can see whom | Store managers see only their store's people, even on company-wide posts. Ops sees everyone. |
| Editing after people confirmed | The author chooses: a small fix keeps confirmations, a real change asks everyone again. |
| New hires and old posts | They get 3 days from their start date rather than starting out overdue. |
| Editing / archiving | Only the author can edit or archive a post. |

---

## 4. What I left out and why

| Left out | Why |
|---|---|
| **Questions and feedback on posts** | Michael said "eventually". It's the most valuable next step, but it needs moderation, who-answers-what and more notifications, which works against Alex's concern. I'd ship tracking first, then add questions per post that only the author sees, with answers promoted to an FAQ on the post. |
| Real login and SSO, backend, database | Not needed to prove the workflow. A role switcher stands in, and data lives in `localStorage`. |
| Real push and SMS delivery | Simulated. A reminder shows a toast saying what would be sent. |
| A real AI model | The AI is **mocked** with deterministic heuristics so it runs anywhere without a key. The UI around it (suggestion, human review, checks) is the part being prototyped. |
| Translations | A retail workforce is likely multilingual, so this is high on the list for v2. |
| Scheduling, expiry, attachments, images, rich text | Nice to have, not core to *"who hasn't seen it?"* |
| Cross-post reports and analytics | Per-post tracking answers Rachel's question. Trends can come later. |
| Native mobile app | The web app is phone-first and works at 375px. |

---

## Testing beyond the happy path

**Edge cases checked in the browser and covered by unit tests:**

- Empty, whitespace-only, too-long or too-short fields. Choosing no store or role. An audience that matches 0 people (a store manager targeting only themselves). A confirm-by date in the past.
- **Editing an overdue post.** Initially impossible, because the old date failed validation. Found and fixed.
- **Editing after people confirmed.** Small fix vs real change, plus the "What changed" note.
- **Two managers reminding the same people.** The cooldown is shared.
- **Reminders while filtered.** "Remind" originally ignored the store filter and would have messaged all 5 stores. Found and fixed: it now says *"Remind 17 people at Lakeview"*.
- **New hires.** People who joined after a post, or after its deadline, get a grace period. Seed data never reminds someone before their start date.
- Empty states: nothing to confirm, no search matches, everyone confirmed, no posts.
- Archived posts disappear from employee feeds.
- Phone width (375px): no sideways scrolling, posts open at the top, and Back returns to your place in the feed.

**Checking the AI's work:**

- Suggestions are **never applied automatically.** The author clicks *Use these*. If the message changes afterwards, the suggestion is marked stale and can't be applied.
- **Pre-post checks run on every edit** and catch the AI's mistakes as well as the author's: a summary that drops a date from the message, a summary with a date the message doesn't contain, a store mentioned but not targeted, confirmation on a routine post, a safety or policy post with no date, very long posts and ALL-CAPS shouting.
- A unit test runs those checks over every seeded post. It caught two summaries **I** had written that dropped a date.

---

## Project structure

```
src/
  types.ts              data model (Announcement, Ack, Employee, …)
  data/seed.ts          deterministic demo data (5 stores, 200 people, 7 posts)
  lib/logic.ts          audience, confirmation status, reminders, validation
  lib/mockAi.ts         mocked AI: classify, summarize, pre-post checks
  lib/*.test.ts         43 unit tests (Vitest)
  state/AppContext.tsx  reducer + localStorage persistence
  views/                ManagerApp, ManagerDetail (tracker), Composer, EmployeeApp
  components/           RoleBar (view-as switcher), shared UI
```

Stack: React 18, TypeScript, Vite, Vitest, plain CSS. There's no UI library.

## How I built it

I built this with **Claude Code** as a pair programmer: I set the scope, made the product calls (what to build, what to leave out, how to resolve Rachel vs Alex), and reviewed and tested the output. That meant clicking through every role at desktop and phone sizes and pushing on edge cases. Several real bugs came out of that pass and are listed above.
