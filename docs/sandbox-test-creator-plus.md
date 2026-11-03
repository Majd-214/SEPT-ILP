# Sandbox test: Creator+ and the Avenue template

**Everything I need from you, in one sitting of about 45 minutes.**

One file to upload, then nine checks. Each one says what to do, what a
pass looks like, and what it changes if it fails — so if you run out of
time, stop anywhere and the answers you have are still useful. The checks
are ordered so the most decisive come first.

---

## Upload (2 minutes)

`sept-avenue-sandbox-pack.zip` — 4.3 MB, 43 files.

1. Sandbox course → **Course Admin → Manage Files**
2. **Upload**, choose the ZIP, and let Avenue **unzip it at the root** of
   the course files (not into a subfolder — the pages look for
   `assets/` beside themselves).
3. Select the three HTML files → **Add Content Topics** → put them in any
   module.

You now have three topics:

| Topic | What it is |
| --- | --- |
| `a2l-editor-fidelity.html` | A diagnostic page. Reports what Avenue's editor keeps and what it strips. |
| `lab-template.html` | **The template.** A complete working lab page, hand-written, no build behind it. This is the thing we want professors to copy. |
| `generated-lab.html` | A real Lab 1 built by the pipeline, with marking. The comparison case. |

One wart to expect: `generated-lab.html` links to knowledge-base articles
that are not in this trimmed pack, so those links 404. The knowledge
panel still opens its articles, because they are embedded in the page.
Nothing else in the pack depends on a missing file.

---

## 1 · Does Avenue's editor keep what the labs need? (10 min)

**The one that matters most.** If a save strips our attributes, a
professor's first edit silently kills every interaction on the page, and
nothing else in this plan works.

1. Open the **`a2l-editor-fidelity.html`** topic. Thirteen rows should read
   **present** and two should read **clear**.
2. Press **Save this as the baseline**.
3. Topic dropdown → **Edit HTML** (or **Edit**, then the `</>` source view).
4. **Change nothing.** Press **Save**.
5. Reload the topic. Note every row that changed.
6. Now do it again, but **type a word into a paragraph first**, then save.
   Some editors only rewrite a document they think is dirty.

**Pass:** all fifteen rows unchanged.

**If `data-*`, the JSON configuration island, or the runtime script tag
turns red:** professors cannot edit a lab in Avenue without breaking it.
That does not kill the template — it means instructors edit a copy
somewhere else and re-upload, which is a much worse workflow and I would
want to know immediately.

---

## 2 · Did Creator+ inject its stylesheet? (included above, 1 min)

Rows 14 and 15 of the same page: **no D2L stylesheet injected** and **this
page's stylesheet is still the last word**.

Two other universities reported that enabling Creator+ adds
`templates.lcs.brightspace.com/lib/assets/css/styles.min.css` *below* a
page's own CSS links, where it overrides them. One wrote: *"all HTML pages
have a new default stylesheet that one can not delete or get rid of."*

**Pass:** both rows **clear**.

**If either is red:** tell me the exact URL it names, and look at
`generated-lab.html` — does it still look right, or has the type and
spacing changed? This is an admin fix
(`d2l.Tools.ContentStyler.AddStylesOnContentCreate`), and it is on the
list below.

---

## 3 · Can a professor add a Creator+ question to our page? (10 min)

**The check that decides whether the whole "embrace Creator+" plan
works.** D2L documents that Practices — unlike Elements — can go into any
HTML topic: *"Creator+ Practices can be inserted into all HTML content
topics."* I want to see it, in our page, in Avenue.

1. Open **`lab-template.html`** → **Edit HTML**.
2. Put the cursor inside step 3, after the question that is already there.
3. Toolbar → **Creator+ Authoring Tools → Insert Practice**.
4. Build any small question. **Save.**
5. Reload the topic as a student would see it.

**Tell me:**
- Was **Insert Practice** offered at all, or greyed out?
- Does the Practice **render** on the saved page?
- Does it look out of place against our styling, or close enough?
- **And critically:** do our own three steps still gate, does the answer
  box still check itself, does our question still mark? (The Creator+ save
  may have touched the rest of the page.)

**Pass:** the Practice renders and our interactions still work.

This is the result that tells us whether professors get a no-code question
button inside our template, which is most of what you asked for.

---

## 4 · Can they add a Creator+ Element? (3 min)

Same page, same menu → **Insert Element** (accordion, tabs, flip cards…).

D2L's FAQ says this will *not* work in custom HTML: *"Elements can be
added to blank pages and Creator+ template pages for the time being."*
That page is undated, so it is worth thirty seconds to find out.

**Tell me:** offered or not; if offered, does it render and does it look
like it belongs?

If Elements **do** work in our pages, that is a genuinely good surprise
and changes what the template needs to carry.

---

## 5 · Does the template actually work in Avenue? (5 min)

