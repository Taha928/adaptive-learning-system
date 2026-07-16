"use client";

import { ArrowRightIcon, SparklesIcon } from "lucide-react";
import { MasteryReportCard } from "@/components/organization/mastery-report-card";
import { QuizQuestionCard } from "@/components/organization/quiz-question-card";
import { QuizReviewItems } from "@/components/organization/quiz-review-items";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAdaptiveAttempt } from "@/hooks/use-adaptive-attempt";

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
 * The assessment experience: one question at a time, marks withheld until the
 * end, then a verdict. Revision uses the same engine through the same hook but
 * marks as it goes — see RevisionRunner.
 *
 * The client is deliberately dumb about adaptation: it never learns a question's
 * difficulty, holds no ability estimate and cannot influence selection.
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
	const a = useAdaptiveAttempt(quizId);
	const total = a.total || totalQuestions;

	if (a.result) {
		return (
			<div className="space-y-6">
				<MasteryReportCard
					percentage={a.result.percentage}
					score={a.result.score}
					maxScore={a.result.maxScore}
					passed={a.result.passed}
					strong={a.result.report.strong}
					weak={a.result.report.weak}
					recommendation={a.result.report.recommendation}
				/>
				<div className="space-y-3">
					<h3 className="font-medium">Review</h3>
					<QuizReviewItems results={a.result.results} />
				</div>
			</div>
		);
	}

	if (!a.started) {
		return (
			<div className="space-y-6">
				<AdaptiveBanner />
				<div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
					<p className="max-w-md text-muted-foreground text-sm">
						{title} · {total} questions. Each one is chosen for you as you go, so
						answer carefully — you cannot go back, and your marks are shown at
						the end.
					</p>
					<Button onClick={a.start} loading={a.isStarting}>
						Start assessment
					</Button>
				</div>
			</div>
		);
	}

	if (!a.question) {
		return (
			<p className="text-muted-foreground text-sm">
				No question available — the assessment pool may be empty.
			</p>
		);
	}

	const position = Math.min(a.answered + 1, total);
	const isLast = position >= total;

	return (
		<div className="space-y-6">
			<AdaptiveBanner />

			<div className="space-y-2">
				<div className="flex items-baseline justify-between gap-3">
					<span className="font-medium text-sm">{title}</span>
					<span className="text-muted-foreground text-xs tabular-nums">
						{a.answered} of {total} answered
					</span>
				</div>
				<Progress value={(a.answered / Math.max(total, 1)) * 100} />
			</div>

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

			<div className="flex items-center justify-end">
				<Button
					onClick={a.submitAnswer}
					loading={a.isSubmitting}
					disabled={!a.hasAnswer}
				>
					{isLast ? "Finish assessment" : "Submit answer"}
					{!isLast && <ArrowRightIcon className="size-4" />}
				</Button>
			</div>
		</div>
	);
}
