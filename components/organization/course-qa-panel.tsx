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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/trpc/client";

const PER_TOPIC_OPTIONS = [1, 2, 3, 5];

/**
 * Q&A practice across a whole course: one question set drawn from every topic,
 * answered and marked with the same engine as quizzes (exact match for MCQ and
 * true/false, AI grading for written answers), then reviewed question by
 * question.
 */
export function CourseQaPanel() {
	const router = useRouter();
	const utils = trpc.useUtils();
	const [courseId, setCourseId] = useState<string>("");
	const [perTopic, setPerTopic] = useState<number>(2);

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
			toast.success(`Q&A ready — covering all ${res.topicCount} topics`);
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
						Practise across a whole course
					</CardTitle>
					<CardDescription>
						Get questions drawn from every topic in a course, answer them, and
						see exactly which ones you got right and where you slipped — with an
						explanation for each.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
						<Select
							value={courseId}
							onValueChange={setCourseId}
							disabled={generateMutation.isPending || courses.length === 0}
						>
							<SelectTrigger className="sm:w-[240px]">
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

						<Select
							value={String(perTopic)}
							onValueChange={(v) => setPerTopic(Number(v))}
							disabled={generateMutation.isPending}
						>
							<SelectTrigger className="sm:w-[190px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{PER_TOPIC_OPTIONS.map((n) => (
									<SelectItem key={n} value={String(n)}>
										{n} question{n === 1 ? "" : "s"} per topic
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						<Button
							onClick={() =>
								generateMutation.mutate({ courseId, questionsPerTopic: perTopic })
							}
							loading={generateMutation.isPending}
							disabled={
								generateMutation.isPending || !courseId || topicCount === 0
							}
							className="sm:ml-auto"
						>
							<SparklesIcon className="size-4" />
							Generate Q&A
						</Button>
					</div>

					{courseId && topicCount === 0 && (
						<p className="text-muted-foreground text-sm">
							This course has no topics yet — add a material and use “Generate
							Topics” first.
						</p>
					)}

					{courseId && topicCount > 0 && (
						<p className="text-muted-foreground text-sm">
							Covers all <strong>{topicCount}</strong> topics ·{" "}
							<strong>{topicCount * perTopic}</strong> questions ·{" "}
							{generateMutation.isPending
								? "building your set…"
								: "takes about 15–30 seconds"}
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
						Multiple-choice and true/false are marked instantly; written answers
						are marked by the AI tutor, which explains why your answer did or
						didn't work. Your review shows every question with the correct answer
						beside yours.
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
