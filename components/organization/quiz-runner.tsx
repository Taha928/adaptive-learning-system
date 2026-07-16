"use client";

import {
	ArrowRightIcon,
	CheckCircle2Icon,
	LightbulbIcon,
	SparklesIcon,
	TrophyIcon,
	XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AdaptiveQuizRunner } from "@/components/organization/adaptive-quiz-runner";
import {
	QuizQuestionCard,
	readAnswerImage,
} from "@/components/organization/quiz-question-card";
import {
	type QuizReviewItem,
	QuizReviewItems,
} from "@/components/organization/quiz-review-items";
import { StudyNexMascot } from "@/components/studynex-mascot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { CenteredSpinner } from "@/components/ui/custom/centered-spinner";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/trpc/client";
import type { RouterOutputs } from "@/trpc/routers/app";

type Difficulty = "easy" | "medium" | "hard";

/**
 * How the between-quiz ladder describes its next step. Phrased as a direction
 * of travel rather than a level, so the student is told what is coming without
 * being handed a label to wear.
 */
const NEXT_STEP_COPY: Record<Difficulty, string> = {
	easy: "Your next quiz eases off to rebuild the fundamentals.",
	medium: "Your next quiz moves on to applying what you know.",
	hard: "Your next quiz steps up to scenarios and analysis.",
};

type SubmitResult = {
	score: number;
	percentage: number;
	passed: boolean;
	mastery: number;
	difficulty: Difficulty;
	difficultyChanged: boolean;
	nextQuizId: string | null;
	results: QuizReviewItem[];
	mastered: boolean;
	report: {
		topicTitle: string;
		confidence: string;
		recommendation: string;
		strengths: string[];
		weaknesses: string[];
	};
};

type LoadedQuiz = RouterOutputs["organization"]["quiz"]["getForAttempt"];

/**
 * Entry point for taking any quiz. An adaptive assessment has a fundamentally
 * different loop — one question at a time, each selected server-side once the
 * previous is graded — so it gets its own runner rather than a pile of
 * conditionals threaded through this one.
 */
export function QuizRunner({ quizId }: { quizId: string }) {
	const { data: quiz, isPending } =
		trpc.organization.quiz.getForAttempt.useQuery({ quizId });

	if (isPending) return <CenteredSpinner />;
	if (!quiz) return <p className="text-muted-foreground">Quiz not found.</p>;

	if (quiz.isAdaptive) {
		return (
			<AdaptiveQuizRunner
				quizId={quizId}
				title={quiz.title}
				totalQuestions={quiz.totalQuestions}
			/>
		);
	}

	return <FixedQuizRunner quizId={quizId} quiz={quiz} />;
}

/**
 * A fixed-difficulty quiz: the whole paper at once, submitted in one go. The
 * student chose the level when they generated it, so it is never shown back to
 * them on the questions.
 */
