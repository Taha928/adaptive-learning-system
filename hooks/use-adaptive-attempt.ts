"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { RunnerQuestion } from "@/components/organization/quiz-question-card";
import { readAnswerImage } from "@/components/organization/quiz-question-card";
import { trpc } from "@/trpc/client";
import type { RouterOutputs } from "@/trpc/routers/app";

type AnswerResponse = RouterOutputs["organization"]["quiz"]["answerAdaptive"];

export type AdaptiveFeedback = NonNullable<AnswerResponse["feedback"]>;
export type AdaptiveResult = NonNullable<AnswerResponse["result"]>;
export type AdaptiveStage = NonNullable<AnswerResponse["stage"]>;

export type StageGate = {
	justCompleted: NonNullable<AdaptiveStage["justCompleted"]>;
	next: AdaptiveStage["next"];
};

/**
 * What the student is looking at right now. Revision walks
 * question -> feedback -> (gate) -> question; an assessment only ever sits on
 * `question`, because it withholds marks until the end.
 */
export type AttemptPhase = "idle" | "question" | "feedback" | "gate" | "done";

/**
 * The adaptive attempt loop, shared by both experiences built on the engine:
 * assessments (Quizzes) and revision (Questions & Answers).
 *
 * Everything adaptive lives on the server — ability, stage, selection, grading —
 * so this holds no logic of its own beyond sequencing what the server sends.
 * The two modules differ in what they render, which is why they share this
 * rather than each keeping a copy of the loop.
 *
 * The server sends the next question together with the feedback for the last
 * one, so this holds it back: the student reads the mark, then (if they have
 * just cleared a stage) the gate, and only then sees what is next.
 */
export function useAdaptiveAttempt(quizId: string) {
	const [attemptId, setAttemptId] = useState<string | null>(null);
	const [question, setQuestion] = useState<RunnerQuestion | null>(null);
	const [answered, setAnswered] = useState(0);
	const [total, setTotal] = useState(0);
	const [feedback, setFeedback] = useState<AdaptiveFeedback | null>(null);
	const [gate, setGate] = useState<StageGate | null>(null);
	const [stage, setStage] = useState<AdaptiveStage | null>(null);
	const [result, setResult] = useState<AdaptiveResult | null>(null);
	const [pending, setPending] = useState<AnswerResponse | null>(null);

	const [value, setValue] = useState("");
	const [image, setImage] = useState<{ name: string; url: string } | null>(null);

	/** Apply a held response: next question, or the finished result. */
	const apply = (data: AnswerResponse) => {
		setAnswered(data.answeredCount);
		setValue("");
		setImage(null);
		if (data.finished && data.result) {
			setResult(data.result);
			setQuestion(null);
			return;
		}
		setTotal(data.totalQuestions);
		setQuestion(data.question ?? null);
	};

	const startMutation = trpc.organization.quiz.startAttempt.useMutation({
		onSuccess: (data) => {
			setAttemptId(data.attempt.id);
			setTotal(data.totalQuestions);
			setQuestion(data.questions[0] ?? null);
		},
		onError: (error) => toast.error(error.message || "Could not start"),
	});

	const answerMutation = trpc.organization.quiz.answerAdaptive.useMutation({
		onSuccess: (data) => {
			setStage(data.stage ?? null);
			// Revision: hold everything back so the mark can be read first.
			if (data.feedback) {
				setAnswered(data.answeredCount);
				setFeedback(data.feedback);
				setPending(data);
				return;
			}
			apply(data);
		},
		onError: (error) => toast.error(error.message || "Could not submit answer"),
	});

	const handleImage = async (file: File | null) => {
		const url = await readAnswerImage(file);
		if (url && file) setImage({ name: file.name, url });
	};

	const submitAnswer = () => {
		if (!attemptId || !question) return;
		const trimmed = value.trim();
		const isWritten =
			question.type === "shortAnswer" || question.type === "longAnswer";

		answerMutation.mutate({
			attemptId,
			questionId: question.id,
			...(isWritten
				? { responseText: trimmed || undefined, responseImage: image?.url }
				: { selectedOption: trimmed || undefined }),
		});
	};

	/**
	 * Move on from the feedback panel. If that answer also cleared a stage, stop
	 * at the gate — the student should get to see they finished Easy before Medium
	 * lands in front of them.
	 */
	const advance = () => {
		if (!pending) return;
		setFeedback(null);

		const justCompleted = pending.stage?.justCompleted;
		if (justCompleted) {
			setGate({ justCompleted, next: pending.stage?.next ?? null });
			return;
		}

		apply(pending);
		setPending(null);
	};

	/** Continue past the stage gate to the next stage's first question. */
	const advanceStage = () => {
		if (!pending) return;
		setGate(null);
		apply(pending);
		setPending(null);
	};

	const phase: AttemptPhase =
		attemptId == null
			? "idle"
			: gate
				? "gate"
				: feedback
					? "feedback"
					: result
						? "done"
						: "question";

	return {
		started: attemptId != null,
		phase,
		question,
		answered,
		total,
		feedback,
		gate,
		stage,
		result,
		value,
		setValue,
		image,
		setImage,
		onImageSelected: (file: File | null) => void handleImage(file),
		start: () => startMutation.mutate({ quizId }),
		submitAnswer,
		advance,
		advanceStage,
		isStarting: startMutation.isPending,
		isSubmitting: answerMutation.isPending,
		hasAnswer: value.trim().length > 0 || image != null,
	};
}
