"use client";

import NiceModal, { type NiceModalHocProps } from "@ebay/nice-modal-react";
import { QuizDifficulty } from "@prisma/client";
import { SparklesIcon, SlidersHorizontalIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CenteredSpinner } from "@/components/ui/custom/centered-spinner";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useEnhancedModal } from "@/hooks/use-enhanced-modal";
import { capitalize, cn } from "@/lib/utils";
import { trpc } from "@/trpc/client";

export type GenerateQuizModalProps = NiceModalHocProps & {
	courseId?: string;
};

/** Quiz length presets. Independent of assessment mode. */
const QUIZ_PRESETS = [
	{ label: "Quick Quiz", count: 5, hint: "5 questions · ~2–3 min" },
	{ label: "Standard Quiz", count: 10, hint: "10 questions · normal practice" },
	{
		label: "Practice Test",
		count: 20,
		hint: "20 questions · deeper assessment",
	},
] as const;

type AssessmentMode = "fixed" | "adaptive";

const MODES: {
	value: AssessmentMode;
	label: string;
	hint: string;
	icon: React.ComponentType<{ className?: string }>;
}[] = [
	{
		value: "fixed",
		label: "Fixed Difficulty",
		hint: "Every question at one level you choose",
		icon: SlidersHorizontalIcon,
	},
	{
		value: "adaptive",
		label: "Adaptive Assessment",
		hint: "The level is chosen for you as you go",
		icon: SparklesIcon,
	},
];

/** Adaptive needs enough questions for the ability search to converge. */
const MIN_ADAPTIVE_QUESTIONS = 5;

