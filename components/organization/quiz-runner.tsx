"use client";

import { ArrowRightIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { trpc } from "@/trpc/client";

type Difficulty = "easy" | "medium" | "hard";

const DIFFICULTY_STYLES: Record<Difficulty, string> = {
	easy: "bg-emerald-500 text-white border-transparent",
	medium: "bg-amber-500 text-white border-transparent",
	hard: "bg-rose-500 text-white border-transparent",
};

type SubmitResult = {
	score: number;
	percentage: number;
	passed: boolean;
	mastery: number;
	difficulty: Difficulty;
	difficultyChanged: boolean;
	nextQuizId: string | null;
};

function toOptions(options: unknown): string[] {
	if (Array.isArray(options)) {
		return options.filter((o): o is string => typeof o === "string");
	}
	return [];
}

export function QuizRunner({ quizId }: { quizId: string }) {
	const { data: quiz, isPending } =
		trpc.organization.quiz.getForAttempt.useQuery({ quizId });

	const [attemptId, setAttemptId] = useState<string | null>(null);
	const [responses, setResponses] = useState<Record<string, string>>({});
	const [result, setResult] = useState<SubmitResult | null>(null);

	const startMutation = trpc.organization.quiz.startAttempt.useMutation({
		onSuccess: (data) => setAttemptId(data.attempt.id),
		onError: (error) => toast.error(error.message || "Could not start quiz"),
	});

	const submitMutation = trpc.organization.quiz.submitAttempt.useMutation({
		onSuccess: (data) => {
			setResult({
				score: data.score,
				percentage: data.percentage,
				passed: data.passed,
				mastery: data.mastery,
				difficulty: data.difficulty as Difficulty,
				difficultyChanged: data.difficultyChanged,
				nextQuizId: data.nextQuizId,
			});
		},
		onError: (error) => toast.error(error.message || "Could not submit quiz"),
	});

	const questions = quiz?.questions ?? [];
	const answeredCount = useMemo(
		() => questions.filter((q) => responses[q.id]?.trim()).length,
		[questions, responses],
	);

	if (isPending) return <CenteredSpinner />;
	if (!quiz) return <p className="text-muted-foreground">Quiz not found.</p>;

	const started = attemptId != null;

	const handleSubmit = () => {
		if (!attemptId) return;
		submitMutation.mutate({
			attemptId,
			answers: questions.map((q) => ({
				questionId: q.id,
				selectedOption: responses[q.id] ?? undefined,
			})),
		});
	};

	// ----- Results panel (after grading) -----
	if (result) {
		return (
			<div className="space-y-6">
				<Card>
					<CardHeader>
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div>
								<CardTitle className="text-2xl">{result.percentage}%</CardTitle>
								<CardDescription>
									{result.score} /{" "}
									{quiz.questions.reduce((s, q) => s + q.points, 0)} points ·{" "}
									{result.passed ? "Passed" : "Keep practicing"}
								</CardDescription>
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

				{/* The adaptive money-shot: next quiz difficulty badge. */}
				<Card className="border-primary/40 bg-primary/5">
					<CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
						<div className="space-y-1">
							<div className="flex items-center gap-2">
								<SparklesIcon className="size-4 text-primary" />
								<span className="font-medium text-sm">Adaptive difficulty</span>
								{result.difficultyChanged && (
									<Badge variant="outline" className="text-xs">
										Updated
									</Badge>
								)}
							</div>
							<p className="text-muted-foreground text-sm">
								Mastery {Math.round(result.mastery * 100)}% · your next quiz is
								set to
							</p>
							<Badge
								className={cn(
									"px-3 py-1 text-sm uppercase tracking-wide",
									DIFFICULTY_STYLES[result.difficulty],
								)}
							>
								{result.difficulty}
							</Badge>
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
					</CardContent>
				</Card>

				<div className="space-y-3">
					<h3 className="font-medium">Review</h3>
					{questions.map((q, index) => {
						const chosen = responses[q.id];
						return (
							<Card key={q.id}>
								<CardHeader>
									<CardTitle className="text-base">
										{index + 1}. {q.prompt}
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-2">
									<p className="text-sm">
										<span className="text-muted-foreground">Your answer: </span>
										{chosen ? chosen : "—"}
									</p>
								</CardContent>
							</Card>
						);
					})}
				</div>
			</div>
		);
	}

	// ----- Taking panel -----
	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between gap-3">
						<div>
							<CardTitle>{quiz.title}</CardTitle>
							{quiz.description && (
								<CardDescription>{quiz.description}</CardDescription>
							)}
						</div>
						<Badge
							className={cn(
								"uppercase",
								DIFFICULTY_STYLES[quiz.difficulty as Difficulty],
							)}
						>
							{quiz.difficulty}
						</Badge>
					</div>
				</CardHeader>
			</Card>

			{!started ? (
				<div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
					<p className="text-muted-foreground text-sm">
						{questions.length} question{questions.length === 1 ? "" : "s"}.
						Answer them all, then submit to see your score and your next
						adaptive quiz.
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
					{questions.map((q, index) => {
						const options = toOptions(q.options);
						return (
							<Card key={q.id}>
								<CardHeader>
									<CardTitle className="text-base">
										{index + 1}. {q.prompt}
									</CardTitle>
								</CardHeader>
								<CardContent>
									<RadioGroup
										value={responses[q.id] ?? ""}
										onValueChange={(value) =>
											setResponses((prev) => ({ ...prev, [q.id]: value }))
										}
									>
										{options.map((option, optIndex) => {
											const id = `${q.id}-${optIndex}`;
											return (
												<label
													key={id}
													htmlFor={id}
													className="flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-accent"
												>
													<RadioGroupItem value={option} id={id} />
													<span>{option}</span>
												</label>
											);
										})}
									</RadioGroup>
								</CardContent>
							</Card>
						);
					})}

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