Open **`lab-template.html`** fresh (before or after the Creator+ edits —
either is useful, just tell me which).

Walk it as a student:

1. Tick the box in step 1 → **Complete step** → step 2 opens.
2. Type `3.1` in the answer box → it should say *"Not yet — check that the
   black probe is on ground…"*
3. Type `1.55` → it should say **Correct** (the answer is 1.6 ± 0.15).
4. **Complete step** → step 3 opens.
5. Answer the question wrong, then right. It should mark both.
6. **Download my work**, then reload the page — your answers should come
   back.

**Pass:** all six. This page has no build behind it: everything it does, it
does from the markup a professor can edit.

---

## 6 · Does the generated lab still mark? (5 min)

Open **`generated-lab.html`**. Confirm a checkpoint, answer a quiz, then
**Download submission package (.zip)**.

**Pass:** the ZIP downloads and contains a `completion.json`.

This is the half that produces marks and the half that needs me. If it
works, we keep both tiers; if Avenue blocks the download, marks have to
reach you another way.

---

## 7 · Classic Content or the new Content Experience? (1 min)

In the sandbox course, is the left-hand content tool called **Content**
with a page-style editor (new), or **Content** with modules and topics in
the old layout (classic)?

Quickest tell: **Course Admin → Course Offering Information** usually names
the experience, or ask Avenue support directly.

**Why it matters:** H5P can only write to the gradebook under the Content
Experience, and D2L has announced that **Classic Content support ends June
2029**.

---

## 8 · Does H5P offer a grade item? (10 min)

1. **Content → Create New → Page** (a Brightspace page, not our HTML file).
2. In the editor: **Creator+ Authoring Tools → Interactives**.
3. Insert any H5P interactive.
4. **Watch for a prompt that says "Add Grade Item."**

**Tell me:** did the prompt appear?

D2L is blunt about this: *"If you do not see the Add Grade Item prompt, the
interactive will not be gradable."* If it appears, H5P is a real route to
the gradebook for the work we choose to put there. If it does not, H5P is
formative only, like Creator+ Practices.

Also worth noting while you are there: does McMaster's H5P say
**Enterprise** or **Premium**? McMaster's announcement said Enterprise;
D2L's own documentation says Creator+ bundles H5P **Premium**. Different
products.

---

## 9 · Is Content Sandboxing on? (2 min)

Two tells, both already in front of you:

- On `generated-lab.html`, type an answer, reload, and see whether it
  comes back. If storage is blocked, it will not.
- If the Creator+ Practice from check 3 rendered, sandboxing is **off** —
  D2L: *"Sandboxed courses do not render Practices."*

**Tell me which.** Sandboxing changes which artifact we ship.

---

## What to send back

A photo or screenshot of the fidelity page after the edit-and-save, plus
one line each for checks 3 through 9. Red rows and surprises are more
useful than passes.

---

## Separately: what to ask Avenue support

These are administrator settings, not things you can test, and the renewal
window is exactly when they are being configured. Worth sending this week.

1. **Install our template so every course can use it.** Avenue supports an
   institution-wide HTML template set: put the package in **Public Files**
   and point the config variable **`d2l.Tools.Content.TemplatePath`** at
   it. It then appears in every course under **Content → Create New →
   Select a Document Template**. That is the whole mechanism behind
   "instructors update their own curriculum" — one install, every course,
   no web developer. Ask whether SEPT can have a template registered, and
   what they need from us to do it.
2. **Where should the shared stylesheet and behaviour file live?** We want
   one copy at a stable org-level path that every course links, so a fix
   reaches pages professors wrote a year ago. Ask whether Public Files is
   the right home and what the URL would be.
3. **Is `d2l.Tools.ContentStyler.AddStylesOnContentCreate` ON?** If so, can
   it be scoped off for our org unit — or better, can
   **`d2l.Tools.ContentStyler.CssOverride`** point at *our* stylesheet, so
   ours is the one Avenue injects?
4. **Is H5P registered with Assignment and Grade Services** enabled in both
   the registration and the deployment?
5. **Is the Student role's "Can be graded in Grades" enabled?** If not, H5P
   scores are discarded silently and only the sending tool sees the error.
6. **Which H5P tier** did the renewal actually buy — Enterprise or Premium?

---

## What each answer changes

| Result | What it means |
| --- | --- |
| Editor keeps `data-*` and the island | Professors edit labs in Avenue. The plan works as written. |
| Editor strips them | Professors edit a copy offline and re-upload. Much worse, and I would redesign around it. |
| Practices work in our page | Professors get a no-code question button inside our template. The best outcome available. |
| Elements work too | Better still — we can drop some of our own components. |
| Stylesheet injected | Admin fix needed before any rollout, or every lab restyles itself. |
| `TemplatePath` granted | One install reaches every course on Avenue. This is the goal. |
| H5P shows "Add Grade Item" | A real gradebook route for the graded half. |
