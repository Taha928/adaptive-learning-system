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

/**
 * The adaptive attempt loop, shared by both experiences built on the engine:
 * assessments (Quizzes) and revision (Questions & Answers).
 *
 * Everything adaptive lives on the server — ability, selection, grading — so
 * this holds no logic of its own beyond sequencing. The two modules differ only
 * in what they render, which is why they share this rather than each keeping a
 * copy of the loop.
 *
 * `feedback` is populated by the server for revision sets only, and arrives with
 * the next question. It is held back until `advance()` so the student can read
 * the mark before the next question replaces it.
 */
export function useAdaptiveAttempt(quizId: string) {
	const [attemptId, setAttemptId] = useState<string | null>(null);
	const [question, setQuestion] = useState<RunnerQuestion | null>(null);
	const [answered, setAnswered] = useState(0);
	const [total, setTotal] = useState(0);
	const [feedback, setFeedback] = useState<AdaptiveFeedback | null>(null);
	const [result, setResult] = useState<AdaptiveResult | null>(null);
	const [pending, setPending] = useState<AnswerResponse | null>(null);

	const [value, setValue] = useState("");
	const [image, setImage] = useState<{ name: string; url: string } | null>(null);

	/** Apply a server response: next question, or the finished result. */
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
			// Revision: hold the next question back so the mark can be read first.
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

	/** Move past the feedback panel to the next question (revision only). */
	const advance = () => {
		if (!pending) return;
		setFeedback(null);
		apply(pending);
		setPending(null);
	};

	return {
		started: attemptId != null,
		question,
		answered,
		total,
		feedback,
		result,
		value,
		setValue,
		image,
		setImage,
		onImageSelected: (file: File | null) => void handleImage(file),
		start: () => startMutation.mutate({ quizId }),
		submitAnswer,
		advance,
		isStarting: startMutation.isPending,
		isSubmitting: answerMutation.isPending,
		hasAnswer: value.trim().length > 0 || image != null,
	};
}
