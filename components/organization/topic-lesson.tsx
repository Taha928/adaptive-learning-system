"use client";

import {
	AlertTriangleIcon,
	ArrowRightIcon,
	BookOpenIcon,
	BrainIcon,
	CheckCircle2Icon,
	KeyRoundIcon,
	LightbulbIcon,
	ListChecksIcon,
	PencilRulerIcon,
	RefreshCwIcon,
	ShapesIcon,
	SparklesIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { MessageResponse } from "@/components/ai/message";
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
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/trpc/client";

/**
 * The "teach" screen. Renders an AI-generated lesson for a single topic and
 * hands the student straight into practice at the end.
 *
 * Markdown bodies go through <MessageResponse> (streamdown) — the same renderer
 * the AI chat uses — which gives KaTeX maths, tables and highlighted code
 * blocks. Mermaid is deliberately not used: the package isn't installed and
 * would fail to render.
 */
export function TopicLesson({ topicId }: { topicId: string }) {
	const utils = trpc.useUtils();
	const [completed, setCompleted] = useState(false);

	const { data, isPending } = trpc.organization.topic.get.useQuery({ topicId });

	const generateMutation = trpc.organization.topic.generateLesson.useMutation({
		onSuccess: (res) => {
			toast.success(res.cached ? "Lesson loaded" : "Lesson ready");
			utils.organization.topic.get.invalidate({ topicId });
		},
		onError: (error) => toast.error(error.message || "Could not build lesson"),
	});

	const completeMutation =
		trpc.organization.topic.markLessonCompleted.useMutation({
			onSuccess: () => {
				setCompleted(true);
				toast.success("Nice work — lesson complete");
				utils.organization.analytics.invalidate();
			},
			onError: (error) => toast.error(error.message || "Could not save"),
		});

	if (isPending) return <CenteredSpinner />;
	if (!data) return null;

	const { topic, lesson, quizId } = data;

	// ----- Not taught yet -----
	if (!lesson) {
		return (
			<div className="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle>{topic.title}</CardTitle>
						{topic.summary && <CardDescription>{topic.summary}</CardDescription>}
					</CardHeader>
				</Card>

				<Card className="border-primary/40 bg-primary/5">
					<CardContent className="flex flex-col items-center gap-4 py-12 text-center">
						<BookOpenIcon className="size-10 text-primary" />
						<div className="space-y-1">
							<p className="font-medium">You haven't been taught this yet</p>
							<p className="mx-auto max-w-md text-muted-foreground text-sm">
								The tutor will build a lesson from your own material —
								explanation, worked examples, an analogy, common mistakes and a
								recap — before you attempt any questions.
							</p>
						</div>
						<Button
							onClick={() => generateMutation.mutate({ topicId, force: false })}
							loading={generateMutation.isPending}
							disabled={generateMutation.isPending}
							size="lg"
						>
							<SparklesIcon className="size-4" />
							Teach me this topic
						</Button>
						{generateMutation.isPending && (
							<p className="text-muted-foreground text-xs">
								Writing your lesson… this takes about 10–20 seconds.
							</p>
						)}
					</CardContent>
				</Card>
			</div>
		);
	}

	// ----- Lesson -----
	return (
		<div className="space-y-6">
			{/* Hook */}
			<Card className="overflow-hidden border-primary/40">
				<div className="h-1 w-full bg-primary" />
				<CardHeader>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<CardTitle className="text-2xl">{topic.title}</CardTitle>
						<div className="flex items-center gap-2">
							{topic.courseTitle && (
								<Badge variant="outline">{topic.courseTitle}</Badge>
							)}
							{topic.estimatedMinutes ? (
								<Badge variant="secondary">~{topic.estimatedMinutes} min</Badge>
							) : null}
						</div>
					</div>
					<CardDescription className="text-base text-foreground/80 italic">
						{lesson.hook}
					</CardDescription>
				</CardHeader>
			</Card>

			{/* Key concepts up front — what you must not leave without */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="flex items-center gap-2 text-base">
						<KeyRoundIcon className="size-4 text-primary" />
						Key concepts
					</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-3 sm:grid-cols-2">
					{lesson.keyConcepts.map((c) => (
						<div key={c.term} className="rounded-lg border bg-muted/40 p-3">
							<p className="font-medium text-sm">{c.term}</p>
							<p className="mt-1 text-muted-foreground text-sm leading-snug">
								{c.meaning}
							</p>
						</div>
					))}
				</CardContent>
			</Card>

			{/* The teaching */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="flex items-center gap-2 text-base">
						<BookOpenIcon className="size-4 text-primary" />
						The explanation
					</CardTitle>
				</CardHeader>
				<CardContent>
					<MessageResponse className="prose-sm">
						{lesson.explanation}
					</MessageResponse>
				</CardContent>
			</Card>

			{/* The figure — schema-enforced, so every lesson has one */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="flex items-center gap-2 text-base">
						<ShapesIcon className="size-4 text-primary" />
						{lesson.figure.caption}
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="overflow-x-auto rounded-lg border bg-muted/50 p-4">
						<pre className="w-max font-mono text-[13px] leading-snug">
							{lesson.figure.diagram}
						</pre>
					</div>
					<p className="flex gap-2 text-muted-foreground text-sm">
						<ArrowRightIcon className="mt-0.5 size-4 shrink-0 text-primary" />
						{lesson.figure.takeaway}
					</p>
				</CardContent>
			</Card>

			{/* Analogy */}
			<Card className="border-amber-500/40 bg-amber-500/5">
				<CardContent className="flex gap-3 py-5">
					<LightbulbIcon className="mt-0.5 size-5 shrink-0 text-amber-500" />
					<div>
						<p className="font-medium text-sm">Think of it like this</p>
						<p className="mt-1 text-muted-foreground text-sm leading-relaxed">
							{lesson.analogy}
						</p>
					</div>
				</CardContent>
			</Card>

			{/* Worked examples */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="flex items-center gap-2 text-base">
						<PencilRulerIcon className="size-4 text-primary" />
						Worked examples
					</CardTitle>
					<CardDescription>Follow the reasoning, not just the answer.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-5">
					{lesson.examples.map((ex, i) => (
						<div key={ex.title} className="space-y-2">
							{i > 0 && <Separator className="mb-5" />}
							<Badge variant="secondary">Example {i + 1}</Badge>
							<p className="font-medium text-sm">{ex.title}</p>
							<MessageResponse className="prose-sm">
								{ex.walkthrough}
							</MessageResponse>
						</div>
					))}
				</CardContent>
			</Card>

			{/* Misconceptions */}
			<Card className="border-rose-500/40 bg-rose-500/5">
				<CardHeader className="pb-3">
					<CardTitle className="flex items-center gap-2 text-base">
						<AlertTriangleIcon className="size-4 text-rose-500" />
						Where students go wrong
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					{lesson.misconceptions.map((m) => (
						<div
							key={m.mistake}
							className="rounded-lg border bg-background p-3 text-sm"
						>
							<p className="text-rose-600 line-through decoration-rose-400/60 dark:text-rose-400">
								{m.mistake}
							</p>
							<p className="mt-1.5 flex gap-2 text-foreground">
								<CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
								<span className="text-muted-foreground">{m.correction}</span>
							</p>
						</div>
					))}
				</CardContent>
			</Card>

			{/* Memory tricks */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="flex items-center gap-2 text-base">
						<BrainIcon className="size-4 text-primary" />
						Make it stick
					</CardTitle>
				</CardHeader>
				<CardContent>
					<ul className="space-y-2">
						{lesson.memoryTricks.map((t) => (
							<li key={t} className="flex gap-2 text-muted-foreground text-sm">
								<span aria-hidden>💡</span>
								{t}
							</li>
						))}
					</ul>
				</CardContent>
			</Card>

			{/* Recap */}
			<Card className="border-emerald-500/40 bg-emerald-500/5">
				<CardHeader className="pb-3">
					<CardTitle className="flex items-center gap-2 text-base">
						<ListChecksIcon className="size-4 text-emerald-600" />
						60-second recap
					</CardTitle>
				</CardHeader>
				<CardContent>
					<ul className="space-y-2">
						{lesson.recap.map((r) => (
							<li key={r} className="flex gap-2 text-sm">
								<CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
								<span className="text-muted-foreground">{r}</span>
							</li>
						))}
					</ul>
				</CardContent>
			</Card>

			{/* Hand off to practice — the whole point of teaching first */}
			<Card>
				<CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
					<div className="space-y-1">
						<p className="font-medium text-sm">
							{completed ? "Lesson complete" : "Finished reading?"}
						</p>
						<p className="text-muted-foreground text-sm">
							{quizId
								? "Now put it into practice — the quiz is built from this same material."
								: "Generate a quiz from this topic when you're ready to practise."}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Button
							variant="outline"
							onClick={() => generateMutation.mutate({ topicId, force: true })}
							loading={generateMutation.isPending}
							disabled={generateMutation.isPending}
						>
							<RefreshCwIcon className="size-4" />
							Re-teach this
						</Button>
						{!completed && (
							<Button
								variant="outline"
								onClick={() => completeMutation.mutate({ topicId })}
								loading={completeMutation.isPending}
								disabled={completeMutation.isPending}
							>
								<CheckCircle2Icon className="size-4" />
								Mark as learnt
							</Button>
						)}
						{quizId ? (
							<Button asChild>
								<Link
									href={`/dashboard/organization/quizzes/${quizId}/take`}
									onClick={() =>
										!completed && completeMutation.mutate({ topicId })
									}
								>
									Practise this topic
									<ArrowRightIcon className="size-4" />
								</Link>
							</Button>
						) : (
							<Button asChild variant="secondary">
								<Link
									href={`/dashboard/organization/courses/${topic.courseId}`}
								>
									Back to course
									<ArrowRightIcon className="size-4" />
								</Link>
							</Button>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
