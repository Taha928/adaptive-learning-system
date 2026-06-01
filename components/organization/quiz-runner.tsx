"use client";

import { ArrowRightIcon, ImageIcon, SparklesIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { trpc } from "@/trpc/client";

type Difficulty = "easy" | "medium" | "hard";

const MAX_ANSWER_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB

function fileToDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
}

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
	results: QuizReviewItem[];
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
	const [responseImages, setResponseImages] = useState<
		Record<string, { name: string; url: string }>
	>({});
	const [result, setResult] = useState<SubmitResult | null>(null);

	const handleImageSelected = async (questionId: string, file: File | null) => {
		if (!file) return;
		if (file.size > MAX_ANSWER_IMAGE_BYTES) {
			toast.error("Image is too large (max 8 MB).");
			return;
		}
		try {
			const url = await fileToDataUrl(file);
			setResponseImages((prev) => ({
				...prev,
				[questionId]: { name: file.name, url },
			}));
		} catch {
			toast.error("Could not read the image.");
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
		onSuccess: (data) => {
			setResult({
				score: data.score,
				percentage: data.percentage,
				passed: data.passed,
				mastery: data.mastery,
				difficulty: data.difficulty as Difficulty,
				difficultyChanged: data.difficultyChanged,
				nextQuizId: data.nextQuizId,
				results: data.results,
			});
		},
		onError: (error) => toast.error(error.message || "Could not submit quiz"),
	});

	const questions = quiz?.questions ?? [];
	const answeredCount = useMemo(
		() =>
			questions.filter((q) => responses[q.id]?.trim() || responseImages[q.id])
				.length,
		[questions, responses, responseImages],
	);

	if (isPending) return <CenteredSpinner />;
	if (!quiz) return <p className="text-muted-foreground">Quiz not found.</p>;

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
								<StudyNexMascot className="size-12 shrink-0" />
								<div>
									<CardTitle className="text-2xl">
										{result.percentage}%
									</CardTitle>
									<CardDescription>
										{result.score} /{" "}
										{quiz.questions.reduce((s, q) => s + q.points, 0)} points ·{" "}
										{result.passed ? "Passed" : "Keep practicing"}
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
						const isFreeResponse =
							q.type === "shortAnswer" ||
							q.type === "longAnswer" ||
							options.length === 0;
						return (
							<Card key={q.id}>
								<CardHeader>
									<CardTitle className="text-base">
										{index + 1}. {q.prompt}
									</CardTitle>
								</CardHeader>
								<CardContent>
									{isFreeResponse ? (
										<div className="space-y-3">
											{q.type === "longAnswer" ? (
												<Textarea
													placeholder="Write your answer…"
													className="min-h-32"
													value={responses[q.id] ?? ""}
													onChange={(e) =>
														setResponses((prev) => ({
															...prev,
															[q.id]: e.target.value,
														}))
													}
												/>
											) : (
												<Input
													placeholder="Type your answer…"
													value={responses[q.id] ?? ""}
													onChange={(e) =>
														setResponses((prev) => ({
															...prev,
															[q.id]: e.target.value,
														}))
													}
												/>
											)}

											{/* Image answer (e.g. handwritten maths working). */}
											{responseImages[q.id] ? (
												<div className="flex items-center gap-3 rounded-md border p-2">
													{/* biome-ignore lint/performance/noImgElement: local data URL preview */}
													<img
														src={responseImages[q.id]!.url}
														alt="Your answer"
														className="size-16 rounded object-cover"
													/>
													<span className="min-w-0 flex-1 truncate text-muted-foreground text-sm">
														{responseImages[q.id]!.name}
													</span>
													<Button
														type="button"
														size="icon-sm"
														variant="ghost"
														onClick={() => removeImage(q.id)}
														aria-label="Remove image"
													>
														<XIcon className="size-4" />
													</Button>
												</div>
											) : (
												<label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-muted-foreground text-sm transition-colors hover:bg-accent">
													<ImageIcon className="size-4" />
													Attach an image of your answer
													<input
														type="file"
														accept="image/*"
														className="hidden"
														onChange={(e) => {
															void handleImageSelected(
																q.id,
																e.target.files?.[0] ?? null,
															);
															e.target.value = "";
														}}
													/>
												</label>
											)}
										</div>
									) : (
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
									)}
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
