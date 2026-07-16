"use client";

import {
	CheckCircle2Icon,
	LightbulbIcon,
	TrendingDownIcon,
} from "lucide-react";
import { StudyNexMascot } from "@/components/studynex-mascot";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export type TopicOutcomeView = {
	topicId: string;
	topicTitle: string;
	correct: number;
	total: number;
	ratio: number;
};

type Props = {
	percentage: number;
	score: number;
	maxScore: number;
	passed: boolean;
	strong: TopicOutcomeView[];
	weak: TopicOutcomeView[];
	recommendation: string;
};

function OutcomeRow({
	outcome,
	tone,
}: {
	outcome: TopicOutcomeView;
	tone: "good" | "bad";
}) {
	return (
		<li className="flex items-baseline justify-between gap-3">
			<span className="truncate text-sm">{outcome.topicTitle}</span>
			<span
				className={`shrink-0 text-xs tabular-nums ${
					tone === "good"
						? "text-emerald-700 dark:text-emerald-400"
						: "text-rose-700 dark:text-rose-400"
				}`}
			>
				{outcome.correct}/{outcome.total}
			</span>
		</li>
	);
}

/**
 * The post-assessment verdict: mastery, the areas that carried it, the areas
 * that did not, and one thing to do next.
 *
 * Every figure here is derived from the answers the student actually gave,
 * grouped by the topic each question was tagged with — not from a second AI
 * call. It cannot hallucinate a strength they never demonstrated.
 */
export function MasteryReportCard({
	percentage,
	score,
	maxScore,
	passed,
	strong,
	weak,
	recommendation,
}: Props) {
	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="flex items-center gap-3">
							<StudyNexMascot animated className="size-16 shrink-0" />
							<div>
								<CardDescription>Mastery</CardDescription>
								<CardTitle className="text-3xl tabular-nums">
									{percentage}%
								</CardTitle>
								<CardDescription>
									{score} of {maxScore} correct
								</CardDescription>
							</div>
						</div>
						<Badge variant={passed ? "default" : "destructive"}>
							{passed ? "Passed" : "Keep practising"}
						</Badge>
					</div>
					<Progress value={percentage} className="mt-3" />
				</CardHeader>
			</Card>

			<div className="grid gap-4 sm:grid-cols-2">
				<Card className="border-emerald-500/40 bg-emerald-500/5">
					<CardHeader className="pb-3">
						<CardTitle className="flex items-center gap-2 text-base text-emerald-700 dark:text-emerald-400">
							<CheckCircle2Icon className="size-4" />
							Strong areas
						</CardTitle>
					</CardHeader>
					<CardContent>
						{strong.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								No area reached 80% in this assessment yet.
							</p>
						) : (
							<ul className="space-y-1.5">
								{strong.map((o) => (
									<OutcomeRow key={o.topicId} outcome={o} tone="good" />
								))}
							</ul>
						)}
					</CardContent>
				</Card>

				<Card className="border-rose-500/40 bg-rose-500/5">
					<CardHeader className="pb-3">
						<CardTitle className="flex items-center gap-2 text-base text-rose-700 dark:text-rose-400">
							<TrendingDownIcon className="size-4" />
							Weak areas
						</CardTitle>
					</CardHeader>
					<CardContent>
						{weak.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								Nothing below 50% — a clean run.
							</p>
						) : (
							<ul className="space-y-1.5">
								{weak.map((o) => (
									<OutcomeRow key={o.topicId} outcome={o} tone="bad" />
								))}
							</ul>
						)}
					</CardContent>
				</Card>
			</div>

			<Card className="border-dashed">
				<CardContent className="flex items-start gap-3 py-4">
					<LightbulbIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
					<div>
						<p className="font-medium text-sm">Recommended next step</p>
						<p className="text-muted-foreground text-sm">{recommendation}</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
