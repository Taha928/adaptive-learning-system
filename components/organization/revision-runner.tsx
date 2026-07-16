"use client";

import {
	ArrowRightIcon,
	BookOpenIcon,
	CheckCircle2Icon,
	LightbulbIcon,
	XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { MasteryReportCard } from "@/components/organization/mastery-report-card";
import { QuizQuestionCard } from "@/components/organization/quiz-question-card";
import { QuizReviewItems } from "@/components/organization/quiz-review-items";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
	type AdaptiveFeedback,
	useAdaptiveAttempt,
} from "@/hooks/use-adaptive-attempt";

function RevisionBanner() {
	return (
		<Card className="border-primary/40 bg-primary/5">
			<CardContent className="flex items-start gap-3 py-4">
				<BookOpenIcon className="mt-0.5 size-4 shrink-0 text-primary" />
				<div>
					<p className="font-medium text-sm">Revision</p>
					<p className="text-muted-foreground text-sm">
						Write your answer, then see the model answer and why. Questions
						follow whatever you're finding hard — this isn't a test, so getting
						one wrong is the point.
					</p>
				</div>
			</CardContent>
		</Card>
	);
}

/**
 * The moment the student actually learns: their answer, the model answer, and
 * why — shown immediately rather than saved for a report they may never open.
 * An assessment deliberately withholds all of this until the end.
 */
function FeedbackPanel({ feedback }: { feedback: AdaptiveFeedback }) {
	const ok = feedback.isCorrect;
	return (
		<Card
			className={
				ok
					? "border-emerald-500/40 bg-emerald-500/5"
					: "border-amber-500/40 bg-amber-500/5"
			}
		>
			<CardContent className="space-y-4 py-5">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<p
						className={`flex items-center gap-2 font-medium ${
							ok
								? "text-emerald-700 dark:text-emerald-400"
								: "text-amber-700 dark:text-amber-400"
						}`}
					>
						{ok ? (
							<CheckCircle2Icon className="size-4" />
						) : (
							<XCircleIcon className="size-4" />
						)}
						{ok ? "That's right" : "Not quite — worth a second look"}
					</p>
					{feedback.topicTitle && (
						<Badge variant="outline">{feedback.topicTitle}</Badge>
					)}
				</div>

				{feedback.yourAnswer && (
					<div className="space-y-1">
						<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
							You wrote
						</p>
						<p className="whitespace-pre-wrap text-sm">{feedback.yourAnswer}</p>
					</div>
				)}

				<div className="space-y-1 rounded-md border bg-background p-3">
					<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
						Model answer
					</p>
					<p className="whitespace-pre-wrap text-sm">{feedback.correctAnswer}</p>
				</div>

				{feedback.aiFeedback && (
					<div className="space-y-1">
						<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
							On your answer
						</p>
						<p className="text-sm">{feedback.aiFeedback}</p>
					</div>
				)}

				{feedback.explanation && (
					<div className="flex items-start gap-2 border-t pt-3">
						<LightbulbIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
						<p className="text-muted-foreground text-sm">
							{feedback.explanation}
						</p>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

/**
 * The revision experience for Questions & Answers.
 *
 * Runs on exactly the same engine as an adaptive assessment — same pool, same
 * ability estimate, same selection, same per-topic mastery — through the same
 * useAdaptiveAttempt hook. What differs is the point of the exercise: revision
 * marks each answer in front of you and explains it, and never hands out a
 * pass/fail, because a bad score on a revision session means the revision was
 * aimed at the right place.
 */
export function RevisionRunner({
	quizId,
	title,
	totalQuestions,
}: {
	quizId: string;
	title: string;
	totalQuestions: number;
}) {
	const a = useAdaptiveAttempt(quizId);
	const total = a.total || totalQuestions;

	// Finished, and the last answer's feedback has been read.
	if (a.result && !a.feedback) {
		return (
			<div className="space-y-6">
				<MasteryReportCard
					variant="revision"
					percentage={a.result.percentage}
					score={a.result.score}
					maxScore={a.result.maxScore}
					passed={a.result.passed}
					strong={a.result.report.strong}
					weak={a.result.report.weak}
					recommendation={a.result.report.recommendation}
				/>
				<Card className="border-dashed">
					<CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
						<p className="text-muted-foreground text-sm">
							Your topic mastery has been updated from this session.
						</p>
						<Button asChild variant="outline">
							<Link href="/dashboard/organization/report">
								See Progress Report
								<ArrowRightIcon className="size-4" />
							</Link>
						</Button>
					</CardContent>
				</Card>
				<div className="space-y-3">
					<h3 className="font-medium">Everything you answered</h3>
					<QuizReviewItems results={a.result.results} />
				</div>
			</div>
		);
	}

	if (!a.started) {
		return (
			<div className="space-y-6">
				<RevisionBanner />
				<div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
					<p className="max-w-md text-muted-foreground text-sm">
						{title} · {total} questions, answered in your own words. You'll see
						the model answer after each one.
					</p>
					<Button onClick={a.start} loading={a.isStarting}>
						Start revising
					</Button>
				</div>
			</div>
		);
	}

	const position = Math.min(a.answered + (a.feedback ? 0 : 1), total);

	return (
		<div className="space-y-6">
			<RevisionBanner />

			<div className="space-y-2">
				<div className="flex items-baseline justify-between gap-3">
					<span className="font-medium text-sm">{title}</span>
					<span className="text-muted-foreground text-xs tabular-nums">
						{a.answered} of {total} answered
					</span>
				</div>
				<Progress value={(a.answered / Math.max(total, 1)) * 100} />
			</div>

			{/* Feedback replaces the question rather than sitting under it, so the
			    student reads the explanation instead of skimming past to the next. */}
			{a.feedback ? (
				<>
					<FeedbackPanel feedback={a.feedback} />
					<div className="flex items-center justify-end">
						<Button onClick={a.advance}>
							{a.result ? "See your summary" : "Next question"}
							<ArrowRightIcon className="size-4" />
						</Button>
					</div>
				</>
			) : a.question ? (
				<>
					<QuizQuestionCard
						question={a.question}
						index={position}
						total={total}
						value={a.value}
						image={a.image}
						onValueChange={a.setValue}
						onImageSelected={a.onImageSelected}
						onImageRemoved={() => a.setImage(null)}
						disabled={a.isSubmitting}
					/>
					<div className="flex items-center justify-between gap-3">
						<span className="text-muted-foreground text-xs">
							Answer in your own words — it's marked against a model answer, not
							matched word for word.
						</span>
						<Button
							onClick={a.submitAnswer}
							loading={a.isSubmitting}
							disabled={!a.hasAnswer}
						>
							Check my answer
						</Button>
					</div>
				</>
			) : (
				<p className="text-muted-foreground text-sm">
					No question available — the revision pool may be empty.
				</p>
			)}
		</div>
	);
}
