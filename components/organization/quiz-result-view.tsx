"use client";

import { ArrowLeftIcon, RotateCcwIcon } from "lucide-react";
import Link from "next/link";
import { QuizReviewItems } from "@/components/organization/quiz-review-items";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { CenteredSpinner } from "@/components/ui/custom/centered-spinner";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { trpc } from "@/trpc/client";

const DIFFICULTY_STYLES: Record<string, string> = {
	easy: "bg-emerald-500 text-white border-transparent",
	medium: "bg-amber-500 text-white border-transparent",
	hard: "bg-rose-500 text-white border-transparent",
};

export function QuizResultView({ attemptId }: { attemptId: string }) {
	const { data, isPending } = trpc.organization.quiz.getAttemptResult.useQuery({
		attemptId,
	});

	if (isPending) return <CenteredSpinner />;
	if (!data) {
		return <p className="text-muted-foreground">Attempt not found.</p>;
	}

	return (
		<div className="space-y-6">
			<Button asChild variant="ghost" size="sm" className="w-fit">
				<Link href="/dashboard/organization/quizzes/attempts">
					<ArrowLeftIcon className="size-4" />
					All attempts
				</Link>
			</Button>

			<Card>
				<CardHeader>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<CardTitle className="text-2xl">{data.percentage}%</CardTitle>
							<CardDescription>
								{data.title} · {data.score}/{data.maxScore} points
							</CardDescription>
						</div>
						<div className="flex items-center gap-2">
							<Badge
								className={cn(
									"uppercase",
									DIFFICULTY_STYLES[data.difficulty] ?? "",
								)}
							>
								{data.difficulty}
							</Badge>
							<Badge variant={data.passed ? "default" : "destructive"}>
								{data.passed ? "Passed" : "Not passed"}
							</Badge>
						</div>
					</div>
					<Progress value={data.percentage} className="mt-3" />
				</CardHeader>
			</Card>

			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<h3 className="font-medium">Review</h3>
					<Button asChild variant="outline" size="sm">
						<Link href={`/dashboard/organization/quizzes/${data.quizId}/take`}>
							<RotateCcwIcon className="size-4" />
							Retake
						</Link>
					</Button>
				</div>
				<QuizReviewItems results={data.results} />
			</div>
		</div>
	);
}
