"use client";

import { ArrowRightIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { MasteryReportCard } from "@/components/organization/mastery-report-card";
import {
	QuizQuestionCard,
	readAnswerImage,
	type RunnerQuestion,
} from "@/components/organization/quiz-question-card";
import {
	type QuizReviewItem,
	QuizReviewItems,
} from "@/components/organization/quiz-review-items";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/trpc/client";

type AdaptiveResult = {
	score: number;
	maxScore: number;
	percentage: number;
	passed: boolean;
	results: QuizReviewItem[];
	report: {
		strong: {
			topicId: string;
			topicTitle: string;
			correct: number;
			total: number;
			ratio: number;
		}[];
		weak: {
			topicId: string;
			topicTitle: string;
			correct: number;
			total: number;
			ratio: number;
		}[];
		recommendation: string;
	};
};

/** §7 — states that the assessment adapts, without ever naming the level. */
function AdaptiveBanner() {
	return (
		<Card className="border-primary/40 bg-primary/5">
			<CardContent className="flex items-start gap-3 py-4">
				<SparklesIcon className="mt-0.5 size-4 shrink-0 text-primary" />
				<div>
					<p className="font-medium text-sm">Adaptive Assessment</p>
					<p className="text-muted-foreground text-sm">
						Question difficulty and topic selection are adjusting automatically
						based on your performance.
					</p>
				</div>
			</CardContent>
		</Card>
	);
}

/**
 * The adaptive assessment experience: one question at a time, each chosen by
 * the server from a pre-generated pool once the previous answer is graded.
 *
 * The client is deliberately dumb about adaptation — it never learns a
 * question's difficulty, holds no ability estimate and cannot influence
 * selection. It renders what it is given and posts back an answer.
 */
export function AdaptiveQuizRunner({
	quizId,
	title,
	totalQuestions,
}: {
	quizId: string;
	title: string;
	totalQuestions: number;
}) {
	const [attemptId, setAttemptId] = useState<string | null>(null);
	const [question, setQuestion] = useState<RunnerQuestion | null>(null);
	const [answered, setAnswered] = useState(0);
	const [total, setTotal] = useState(totalQuestions);
	const [value, setValue] = useState("");
	const [image, setImage] = useState<{ name: string; url: string } | null>(null);
	const [result, setResult] = useState<AdaptiveResult | null>(null);

	const startMutation = trpc.organization.quiz.startAttempt.useMutation({
		onSuccess: (data) => {
			setAttemptId(data.attempt.id);
			setTotal(data.totalQuestions);
			setQuestion(data.questions[0] ?? null);
		},
		onError: (error) =>
			toast.error(error.message || "Could not start the assessment"),
	});

	const answerMutation = trpc.organization.quiz.answerAdaptive.useMutation({
		onSuccess: (data) => {
			setAnswered(data.answeredCount);
			setValue("");
			setImage(null);
			if (data.finished && data.result) {
				setResult(data.result as AdaptiveResult);
				setQuestion(null);
				return;
			}
			setTotal(data.totalQuestions);
			setQuestion(data.question ?? null);
		},
		onError: (error) => toast.error(error.message || "Could not submit answer"),
	});

	const handleImage = async (file: File | null) => {
		const url = await readAnswerImage(file);
		if (url && file) setImage({ name: file.name, url });
	};

	const handleSubmitAnswer = () => {
		if (!attemptId || !question) return;
		const trimmed = value.trim();
		const isFreeResponse =
			question.type === "shortAnswer" || question.type === "longAnswer";

		answerMutation.mutate({
			attemptId,
			questionId: question.id,
			...(isFreeResponse
				? { responseText: trimmed || undefined, responseImage: image?.url }
				: { selectedOption: trimmed || undefined }),
		});
	};

	if (result) {
		return (
			<div className="space-y-6">
				<MasteryReportCard
					percentage={result.percentage}
					score={result.score}
					maxScore={result.maxScore}
					passed={result.passed}
					strong={result.report.strong}
					weak={result.report.weak}
					recommendation={result.report.recommendation}
				/>
				<div className="space-y-3">
					<h3 className="font-medium">Review</h3>
					<QuizReviewItems results={result.results} />
				</div>
			</div>
		);
	}

	// ----- Pre-start -----
	if (!attemptId) {
		return (
			<div className="space-y-6">
				<AdaptiveBanner />
				<div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
					<p className="max-w-md text-muted-foreground text-sm">
						{title} · {total} questions. Each one is chosen for you as you go,
						so answer carefully — you cannot go back.
					</p>
					<Button
						onClick={() => startMutation.mutate({ quizId })}
						loading={startMutation.isPending}
					>
						Start assessment
					</Button>
				</div>
			</div>
		);
	}

	if (!question) {
		return (
			<p className="text-muted-foreground text-sm">
				No question available — the assessment pool may be empty.
			</p>
		);
	}

	const hasAnswer = value.trim().length > 0 || image != null;
	const position = Math.min(answered + 1, total);
	const isLast = position >= total;

	return (
		<div className="space-y-6">
			<AdaptiveBanner />

			<div className="space-y-2">
				<div className="flex items-baseline justify-between gap-3">
					<span className="font-medium text-sm">{title}</span>
					<span className="text-muted-foreground text-xs tabular-nums">
						{answered} of {total} answered
					</span>
				</div>
				<Progress value={(answered / Math.max(total, 1)) * 100} />
			</div>

			<QuizQuestionCard
				question={question}
				index={position}
				total={total}
				value={value}
				image={image}
				onValueChange={setValue}
				onImageSelected={(f) => void handleImage(f)}
				onImageRemoved={() => setImage(null)}
				disabled={answerMutation.isPending}
			/>

			<div className="flex items-center justify-end">
				<Button
					onClick={handleSubmitAnswer}
					loading={answerMutation.isPending}
					disabled={!hasAnswer}
				>
					{isLast ? "Finish assessment" : "Submit answer"}
					{!isLast && <ArrowRightIcon className="size-4" />}
				</Button>
			</div>
		</div>
	);
}
