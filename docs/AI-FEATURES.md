# AI Features & Architecture

> Personalized Learning Tutor — powered by Google Gemini via the Vercel AI SDK.
> Last reviewed against source: 2026-06-02.

This document explains the tech stack, libraries, and exactly how the three AI
features work: **quiz generation**, **study-plan generation**, and **personalized
chat**. Plus the supporting pipeline (material extraction, topic segmentation,
free-response grading) that feeds them.

---

## 1) Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16.1.1 (App Router), React 19.2.3, TypeScript 5.9 (strict) |
| **Runtime** | Node.js 22.21.1 |
| **Database** | PostgreSQL |
| **ORM** | Prisma 7.2.0 + `@prisma/adapter-pg` (connection pooling) |
| **API** | tRPC 11.8.1 + TanStack React Query 5.90 |
| **Auth** | better-auth 1.4.11 (orgs, members, roles) |
| **AI** | Vercel AI SDK 6.0 (`ai`) + Google Gemini (`@ai-sdk/google`) |
| **UI** | Tailwind CSS 4.1, Radix UI / shadcn, Lucide icons, Sonner |
| **Validation** | Zod 4.3 |
| **Docs processing** | `unpdf` (PDF → text), `mammoth` (DOCX → text) |
| **Billing** | Stripe 20.1 |
| **Testing** | Vitest 4.0, Playwright 1.57 |
| **Observability** | Pino logging, Sentry |

**Default model:** `gemini-2.5-flash` (selectable: `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.5-pro`).

---

## 2) Key Libraries (AI-relevant)

| Library | Purpose |
|---|---|
| `ai` (6.0) | Core Vercel AI SDK — `generateObject()` for structured JSON, `streamText()` for chat streaming |
| `@ai-sdk/google` (3.0) | Gemini provider. Reads `GOOGLE_GENERATIVE_AI_API_KEY`. Chosen natively over an OpenAI-compatible gateway because structured output (`generateObject`) is more reliable |
| `@ai-sdk/react` | `useChat` hook for the streaming chat UI |
| `@ai-sdk/openai` | Present as an alternative provider; not used in tutor flows |
| `zod` | Defines the schemas that force the model into validated JSON output |
| `unpdf` | Extracts text from uploaded PDFs (material processing) |
| `mammoth` | Converts DOCX attachments to text inside chat |

**No RAG / embeddings / vector search.** There is no pgvector, no chunking, no
similarity retrieval. All grounding is done by feeding source text **inline**
(bounded to ~12k–16k chars) plus the user's performance history.

### Shared tutor core — `lib/ai/tutor.ts`

A single persona and model resolver are reused by every feature, so behavior
stays consistent:

```typescript
export const TUTOR_SYSTEM_PROMPT = `You are an adaptive personal learning tutor.
Explain concepts clearly with concrete examples. When a student is stuck, give
guiding hints rather than the full answer. Adjust the depth of your explanations
to the student's demonstrated level of understanding. Be encouraging, patient,
and concise.`;

export function tutorModel(modelId: string = DEFAULT_CHAT_MODEL) {
  return google(modelId);
}
```

The same file holds the **deterministic adaptivity engine** (the LLM generates
*content*; these pure functions decide the *level*):

```typescript
export function nextDifficulty(mastery: number): Difficulty {
  if (mastery < 0.5) return "easy";
  if (mastery < 0.8) return "medium";
  return "hard";
}

// Exponential moving average — recent performance weighted 40%, smoothing one-off results.
export function updateMastery(previous, latest) {
  const clamped = Math.max(0, Math.min(1, latest));
  if (previous == null) return clamped;
  return Number((0.6 * prevClamped + 0.4 * clamped).toFixed(4));
}
```

---

## 3) Quiz Generation

**Files:** `trpc/routers/organization/organization-quiz-router.ts`, `lib/ai/quiz-grading.ts`

### Context fed into the prompt
- `topic.title`
- `topic.summary` + `topic.content` (instructor-authored)
- `topic.material.extractedText` — full PDF text from `unpdf`
- All concatenated and **clamped to 12,000 chars**
- `difficulty` (easy/medium/hard) — chosen adaptively from mastery
- `numQuestions`
- `includeLong` flag — whether to add a long scenario question