function FixedQuizRunner({
	quizId,
	quiz,
}: {
	quizId: string;
	quiz: LoadedQuiz;
}) {
	const [attemptId, setAttemptId] = useState<string | null>(null);
	const [responses, setResponses] = useState<Record<string, string>>({});
	const [responseImages, setResponseImages] = useState<
		Record<string, { name: string; url: string }>
	>({});
	const [result, setResult] = useState<SubmitResult | null>(null);

	const handleImageSelected = async (questionId: string, file: File | null) => {
		const url = await readAnswerImage(file);
		if (url && file) {
			setResponseImages((prev) => ({
				...prev,
				[questionId]: { name: file.name, url },
			}));
		}
	};

	const removeImage = (questionId: string) => {
		setResponseImages((prev) => {
			const next = { ...prev };
			delete next[questionId];
			return next;
		});
	};

	const startMutation = trpc.organization.quiz.startAttempt.useMutation({
		onSuccess: (data) => setAttemptId(data.attempt.id),
		onError: (error) => toast.error(error.message || "Could not start quiz"),
	});

	const submitMutation = trpc.organization.quiz.submitAttempt.useMutation({
		onSuccess: (data) => setResult(data as SubmitResult),
		onError: (error) => toast.error(error.message || "Could not submit quiz"),
	});

	const questions = quiz.questions;
	const answeredCount = useMemo(
		() =>
			questions.filter((q) => responses[q.id]?.trim() || responseImages[q.id])
				.length,
		[questions, responses, responseImages],
	);

	const started = attemptId != null;

	const handleSubmit = () => {
		if (!attemptId) return;
		submitMutation.mutate({
			attemptId,
			answers: questions.map((q) => {
				const value = responses[q.id]?.trim() || undefined;
				if (q.type === "shortAnswer" || q.type === "longAnswer") {
					return {
						questionId: q.id,
						responseText: value,
						responseImage: responseImages[q.id]?.url,
					};
				}
				return { questionId: q.id, selectedOption: value };
			}),
		});
	};

	// ----- Results panel (after grading) -----
	if (result) {
		return (
			<div className="space-y-6">
				<Card>
					<CardHeader>
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div className="flex items-center gap-3">
								<StudyNexMascot animated className="size-16 shrink-0" />
								<div>
									<CardTitle className="text-2xl">
										{result.percentage}%
									</CardTitle>
									<CardDescription>
										{result.score} / {questions.reduce((s, q) => s + q.points, 0)}{" "}
										points · {result.passed ? "Passed" : "Keep practicing"}
									</CardDescription>
								</div>
							</div>
							<Badge
								variant={result.passed ? "default" : "destructive"}
								className="text-sm"
							>
								{result.passed ? "Passed" : "Not passed"}
							</Badge>
						</div>
						<Progress value={result.percentage} className="mt-3" />
					</CardHeader>
				</Card>

				{/* Mastered: the ladder ends here. No further quizzes are generated
				    for this topic — the student gets a verdict, not another quiz. */}
				{result.mastered ? (
					<Card className="border-emerald-500/40 bg-emerald-500/5">
						<CardHeader>
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div className="flex items-center gap-2">
									<TrophyIcon className="size-5 text-emerald-600" />
									<CardTitle className="text-emerald-700 dark:text-emerald-400">
										Topic Mastered
									</CardTitle>
								</div>
								<div className="flex items-center gap-2">
									<Badge variant="outline">
										Overall {Math.round(result.mastery * 100)}%
									</Badge>
									<Badge variant="outline">
										Confidence: {result.report.confidence}
									</Badge>
								</div>
							</div>
							<CardDescription>
								You've cleared {result.report.topicTitle} at every level.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-5">
							{result.report.strengths.length > 0 && (
								<div className="space-y-2">
									<p className="flex items-center gap-2 font-medium text-sm">
										<CheckCircle2Icon className="size-4 text-emerald-600" />
										Strengths
									</p>
									<ul className="space-y-1">
										{result.report.strengths.map((s) => (
											<li
												key={s}
												className="text-muted-foreground text-sm leading-snug"
											>
												• {s}
											</li>
										))}
									</ul>
								</div>
							)}

							{result.report.weaknesses.length > 0 && (
								<div className="space-y-2">
									<p className="flex items-center gap-2 font-medium text-sm">
										<XCircleIcon className="size-4 text-rose-500" />
										Worth revising
									</p>
									<ul className="space-y-1">
										{result.report.weaknesses.map((w) => (
											<li
												key={w}
												className="text-muted-foreground text-sm leading-snug"
											>
												• {w}
											</li>
										))}
									</ul>
								</div>
							)}

							<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-4">
								<p className="flex items-center gap-2 text-sm">
									<LightbulbIcon className="size-4 shrink-0 text-amber-500" />
									{result.report.recommendation}
								</p>
								<Button asChild>
									<Link href="/dashboard/organization/courses">
										Continue to Next Topic
										<ArrowRightIcon className="size-4" />
									</Link>
								</Button>
							</div>
						</CardContent>
					</Card>
				) : (
					<Card className="border-primary/40 bg-primary/5">
						<CardContent className="space-y-4 py-5">
							<div className="flex flex-wrap items-center justify-between gap-4">
								<div className="space-y-1">
									<div className="flex items-center gap-2">
										<SparklesIcon className="size-4 text-primary" />
										<span className="font-medium text-sm">What's next</span>
										{result.difficultyChanged && (
											<Badge variant="outline" className="text-xs">
												Adjusted
											</Badge>
										)}
									</div>
									<p className="text-muted-foreground text-sm">
										Mastery {Math.round(result.mastery * 100)}% · confidence{" "}
										{result.report.confidence.toLowerCase()}
									</p>
									<p className="text-sm">{NEXT_STEP_COPY[result.difficulty]}</p>
								</div>
								{result.nextQuizId ? (
									<Button asChild>
										<Link
											href={`/dashboard/organization/quizzes/${result.nextQuizId}/take`}
										>
											Next quiz ready
											<ArrowRightIcon className="size-4" />
										</Link>
									</Button>
								) : (
									<span className="text-muted-foreground text-sm">
										Generating your next quiz…
									</span>
								)}
							</div>

							{result.report.weaknesses.length > 0 && (
								<div className="space-y-1 border-t pt-3">
									<p className="font-medium text-sm">You struggled with</p>
									<ul className="space-y-1">
										{result.report.weaknesses.slice(0, 3).map((w) => (
											<li
												key={w}
												className="text-muted-foreground text-sm leading-snug"
											>
												• {w}
											</li>
										))}
									</ul>
								</div>
							)}

							<p className="flex items-center gap-2 rounded-lg border bg-background p-3 text-sm">
								<LightbulbIcon className="size-4 shrink-0 text-amber-500" />
								{result.report.recommendation}
							</p>
						</CardContent>
					</Card>
				)}

				<div className="space-y-3">
					<h3 className="font-medium">Review</h3>
					<QuizReviewItems results={result.results} />
				</div>
			</div>
		);
	}

	// ----- Taking panel -----
	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>{quiz.title}</CardTitle>
					{quiz.description && (
						<CardDescription>{quiz.description}</CardDescription>
					)}
				</CardHeader>
			</Card>

			{!started ? (
				<div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
					<p className="text-muted-foreground text-sm">
						{questions.length} question{questions.length === 1 ? "" : "s"}.
						Answer them all, then submit to see your score and your next quiz.
					</p>
					<Button
						onClick={() => startMutation.mutate({ quizId })}
						loading={startMutation.isPending}
						disabled={questions.length === 0}
					>
						Start quiz
					</Button>
				</div>
			) : (
				<>
					{questions.map((q, index) => (
						<QuizQuestionCard
							key={q.id}
							question={{ ...q, topicTitle: q.topic?.title ?? null }}
							index={index + 1}
							total={questions.length}
							value={responses[q.id] ?? ""}
							image={responseImages[q.id] ?? null}
							onValueChange={(value) =>
								setResponses((prev) => ({ ...prev, [q.id]: value }))
							}
							onImageSelected={(f) => void handleImageSelected(q.id, f)}
							onImageRemoved={() => removeImage(q.id)}
						/>
					))}

					<Separator />

					<div className="flex items-center justify-between gap-3">
						<span className="text-muted-foreground text-sm">
							{answeredCount} / {questions.length} answered
						</span>
						<Button
							onClick={handleSubmit}
							loading={submitMutation.isPending}
							disabled={answeredCount === 0}
						>
							Submit quiz
						</Button>
					</div>
				</>
			)}
		</div>
	);
}
