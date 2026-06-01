"use client";

import { CheckCircle2Icon, XCircleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type QuizReviewItem = {
	questionId: string;
	prompt: string;
	options: string[];
	yourAnswer: string | null;
	correctAnswer: string;
	explanation: string | null;
	isCorrect: boolean;
	/** AI tutor feedback for free-response (short/long/image) answers. */
	aiFeedback?: string | null;
};

/**
 * Renders a graded quiz's per-question review: correct/incorrect marker, the
 * correct option highlighted, the student's pick, and the explanation. Shared
 * between the live results screen and the re-openable attempt result page.
 */
export function QuizReviewItems({ results }: { results: QuizReviewItem[] }) {
	return (
		<div className="space-y-3">
			{results.map((item, index) => (
				<Card
					key={item.questionId}
					className={cn(
						"border-l-4",
						item.isCorrect ? "border-l-emerald-500" : "border-l-rose-500",
					)}
				>
					<CardHeader>
						<div className="flex items-start gap-2">
							{item.isCorrect ? (
								<CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-emerald-600" />
							) : (
								<XCircleIcon className="mt-0.5 size-5 shrink-0 text-rose-600" />
							)}
							<CardTitle className="text-base">
								{index + 1}. {item.prompt}
							</CardTitle>
						</div>
					</CardHeader>
					<CardContent className="space-y-2">
						{item.options.length > 0 ? (
							<div className="space-y-1.5">
								{item.options.map((option) => {
									const isCorrectOption =
										option.trim().toLowerCase() ===
										item.correctAnswer.trim().toLowerCase();
									const isYourPick =
										option.trim().toLowerCase() ===
										(item.yourAnswer ?? "").trim().toLowerCase();
									return (
										<div
											key={option}
											className={cn(
												"flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm",
												isCorrectOption &&
													"border-emerald-500/50 bg-emerald-500/10",
												isYourPick &&
													!isCorrectOption &&
													"border-rose-500/50 bg-rose-500/10",
											)}
										>
											<span>{option}</span>
											<span className="flex items-center gap-1.5 text-xs">
												{isYourPick && (
													<Badge variant="outline" className="text-xs">
														Your answer
													</Badge>
												)}
												{isCorrectOption && (
													<Badge className="bg-emerald-600 text-xs text-white">
														Correct
													</Badge>
												)}
											</span>
										</div>
									);
								})}
							</div>
						) : (
							<div className="space-y-1 text-sm">
								<p>
									<span className="text-muted-foreground">Your answer: </span>
									<span
										className={
											item.isCorrect ? "text-emerald-600" : "text-rose-600"
										}
									>
										{item.yourAnswer || "—"}
									</span>
								</p>
								{!item.isCorrect && (
									<p>
										<span className="text-muted-foreground">
											Correct answer:{" "}
										</span>
										<span className="text-emerald-600">
											{item.correctAnswer}
										</span>
									</p>
								)}
							</div>
						)}
						{item.aiFeedback && (
							<p className="rounded-md bg-primary/5 px-3 py-2 text-muted-foreground text-sm">
								<span className="font-medium text-foreground">
									Tutor feedback:{" "}
								</span>
								{item.aiFeedback}
							</p>
						)}
						{item.explanation && (
							<p className="rounded-md bg-muted px-3 py-2 text-muted-foreground text-sm">
								<span className="font-medium text-foreground">
									Explanation:{" "}
								</span>
								{item.explanation}
							</p>
						)}
					</CardContent>
				</Card>
			))}
		</div>
	);
}