export const GenerateQuizModal = NiceModal.create<GenerateQuizModalProps>(
	({ courseId }) => {
		const modal = useEnhancedModal();
		const router = useRouter();
		const utils = trpc.useUtils();

		const { data, isPending } = trpc.organization.quiz.listTopics.useQuery({
			courseId,
		});

		const [topicId, setTopicId] = useState<string>("");
		const [numQuestions, setNumQuestions] = useState<number>(5);
		const [mode, setMode] = useState<AssessmentMode>("fixed");
		const [difficulty, setDifficulty] = useState<QuizDifficulty>(
			QuizDifficulty.medium,
		);
		// Adaptive only: an assessment that may vary its TOPIC needs more than one
		// to choose between, so it defaults to the whole course.
		const [wholeCourse, setWholeCourse] = useState(true);

		const topics = useMemo(() => data?.topics ?? [], [data]);
		const selectedTopic = topics.find((t) => t.id === topicId);

		const siblingCount = useMemo(
			() =>
				selectedTopic
					? topics.filter((t) => t.courseId === selectedTopic.courseId).length
					: 0,
			[topics, selectedTopic],
		);

		const onGenerated = (quizId: string) => {
			utils.organization.quiz.list.invalidate();
			modal.handleClose();
			router.push(`/dashboard/organization/quizzes/${quizId}/take`);
		};

		const fixedMutation = trpc.organization.quiz.generateFromTopic.useMutation({
			onSuccess: (result) => {
				toast.success("Quiz generated");
				onGenerated(result.quizId);
			},
			onError: (error) =>
				toast.error(error.message || "Failed to generate quiz"),
		});

		const adaptiveMutation = trpc.organization.quiz.generateAdaptive.useMutation({
			onSuccess: (result) => {
				const trimmed = result.numQuestions < result.requestedQuestions;
				toast.success(
					`Adaptive assessment ready — ${result.numQuestions} questions drawn from a pool of ${result.poolSize}`,
					trimmed
						? {
								description: `Your material supported ${result.numQuestions} rather than ${result.requestedQuestions}; a larger pool is needed to keep adapting to the end.`,
							}
						: undefined,
				);
				onGenerated(result.quizId);
			},
			onError: (error) =>
				toast.error(error.message || "Failed to build assessment"),
		});

		const isGenerating = fixedMutation.isPending || adaptiveMutation.isPending;

		const handleGenerate = () => {
			if (!selectedTopic) {
				toast.error("Select a topic first");
				return;
			}

			if (mode === "fixed") {
				fixedMutation.mutate({ topicId, numQuestions, difficulty });
				return;
			}

			adaptiveMutation.mutate({
				courseId: selectedTopic.courseId,
				topicId: wholeCourse ? null : topicId,
				numQuestions: Math.max(numQuestions, MIN_ADAPTIVE_QUESTIONS),
			});
		};

		return (
			<Sheet
				open={modal.visible}
				onOpenChange={(open) => !open && modal.handleClose()}
			>
				<SheetContent
					className="sm:max-w-lg"
					onAnimationEndCapture={modal.handleAnimationEndCapture}
				>
					<SheetHeader>
						<SheetTitle>Generate Quiz</SheetTitle>
						<SheetDescription>
							The AI tutor builds questions from your topic's material.
						</SheetDescription>
					</SheetHeader>

					<div className="space-y-4 overflow-y-auto px-6 py-4">
						{isPending ? (
							<CenteredSpinner />
						) : topics.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								No topics available. Add materials and topics to a course first.
							</p>
						) : (
							<>
								<Field>
									<Label>Topic</Label>
									<Select value={topicId} onValueChange={setTopicId}>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Select a topic" />
										</SelectTrigger>
										<SelectContent>
											{topics.map((topic) => (
												<SelectItem key={topic.id} value={topic.id}>
													{topic.course?.title
														? `${topic.course.title} — ${topic.title}`
														: topic.title}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>

								<Field>
									<Label>Quiz length</Label>
									<div className="grid grid-cols-3 gap-2">
										{QUIZ_PRESETS.map((preset) => (
											<button
												key={preset.count}
												type="button"
												onClick={() => setNumQuestions(preset.count)}
												className={cn(
													"flex flex-col items-start gap-0.5 rounded-md border p-3 text-left text-sm transition-colors hover:bg-accent",
													numQuestions === preset.count &&
														"border-primary bg-primary/5",
												)}
											>
												<span className="font-medium">{preset.label}</span>
												<span className="text-muted-foreground text-xs">
													{preset.hint}
												</span>
											</button>
										))}
									</div>
								</Field>

								<Field>
									<Label>Questions</Label>
									<Input
										type="number"
										min={mode === "adaptive" ? MIN_ADAPTIVE_QUESTIONS : 1}
										max={20}
										value={numQuestions}
										onChange={(e) =>
											setNumQuestions(
												Math.max(1, Math.min(20, Number(e.target.value) || 1)),
											)
										}
									/>
								</Field>

								<Field>
									<Label>Assessment mode</Label>
									<div className="grid gap-2 sm:grid-cols-2">
										{MODES.map((m) => {
											const active = mode === m.value;
											return (
												<button
													key={m.value}
													type="button"
													onClick={() => setMode(m.value)}
													aria-pressed={active}
													className={cn(
														"flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors hover:bg-accent",
														active && "border-primary bg-primary/5",
													)}
												>
													<span className="flex items-center gap-2 font-medium text-sm">
														<m.icon
															className={cn(
																"size-4",
																active ? "text-primary" : "text-muted-foreground",
															)}
														/>
														{m.label}
													</span>
													<span className="text-muted-foreground text-xs">
														{m.hint}
													</span>
												</button>
											);
										})}
									</div>
								</Field>

								{/* The difficulty selector exists ONLY in fixed mode. In
								    adaptive mode there is nothing to choose — that is the
								    feature, not an omission. */}
								{mode === "fixed" ? (
									<Field>
										<Label>Difficulty</Label>
										<Select
											value={difficulty}
											onValueChange={(value) =>
												setDifficulty(value as QuizDifficulty)
											}
										>
											<SelectTrigger className="w-full">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{Object.values(QuizDifficulty).map((d) => (
													<SelectItem key={d} value={d}>
														{capitalize(d)}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</Field>
								) : (
									<div className="space-y-3 rounded-md border border-primary/40 bg-primary/5 p-3">
										<p className="text-sm">
											This quiz will automatically adjust question difficulty and
											topic focus based on your answers.
										</p>

										{selectedTopic && siblingCount > 1 && (
											<Field>
												<Label className="text-xs">Scope</Label>
												<Select
													value={wholeCourse ? "course" : "topic"}
													onValueChange={(v) => setWholeCourse(v === "course")}
												>
													<SelectTrigger className="w-full bg-background">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="course">
															All {siblingCount} topics in{" "}
															{selectedTopic.course?.title ?? "this course"}
														</SelectItem>
														<SelectItem value="topic">
															Only {selectedTopic.title}
														</SelectItem>
													</SelectContent>
												</Select>
												<p className="text-muted-foreground text-xs">
													Adapting which topic to ask about needs more than one
													topic to choose between.
												</p>
											</Field>
										)}
									</div>
								)}
							</>
						)}
					</div>

					<SheetFooter className="flex-row justify-end gap-2 border-t">
						<Button
							type="button"
							variant="outline"
							onClick={modal.handleClose}
							disabled={isGenerating}
						>
							Cancel
						</Button>
						<Button
							type="button"
							onClick={handleGenerate}
							loading={isGenerating}
							disabled={topics.length === 0 || !topicId}
						>
							{mode === "adaptive" ? "Start adaptive assessment" : "Generate Quiz"}
						</Button>
					</SheetFooter>
				</SheetContent>
			</Sheet>
		);
	},
);
