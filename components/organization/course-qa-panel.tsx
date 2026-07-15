"use client";

import {
	ArrowRightIcon,
	CheckCircle2Icon,
	MessagesSquareIcon,
	SparklesIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/trpc/client";

const COUNT_OPTIONS = [3, 5, 9, 12, 15, 20];

const DIFFICULTY_OPTIONS = [
	{
		value: "adaptive",
		label: "Adaptive — easy → medium → hard",
		hint: "Warms you up, then stretches you",
	},
	{ value: "easy", label: "Easy only", hint: "Recall and definitions" },
	{ value: "medium", label: "Medium only", hint: "Apply and explain" },
	{ value: "hard", label: "Hard only", hint: "Analyse and reason" },
] as const;

type QaDifficulty = (typeof DIFFICULTY_OPTIONS)[number]["value"];

/**
 * Written Q&A practice across a whole course. Every question is typed — no
 * multiple choice — so the AI grader marks what the student actually produced.
 * Questions are drawn from every topic and, by default, ramp easy → medium →
 * hard across the set.
 */
export function CourseQaPanel() {
	const router = useRouter();
	const utils = trpc.useUtils();
	const [courseId, setCourseId] = useState<string>("");
	const [numQuestions, setNumQuestions] = useState<number>(9);
	const [difficulty, setDifficulty] = useState<QaDifficulty>("adaptive");

	const { data: courseData, isPending } =
		trpc.organization.course.list.useQuery({});
	const courses = courseData?.courses ?? [];

	// Previously generated sets for this course — a Q&A set is a quiz with no
	// topic, which is exactly what distinguishes it from a topic drill.
	const { data: quizData } = trpc.organization.quiz.list.useQuery(
		{ courseId: courseId || undefined },
		{ enabled: Boolean(courseId) },
	);
	const qaSets = (quizData?.quizzes ?? []).filter((q) => q.topicId === null);

	const generateMutation = trpc.organization.quiz.generateCourseQA.useMutation({
		onSuccess: (res) => {
			toast.success(
				`${res.numQuestions} questions ready — covering all ${res.topicCount} topics`,
			);
			utils.organization.quiz.list.invalidate();
			router.push(`/dashboard/organization/quizzes/${res.quizId}/take`);
		},
		onError: (error) => toast.error(error.message || "Could not build Q&A set"),
	});

	if (isPending) return <CenteredSpinner />;

	const selected = courses.find((c) => c.id === courseId);
	const topicCount = selected?._count.topics ?? 0;

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<MessagesSquareIcon className="size-5 text-primary" />
						Write your answers
					</CardTitle>
					<CardDescription>
						The tutor writes questions covering every topic in the course. You
						answer them in your own words — no multiple choice — and it marks
						what you wrote, question by question, explaining where you were
						right and where you slipped.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-3 sm:grid-cols-3">
						<div className="space-y-1.5">
							<Label htmlFor="qa-course">Course</Label>
							<Select
								value={courseId}
								onValueChange={setCourseId}
								disabled={generateMutation.isPending || courses.length === 0}
							>
								<SelectTrigger id="qa-course">
									<SelectValue
										placeholder={
											courses.length === 0 ? "No courses yet" : "Choose a course"
										}
									/>
								</SelectTrigger>
								<SelectContent>
									{courses.map((c) => (
										<SelectItem key={c.id} value={c.id}>
											{c.title}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-1.5">
							<Label htmlFor="qa-count">How many questions</Label>
							<Select
								value={String(numQuestions)}
								onValueChange={(v) => setNumQuestions(Number(v))}
								disabled={generateMutation.isPending}
							>
								<SelectTrigger id="qa-count">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{COUNT_OPTIONS.map((n) => (
										<SelectItem key={n} value={String(n)}>
											{n} questions
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-1.5">
							<Label htmlFor="qa-difficulty">Difficulty</Label>
							<Select
								value={difficulty}
								onValueChange={(v) => setDifficulty(v as QaDifficulty)}
								disabled={generateMutation.isPending}
							>
								<SelectTrigger id="qa-difficulty">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{DIFFICULTY_OPTIONS.map((d) => (
										<SelectItem key={d.value} value={d.value}>
											{d.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="text-muted-foreground text-sm">
							{courseId && topicCount === 0 ? (
								<span>
									This course has no topics yet — add a material and use
									“Generate Topics” first.
								</span>
							) : courseId ? (
								<span>
									<strong>{numQuestions}</strong> written questions across all{" "}
									<strong>{topicCount}</strong> topics ·{" "}
									{difficulty === "adaptive" ? (
										<>
											ramps{" "}
											<Badge variant="outline" className="mx-0.5">
												easy
											</Badge>
											→
											<Badge variant="outline" className="mx-0.5">
												medium
											</Badge>
											→
											<Badge variant="outline" className="mx-0.5">
												hard
											</Badge>
										</>
									) : (
										<>
											all{" "}
											<Badge variant="outline" className="mx-0.5">
												{difficulty}
											</Badge>
										</>
									)}
								</span>
							) : (
								<span>Pick a course to begin.</span>
							)}
						</div>
						<Button
							onClick={() =>
								generateMutation.mutate({ courseId, numQuestions, difficulty })
							}
							loading={generateMutation.isPending}
							disabled={
								generateMutation.isPending || !courseId || topicCount === 0
							}
						>
							<SparklesIcon className="size-4" />
							Generate questions
						</Button>
					</div>

					{generateMutation.isPending && (
						<p className="text-muted-foreground text-xs">
							Writing {numQuestions} questions from your material… about 20–40
							seconds.
						</p>
					)}
				</CardContent>
			</Card>

			{courseId && qaSets.length > 0 && (
				<div className="space-y-3">
					<h3 className="font-medium">Your Q&A sets</h3>
					<ul className="space-y-2">
						{qaSets.map((q) => {
							const best = q.attempts[0];
							return (
								<li
									key={q.id}
									className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
								>
									<div className="min-w-0">
										<p className="truncate font-medium text-sm">{q.title}</p>
										<p className="text-muted-foreground text-xs">
											{q._count.questions} questions
										</p>
									</div>
									<div className="flex items-center gap-2">
										{best ? (
											<Link
												href={`/dashboard/organization/quizzes/attempts/${best.id}`}
												className="inline-flex items-center gap-2 hover:underline"
											>
												<Badge variant={best.passed ? "default" : "destructive"}>
													{best.percentage ?? 0}%
												</Badge>
												<span className="text-muted-foreground text-xs">
													Review answers
												</span>
											</Link>
										) : (
											<Badge variant="outline">Not attempted</Badge>
										)}
										<Button asChild size="sm" variant="outline">
											<Link
												href={`/dashboard/organization/quizzes/${q.id}/take`}
											>
												{best ? "Retry" : "Answer"}
												<ArrowRightIcon className="size-3.5" />
											</Link>
										</Button>
									</div>
								</li>
							);
						})}
					</ul>
				</div>
			)}

			<Card className="border-dashed">
				<CardContent className="flex gap-3 py-4">
					<CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
					<p className="text-muted-foreground text-sm">
						Every answer is marked by the AI tutor against a model answer, so it
						judges your reasoning rather than a matching string. Your review
						shows each question with your answer, the model answer and why —
						and every attempt is kept in{" "}
						<Link
							href="/dashboard/organization/report"
							className="text-primary hover:underline"
						>
							Progress Report
						</Link>
						.
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
