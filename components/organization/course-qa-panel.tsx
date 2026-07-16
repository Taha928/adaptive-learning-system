"use client";

import {
	ArrowRightIcon,
	BookOpenIcon,
	CheckCircle2Icon,
	SparklesIcon,
	Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/hooks/use-session";
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

const COUNT_OPTIONS = [5, 9, 12, 15, 20];

const DIFFICULTY_OPTIONS = [
	{
		value: "adaptive",
		label: "Adaptive — follows your answers",
		hint: "Starts gently and moves with you",
	},
	{ value: "easy", label: "Easy only", hint: "Recall and definitions" },
	{ value: "medium", label: "Medium only", hint: "Apply and explain" },
	{ value: "hard", label: "Hard only", hint: "Analyse and reason" },
] as const;

type QaDifficulty = (typeof DIFFICULTY_OPTIONS)[number]["value"];

const ALL_TOPICS = "__all__";

/**
 * Written revision across a course. Every question is typed — no multiple
 * choice — and marked in front of the student as they go.
 *
 * Runs on the same adaptive engine as the Quizzes module: questions are chosen
 * by the student's answers, and a session updates topic mastery exactly as an
 * assessment does. Pinning a difficulty narrows the pool to one level; the
 * engine still adapts which topic to ask about.
 */
export function CourseQaPanel() {
	const router = useRouter();
	const utils = trpc.useUtils();
	const { user } = useSession();
	const [courseId, setCourseId] = useState<string>("");
	const [topicId, setTopicId] = useState<string>(ALL_TOPICS);
	const [numQuestions, setNumQuestions] = useState<number>(9);
	const [difficulty, setDifficulty] = useState<QaDifficulty>("adaptive");

	const { data: courseData, isPending } =
		trpc.organization.course.list.useQuery({});
	const courses = courseData?.courses ?? [];

	const { data: topicData } = trpc.organization.quiz.listTopics.useQuery(
		{ courseId: courseId || undefined },
		{ enabled: Boolean(courseId) },
	);
	const topics = useMemo(() => topicData?.topics ?? [], [topicData]);

	// Previously generated revision sets, filtered server-side by purpose. A
	// course-wide adaptive ASSESSMENT is also topic-less, so telling the two
	// apart on shape used to surface assessments in this list.
	const { data: setData } = trpc.organization.quiz.list.useQuery(
		{ courseId: courseId || undefined, purpose: "revision" },
		{ enabled: Boolean(courseId) },
	);
	const revisionSets = setData?.quizzes ?? [];

	const generateMutation = trpc.organization.quiz.generateCourseQA.useMutation({
		onSuccess: (res) => {
			const trimmed = res.numQuestions < res.requestedQuestions;
			toast.success(`${res.numQuestions} questions ready`, {
				description: trimmed
					? `Your material supported ${res.numQuestions} rather than ${res.requestedQuestions}.`
					: `Drawn from a pool of ${res.poolSize} across ${res.topicCount} topic${res.topicCount === 1 ? "" : "s"}.`,
			});
			utils.organization.quiz.list.invalidate();
			router.push(`/dashboard/organization/quizzes/${res.quizId}/take`);
		},
		onError: (error) =>
			toast.error(error.message || "Could not build revision set"),
	});

	const deleteMutation = trpc.organization.quiz.delete.useMutation({
		onSuccess: () => {
			toast.success("Session deleted");
			utils.organization.quiz.list.invalidate();
		},
		onError: (error) => toast.error(error.message || "Could not delete"),
	});

	if (isPending) return <CenteredSpinner />;

	const selectedCourse = courses.find((c) => c.id === courseId);
	const topicCount = selectedCourse?._count.topics ?? 0;
	const scopedTopicCount = topicId === ALL_TOPICS ? topicCount : 1;

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<BookOpenIcon className="size-5 text-primary" />
						Revise by writing
					</CardTitle>
					<CardDescription>
						The tutor asks questions from your material and you answer in your
						own words — no multiple choice. Each answer is marked against a model
						answer straight away, so you see where you were right and where you
						slipped while it still matters. What it asks next follows what you're
						finding hard.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
						<div className="space-y-1.5">
							<Label htmlFor="qa-course">Course</Label>
							<Select
								value={courseId}
								onValueChange={(v) => {
									setCourseId(v);
									setTopicId(ALL_TOPICS);
								}}
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
							<Label htmlFor="qa-topic">Focus</Label>
							<Select
								value={topicId}
								onValueChange={setTopicId}
								disabled={generateMutation.isPending || !courseId}
							>
								<SelectTrigger id="qa-topic">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={ALL_TOPICS}>
										Whole course{topicCount ? ` (${topicCount} topics)` : ""}
									</SelectItem>
									{topics.map((t) => (
										<SelectItem key={t.id} value={t.id}>
											{t.title}
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
									<strong>{numQuestions}</strong> written questions across{" "}
									<strong>
										{scopedTopicCount} topic{scopedTopicCount === 1 ? "" : "s"}
									</strong>
									{difficulty === "adaptive" ? (
										<> · difficulty follows your answers</>
									) : (
										<>
											{" "}
											· all{" "}
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
								generateMutation.mutate({
									courseId,
									topicId: topicId === ALL_TOPICS ? null : topicId,
									numQuestions,
									difficulty,
								})
							}
							loading={generateMutation.isPending}
							disabled={
								generateMutation.isPending || !courseId || topicCount === 0
							}
						>
							<SparklesIcon className="size-4" />
							Start Questions &amp; Answers
						</Button>
					</div>

					{generateMutation.isPending && (
						<p className="text-muted-foreground text-xs">
							Writing questions from your material… about 20–40 seconds.
						</p>
					)}
				</CardContent>
			</Card>

			{courseId && revisionSets.length > 0 && (
				<div className="space-y-3">
					<h3 className="font-medium">Your sessions</h3>
					<ul className="space-y-2">
						{revisionSets.map((q) => {
							const best = q.attempts[0];
							// Only your own sessions are yours to remove. The server
							// enforces this too — this just avoids offering a button that
							// would fail.
							const isMine = q.createdById === user?.id;
							return (
								<li
									key={q.id}
									className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
								>
									<div className="min-w-0">
										<p className="truncate font-medium text-sm">{q.title}</p>
										<p className="text-muted-foreground text-xs">
											{q._count.questions} questions in the pool
										</p>
									</div>
									<div className="flex items-center gap-2">
										{best ? (
											<Link
												href={`/dashboard/organization/quizzes/attempts/${best.id}`}
												className="inline-flex items-center gap-2 hover:underline"
											>
												<Badge variant="outline">{best.percentage ?? 0}%</Badge>
												<span className="text-muted-foreground text-xs">
													Review answers
												</span>
											</Link>
										) : (
											<Badge variant="outline">Not started</Badge>
										)}
										<Button asChild size="sm" variant="outline">
											<Link
												href={`/dashboard/organization/quizzes/${q.id}/take`}
											>
												{best ? "Revise again" : "Start Questions & Answers"}
												<ArrowRightIcon className="size-3.5" />
											</Link>
										</Button>
										{isMine && (
											<Button
												size="icon-sm"
												variant="ghost"
												aria-label={`Delete ${q.title}`}
												loading={
													deleteMutation.isPending &&
													deleteMutation.variables?.quizId === q.id
												}
												onClick={() => {
													if (
														window.confirm(
															`Delete “${q.title}”? Your answers and score for this session go with it.`,
														)
													) {
														deleteMutation.mutate({ quizId: q.id });
													}
												}}
											>
												<Trash2Icon className="size-3.5 text-muted-foreground" />
											</Button>
										)}
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
						judges your reasoning rather than a matching string. Each session
						updates your topic mastery, so what you revise here shows up in{" "}
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