### The prompt
```
Create a ${difficulty} difficulty quiz with exactly ${numQuestions} questions for the topic "${topic.title}".

Use ONLY the study material below as the source of truth. Mix the question types:
- Most should be "multipleChoice" with 3-4 options.
- Include 1-2 "trueFalse" questions whose options are exactly ["True","False"].
- Include 1 "shortAnswer" question with an empty options array and a short (1-3 word) correctAnswer.
- [optional] Include 1 "longAnswer" scenario-based question ... set "correctAnswer" to a concise model answer / marking rubric ...
For multipleChoice and trueFalse, the "correctAnswer" MUST exactly match one of the provided options. Provide a short explanation for each answer.

Study material:
${sourceText}
```

### Output schema (`generateObject` + Zod)
```typescript
const aiQuizSchema = z.object({
  title: z.string(),
  questions: z.array(z.object({
    prompt: z.string(),
    type: z.enum(["multipleChoice", "trueFalse", "shortAnswer", "longAnswer"]),
    options: z.array(z.string()).max(6).default([]),
    correctAnswer: z.string(),
    explanation: z.string(),
  })).min(1),
});
```

### Adaptive loop
On submit (`submitAttempt`):
1. Score the attempt; free-response questions (short/long/image) are graded by AI (see §6).
2. `updateMastery()` blends the new score into the topic's EMA mastery.
3. `nextDifficulty()` picks the next level from the new mastery.
4. A **next quiz is auto-generated** at that difficulty.
5. Mastery + difficulty written to `PerformanceLog`.

**Persistence:** `Quiz`, `Question`, `QuizAttempt`, `Answer` tables. AI-generated quizzes flagged `isAiGenerated: true`.

---

## 4) Study Plan Generation

**Files:** `lib/ai/study-plan.ts`, `trpc/routers/organization/organization-studyplan-router.ts`, `app/api/cron/refresh-plans/route.ts`

### Context gathered (`gatherLearnerContext`)
- **Goal** — user-stated, or the model infers a sensible one
- **All course topics** (id, title, summary; org/course-scoped, max 100, curriculum order)
- **Weak topics** — from `PerformanceLog`, any topic with latest `masteryScore < 0.5` or never assessed

### The prompt (`buildPrompt`)
```
The learner's stated goal: ${goal}   // or "infer a sensible one"

Topics the learner is weakest on (prioritise these earliest):
- ...

All available course topics:
- ...

Produce an ordered study roadmap. Start with the weakest areas, build up
to mastery, and finish with consolidation/review. When a step maps to one
of the available topics above, set its topicTitle to that topic's exact
title so it can be linked.
```

### Output schema
```typescript
const studyPlanGenerationSchema = z.object({
  title: z.string(),
  goal: z.string(),
  items: z.array(z.object({
    title: z.string(),
    topicTitle: z.string().optional(), // exact match → linked to a real Topic
  })).min(1).max(20),
});
```

### Persistence & refresh
- Saved as `StudyPlan` (+ `generatedByAi: true`) with ordered `StudyPlanItem[]`.
- Each item's `topicTitle` is matched case-insensitively to a real topic and linked via `topicId`.
- **Nightly Vercel Cron** (`/api/cron/refresh-plans`, gated by `CRON_SECRET`) re-fetches updated weak topics for every active AI-generated plan and atomically replaces its items — so plans stay adaptive as performance changes.

---

## 5) Personalized Chat

**Files:** `app/api/ai/chat/route.ts` (streaming), `trpc/routers/organization/organization-ai-router.ts` (CRUD)

This is a **raw API route, not tRPC** — tRPC's JSON request/response model can't
do token streaming. It uses `streamText()` → `toTextStreamResponse()`.

### How it's personalized
Starts from `TUTOR_SYSTEM_PROMPT`, then pulls the user's recent `PerformanceLog`
(latest 100), collects topics with `masteryScore < 0.6`, and **appends them to
the system prompt**:

```typescript
if (weakTopics.length > 0) {
  systemPrompt += `\n\nContext about this student: they are currently weakest on these topics — ${weakTopics
    .slice(0, 8)
    .join(", ")}. When relevant, steer your explanations, examples, and practice suggestions toward strengthening these areas.`;
}
```

If context-gathering fails, chat falls back to the base prompt (logged as a warning).

### Multimodal attachments (`buildUserContent`)
The latest user message is turned into a multimodal content array so Gemini can read files:
- **Images** → passed natively (Gemini OCRs them)
- **PDFs** → passed natively as a `file` part
- **DOCX** → extracted to text via `mammoth`
- **Plain text** → inlined (truncated to 20k chars)
- **Anything else** → mentioned by name so the tutor can ask for a better format

### Context injected into the chat
1. Authenticated user ID + organization ID (multi-tenant scoping)
2. Up to 8 weak topics (recency-ordered) → system prompt
3. Full conversation history (from the frontend)
4. Multimodal attachments
5. Selected Gemini model (validated against the `chatModels` allow-list)

### Persistence & logging (`onFinish`)
- Conversation saved as JSON in `AiChat.messages`.
- A `PerformanceLog` row (`eventType: chatAsked`) is recorded per interaction; streak activity updated.
- Note: chat is logged for analytics/streaks but does **not** currently feed back into mastery — mastery is driven only by quiz attempts.

---

## 6) Supporting Pipeline (newer additions)

### Material text extraction — `app/api/materials/extract/route.ts`
- Raw route (multipart upload; tRPC can't carry binary). Uses **`unpdf`**.
- ≤ 20 MB, PDF only. Returns `{ text, pageCount }`, stored on `Material.extractedText`.
- No chunking — the whole text is later fed inline to generation, bounded per use.

### Topic segmentation — `organization-material-router.ts → segmentTopics`
- Instructor-only. Feeds `material.extractedText` (clamped to 16k chars) to Gemini.
- Prompt: *"Split the following study material into at most N distinct learning topics, in the order they should be studied... Use ONLY the material below."*
- Output: `{ topics: [{ title, summary }] }`. Idempotent — deletes prior topics for that material and recreates, then marks the material `ready`.
- **Topics are the unit that quizzes and study plans generate from** — this is the bridge from raw uploads to the adaptive features.

### Free-response grading — `lib/ai/quiz-grading.ts`
- Grades short/long/image answers (e.g. handwritten maths) with `generateObject`.
- Input: question prompt, reference/rubric answer, student text and/or image.
- Output: `{ isCorrect, feedback }`. Binary correctness (full/no points) + one or two encouraging sentences. Skips the AI call entirely when no answer was submitted.

---

## Summary

| Feature | Model | Input Context | Output | Adaptive? | Persistence |
|---|---|---|---|---|---|
| **Quiz Gen** | Gemini 2.5 Flash | Topic (title/summary/content/extracted text), difficulty, #questions | `aiQuizSchema` (structured) | ✅ next difficulty via mastery EMA + auto-regen | Quiz / Question / Attempt / Answer |
| **Study Plan** | Gemini 2.5 Flash | Goal, weak topics (<0.5), all topics | `studyPlanGenerationSchema` (structured) | ✅ weak-first + nightly cron refresh | StudyPlan / StudyPlanItem |
| **Chat** | Gemini 2.5 Flash (selectable) | Base prompt + weak topics (<0.6), history, multimodal attachments | Streamed text | ✅ weak topics injected per-user | AiChat.messages + PerformanceLog |
| **Topic Segmentation** | Gemini 2.5 Flash | Material extracted text (≤16k) | `aiTopicsSchema` | N/A | Topic |
| **Free-Response Grading** | Gemini 2.5 Flash | Prompt, rubric, student text/image | `{ isCorrect, feedback }` | N/A | Answer.isCorrect + feedback |

**Architecture in one line:** a *mastery-driven adaptive learning system* with no
RAG — content is fed whole to Gemini, difficulty is chosen deterministically from
EMA-smoothed mastery scores, structured output is enforced with Zod everywhere
except streaming chat, and a single shared tutor persona unifies all surfaces.
