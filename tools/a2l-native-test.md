# Testing whether Avenue's own tools can carry the graded half

Twenty minutes in a sandbox course. It answers one question: **can
native Brightspace quizzes replace our marking machinery?**

You already proved Avenue can host and run the labs. This is about the
*marks*, which are a separate decision.

---

## Part 1 — Import the multiple-choice questions (5 min)

`lab-01-questions.csv` holds all ten of Lab 1's concept questions,
generated from the same content the lab page is built from, so nothing
was retyped.

1. Course → **Quizzes** → **Question Library**
2. **Import** → **Upload a File** → drop the CSV
3. Review the preview, then **Import**

**Look for:**
- Do all ten arrive, with the right option marked correct?
- Did the hints and feedback come through?
- Do special characters survive? (Question 3 contains `Ω` — check it is
  not mangled.)

If this works, the concept questions are free forever: every lab's
questions can be generated the same way.

---

## Part 2 — Build one Arithmetic question (10 min)

This is the real test. Lab 1 asks students to measure a resistance and
then calculate a voltage from it.

Question Library → **New** → **Arithmetic Question**, and enter:

| Field | Value |
| --- | --- |
| Title | Voltage divider check |
| Question Text | `You measured the total resistance as {Rt} kΩ in the 5 V divider with a 4.7 kΩ fixed resistor. Calculate the voltage across the photoresistor.` |
| Formula | `5 * ({Rt} - 4.7) / {Rt}` |
| Variable | name `Rt`, min `5.0`, max `7.0`, decimal places `2` |
| Tolerance | `10` **percent** |
| Units | `V` |
| Significant figures | try setting `3` |

Then **Preview** it.

### The three things to judge

1. **Does the tolerance work?** The exact answer for `Rt = 5.17` is
   `0.4545`. Try `0.42` and `0.50` — both are inside 10% and should be
   accepted. Try `0.60` — should be rejected.
2. **Do units and significant figures behave** the way you would want in
   a lab report?
3. **The decisive one — can the formula use a number the student typed
   earlier in the quiz?** Look for any way to make `Rt` come from the
   student's own previous answer rather than a random value in a range.

I expect (3) to be impossible: Brightspace generates variables from the
range *you* author, and has no way to reference another response. Please
confirm or refute it — it is the single fact this whole decision rests
on.

---

## Part 3 — Why question 3 matters

Six of Lab 1's marked items work like this:

> The student measures **their own** total resistance → calculates a
> voltage from **their** measurement → we check the calculation against
> **their** number. A sloppy measurement with correct arithmetic still
> earns the arithmetic marks.

If Avenue cannot do that, there are three honest ways forward:

- **A · Split the job.** Our lab page keeps doing the
  measurement-chained check as immediate teaching feedback (already
  built, no gradebook involved). Avenue's quiz asks the same physics
  with a system-generated resistance for the mark that counts. Students
  practise on their own data and are graded on a standard case.
  *Everything else — the marker app, answer keys, CSV export — can go.*
- **B · Keep our marker** for those six items only, and let Avenue carry
  the other thirteen.
- **C · Change the pedagogy** so calculations use given values rather
  than measured ones. Cheapest technically, worst for the lab.

**A is my recommendation** if question 3 comes back "no".

---

## What to send back

- Did all ten questions import cleanly?
- Does the tolerance behave as advertised?
- **Can a variable come from a student's earlier answer — yes or no?**
- Anything about the Arithmetic editor that surprised you.
