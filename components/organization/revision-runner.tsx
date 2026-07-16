"use client";

import {
	ArrowRightIcon,
	CheckCircle2Icon,
	KeyRoundIcon,
	LightbulbIcon,
	RotateCcwIcon,
	TrophyIcon,
	XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { MasteryReportCard } from "@/components/organization/mastery-report-card";
import { QuizQuestionCard } from "@/components/organization/quiz-question-card";
import { QuizReviewItems } from "@/components/organization/quiz-review-items";
import { RevisionStageRail } from "@/components/organization/revision-stage-rail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	type AdaptiveFeedback,
	type AdaptiveStage,
	type StageGate,
	useAdaptiveAttempt,
} from "@/hooks/use-adaptive-attempt";

const STAGE_LABEL: Record<string, string> = {
	easy: "Easy",
	medium: "Medium",
	hard: "Hard",
};

/**
 * The moment the student actually learns: their answer, what they missed, the
 * model answer, and one thing to hold onto — shown immediately rather than saved
 * for a report they may never open. An assessment withholds all of this.
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
						{ok ? "That's right" : "Not quite"}
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

				{/* Why it was wrong, before the model answer — read the diagnosis
				    before the cure. Only present on a wrong answer. */}
				{feedback.aiFeedback && !ok && (
					<div className="space-y-1">
						<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
							Why that isn't right
						</p>
						<p className="text-sm">{feedback.aiFeedback}</p>
					</div>
				)}

				{feedback.keyConcept && (
					<div className="flex items-start gap-2 rounded-md border bg-background p-3">
						<KeyRoundIcon className="mt-0.5 size-4 shrink-0 text-primary" />
						<div className="space-y-0.5">
							<p className="font-medium text-xs uppercase tracking-wide">
								Key concept
							</p>
							<p className="text-sm">{feedback.keyConcept}</p>
						</div>
					</div>
				)}

				<div className="space-y-1 rounded-md border bg-background p-3">
					<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
						Model answer
					</p>
					<p className="whitespace-pre-wrap text-sm">{feedback.correctAnswer}</p>
				</div>

				{feedback.aiFeedback && ok && (
					<p className="text-muted-foreground text-sm">{feedback.aiFeedback}</p>
				)}

				{feedback.explanation && (
					<div className="flex items-start gap-2 border-t pt-3">
						<LightbulbIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
						<p className="text-muted-foreground text-sm">
							{feedback.explanation}
						</p>
					</div>
				)}

				{feedback.revisionTip && (
					<div className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/5 p-3">
						<RotateCcwIcon className="mt-0.5 size-4 shrink-0 text-primary" />
						<div className="space-y-0.5">
							<p className="font-medium text-xs uppercase tracking-wide">
								Revision tip
							</p>
							<p className="text-sm">{feedback.revisionTip}</p>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

/** "Easy Revision Completed -> Continue to Medium". */
function StageGateCard({
	gate,
	stage,
	onContinue,
}: {
	gate: StageGate;
	stage: AdaptiveStage | null;
	onContinue: () => void;
}) {
	const done = stage?.stages.find((s) => s.stage === gate.justCompleted);
	const label = STAGE_LABEL[gate.justCompleted] ?? gate.justCompleted;
	const nextLabel = gate.next ? (STAGE_LABEL[gate.next] ?? gate.next) : null;

	return (
		<Card className="border-emerald-500/40 bg-emerald-500/5">
			<CardContent className="flex flex-wrap items-center justify-between gap-4 py-6">
				<div className="flex items-center gap-3">
					{nextLabel ? (
						<CheckCircle2Icon className="size-8 shrink-0 text-emerald-600" />
					) : (
						<TrophyIcon className="size-8 shrink-0 text-emerald-600" />
					)}
					<div>
						<p className="font-semibold text-emerald-700 text-lg dark:text-emerald-400">
							{label} Revision Completed
						</p>
						<p className="text-muted-foreground text-sm">
							{done ? `${done.correct} of ${done.answered} correct` : null}
							{done && !done.passed
								? " — you've practised this enough for now, so let's move on."
								: nextLabel
									? ` — ${nextLabel.toLowerCase()} questions ask you to go further.`
									: " — that's the whole ladder."}
						</p>
					</div>
				</div>
				<Button onClick={onContinue} size="lg">
					{nextLabel ? `Continue to ${nextLabel}` : "See your summary"}
					<ArrowRightIcon className="size-4" />
				</Button>
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
 * marks each answer in front of you, explains it, gives you another go at
 * whatever you missed, and walks a visible Easy -> Medium -> Hard ladder. It
 * never hands out a pass/fail, because a low score on a session aimed at your
 * weak topics means the revision was aimed correctly.
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

	// Finished, and the last mark and gate have been read.
	if (a.result && a.phase === "done") {
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
				<Card className="border-dashed">
					<CardContent className="flex flex-col items-center gap-4 py-12 text-center">
						<div className="space-y-1">
							<p className="font-medium">{title}</p>
							<p className="mx-auto max-w-md text-muted-foreground text-sm">
								Around {total} questions, answered in your own words. You'll work
								up through easy, medium and hard — see the model answer after
								every one, and get another go at anything you miss.
							</p>
						</div>
						<Button onClick={a.start} loading={a.isStarting} size="lg">
							Start Questions &amp; Answers
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	const stageLabel = a.stage?.current
		? (STAGE_LABEL[a.stage.current] ?? a.stage.current)
		: null;

	return (
		<div className="space-y-5">
			{/* The workspace header: where you are on the ladder, not a score. */}
			{a.stage && a.stage.stages.length > 0 && (
				<div className="space-y-2">
					<RevisionStageRail stage={a.stage} />
					<div className="flex flex-wrap items-baseline justify-between gap-2">
						<p className="text-muted-foreground text-xs">
							{stageLabel
								? `${stageLabel} — question ${a.stage.answeredInStage + (a.phase === "question" ? 1 : 0)} of about ${a.stage.perStage}`
								: "Session complete"}
						</p>
						<p className="text-muted-foreground text-xs tabular-nums">
							{a.answered} answered
						</p>
					</div>
				</div>
			)}

			{a.phase === "gate" && a.gate ? (
				<StageGateCard gate={a.gate} stage={a.stage} onContinue={a.advanceStage} />
			) : a.phase === "feedback" && a.feedback ? (
				<>
					<FeedbackPanel feedback={a.feedback} />
					<div className="flex flex-wrap items-center justify-between gap-3">
						{a.feedback.retryOnSameTopic ? (
							<span className="flex items-center gap-2 text-muted-foreground text-xs">
								<RotateCcwIcon className="size-3.5 shrink-0" />
								Another question on{" "}
								{a.feedback.topicTitle ?? "this topic"} next, so you can put
								that right.
							</span>
						) : (
							<span />
						)}
						<Button onClick={a.advance}>
							{a.feedback.retryOnSameTopic ? "Try another" : "Next question"}
							<ArrowRightIcon className="size-4" />
						</Button>
					</div>
				</>
			) : a.question ? (
				<>
					<QuizQuestionCard
						question={a.question}
						index={a.answered + 1}
						total={null}
						value={a.value}
						image={a.image}
						onValueChange={a.setValue}
						onImageSelected={a.onImageSelected}
						onImageRemoved={() => a.setImage(null)}
						disabled={a.isSubmitting}
					/>
					<div className="flex flex-wrap items-center justify-between gap-3">
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
