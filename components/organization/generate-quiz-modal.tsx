"use client";

import NiceModal, { type NiceModalHocProps } from "@ebay/nice-modal-react";
import { QuizDifficulty } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { capitalize } from "@/lib/utils";
import { trpc } from "@/trpc/client";

export type GenerateQuizModalProps = NiceModalHocProps & {
	courseId?: string;
};

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
		const [difficulty, setDifficulty] = useState<QuizDifficulty>(
			QuizDifficulty.medium,
		);

		const generateMutation =
			trpc.organization.quiz.generateFromTopic.useMutation({
				onSuccess: (result) => {
					toast.success("Quiz generated");
					utils.organization.quiz.list.invalidate();
					modal.handleClose();
					router.push(`/dashboard/organization/quizzes/${result.quizId}/take`);
				},
				onError: (error) =>
					toast.error(error.message || "Failed to generate quiz"),
			});

		const topics = data?.topics ?? [];

		const handleGenerate = () => {
			if (!topicId) {
				toast.error("Select a topic first");
				return;
			}
			generateMutation.mutate({ topicId, numQuestions, difficulty });
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
						<SheetTitle>Generate Quiz from Topic</SheetTitle>
						<SheetDescription>
							The AI tutor builds an adaptive quiz from the topic's material.
						</SheetDescription>
					</SheetHeader>

					<div className="space-y-4 px-6 py-4">
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

								<div className="grid grid-cols-2 gap-4">
									<Field>
										<Label>Questions</Label>
										<Input
											type="number"
											min={1}
											max={15}
											value={numQuestions}
											onChange={(e) =>
												setNumQuestions(
													Math.max(
														1,
														Math.min(15, Number(e.target.value) || 1),
													),
												)
											}
										/>
									</Field>
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
								</div>
							</>
						)}
					</div>

					<SheetFooter className="flex-row justify-end gap-2 border-t">
						<Button
							type="button"
							variant="outline"
							onClick={modal.handleClose}
							disabled={generateMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							type="button"
							onClick={handleGenerate}
							loading={generateMutation.isPending}
							disabled={topics.length === 0}
						>
							Generate Quiz
						</Button>
					</SheetFooter>
				</SheetContent>
			</Sheet>
		);
	},
);
