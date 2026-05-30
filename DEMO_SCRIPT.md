# Personalized Learning Tutor Agent — Demo / Viva Script

A ~5-minute walkthrough that shows every graded feature. Practise it once before the viva.

## Setup (before the room)

1. Ensure `.env` has a working `GOOGLE_GENERATIVE_AI_API_KEY` and the Neon `DATABASE_URL`.
2. `npm run db:seed` (creates the two demo logins below).
3. `npm run dev` and open the app.

**Logins** (org: *Demo Academy*)

| Role | Email | Password |
|---|---|---|
| Instructor (owner) | `admin@tutor.test` | `Password123!` |
| Student (member) | `student@tutor.test` | `Password123!` |

The sample file `sample-biology.pdf` (repo root) is ready to upload.

---

## Part 1 — Instructor: build the content (log in as admin@tutor.test)

1. **Home** — point out the overview: stat cards, recent activity, quick actions.
2. **Courses → New Course** — e.g. "Biology 101". Open it.
3. **Add Material → Upload PDF** — pick `sample-biology.pdf`. Show that text is extracted and stored (status → *ready*).
4. **Generate Topics** on the material — Gemini splits it into topics (Cell, Photosynthesis, DNA…). Show the Topics section fill in.
5. **Quizzes → Generate Quiz from Topic** — pick a topic, choose difficulty, generate. Show the AI-generated questions (mixed types: MCQ, true/false, short-answer).

> Talking point: *"The instructor never writes questions — Gemini generates them from the uploaded material, validated against a strict schema."*

## Part 2 — Student: the adaptive loop (log in as student@tutor.test)

6. **Quizzes → Take** a quiz. **Answer some wrong on purpose.** Submit.
7. On the results screen, show:
   - per-question **✓/✗**, the **correct answer** highlighted, and the **explanation**;
   - the **Adaptive difficulty** badge — because the score was low, **the next quiz is set to *easy***. **This is the money shot.**
8. Take the **next** quiz and **score high** → show the difficulty **climb** (easy → medium → hard).
9. **My Attempts** — show the full history; click **Review** to re-open any past result.

> Talking point: *"Quiz score → mastery (an exponential moving average) → a deterministic difficulty rule → the next quiz regenerates at the new level. The DS layer models the learner; Gemini generates the content."*

## Part 3 — Personalization & evidence

10. **Tutor Analytics** — topic mastery bars, accuracy trend, **Learning progress** (mastery climbing over time), and the **AI quiz-quality %** (your evaluation metric). Note the **weak-topic alert**.
11. **Study Plan → Generate** — AI roadmap that **prioritises the student's weak topics first**. Tick an item complete.
12. **AI Tutor** (chat) — ask a question; mention the tutor is **context-aware** (it's told the student's weak topics in the system prompt).
13. **Progress Report → Print / Save as PDF** — a clean exportable record (scores, mastery, attempts).

## Part 4 — Engineering credibility (mention, don't click)

- **Multi-tenant**: every query is scoped to the organization; a second org sees nothing of this one.
- **Roles**: log in as the student and show the "New Course / Generate" actions are blocked (instructor-only).
- **Autonomous refresh**: a Vercel Cron nightly regenerates study plans (SRS R9).
- **Tested**: the adaptive engine (mastery EMA + difficulty rule) has unit tests (`npm test`).

---

## If asked "where is the data science?"
*"The DS contribution is the learner-modelling layer — mastery estimation via an EMA over performance logs, and adaptive difficulty selection. I chose an explainable, cold-start-friendly model over a trained one deliberately; the `PerformanceLog` table is the dataset that a future knowledge-tracing model (BKT/IRT) would train on."*
