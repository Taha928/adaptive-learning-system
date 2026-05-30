"use client";

import {
	CalendarIcon,
	CheckCircle2Icon,
	CircleIcon,
	ListChecksIcon,
	SparklesIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CenteredSpinner } from "@/components/ui/custom/centered-spinner";
import { Input } from "@/components/ui/input";
import { capitalize } from "@/lib/utils";
import { trpc } from "@/trpc/client";

function formatDate(date: Date | string | null | undefined): string | null {
	if (!date) return null;
	const d = typeof date === "string" ? new Date(date) : date;
	return d.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

export function StudyPlanView() {
	const utils = trpc.useUtils();
	const [goal, setGoal] = useState("");

	const { data, isPending } = trpc.organization.studyPlan.list.useQuery({});

	const generateMutation = trpc.organization.studyPlan.generatePlan.useMutation(
		{
			onSuccess: () => {
				toast.success("Study plan generated");
				setGoal("");
				utils.organization.studyPlan.list.invalidate();
			},
			onError: (error) =>
				toast.error(error.message || "Failed to generate study plan"),
		},
	);

	const completeMutation =
		trpc.organization.studyPlan.markItemComplete.useMutation({
			onSuccess: () => {
				utils.organization.studyPlan.list.invalidate();
			},
			onError: (error) => toast.error(error.message || "Failed to update item"),
		});

	const plans = data?.plans ?? [];

	const handleGenerate = () => {
		generateMutation.mutate({ goal: goal.trim() || undefined });
	};

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<Input
					placeholder="Optional: what do you want to achieve?"
					value={goal}
					onChange={(e) => setGoal(e.target.value)}
					className="sm:max-w-md"
					disabled={generateMutation.isPending}
				/>
				<Button
					onClick={handleGenerate}
					loading={generateMutation.isPending}
					disabled={generateMutation.isPending}
				>
					<SparklesIcon className="size-4" />
					Generate Study Plan
				</Button>
			</div>

			{isPending ? (
				<CenteredSpinner />
			) : plans.length === 0 ? (
				<div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
					<ListChecksIcon className="size-8 text-muted-foreground" />
					<div>
						<p className="font-medium">No study plans yet</p>
						<p className="text-muted-foreground text-sm">
							Generate a personalised plan and the tutor will prioritise your
							weakest topics first.
						</p>
					</div>
				</div>
			) : (
				<div className="space-y-6">
					{plans.map((plan) => {
						const completed = plan.items.filter(
							(i) => i.status === "completed",
						).length;
						const total = plan.items.length;
						return (
							<Card key={plan.id}>
								<CardHeader>
									<div className="flex flex-wrap items-center justify-between gap-2">
										<CardTitle>{plan.title}</CardTitle>
										<div className="flex items-center gap-2">
											<Badge variant="secondary">
												{capitalize(plan.status)}
											</Badge>
											<Badge variant="outline">
												{completed}/{total} done
											</Badge>
										</div>
									</div>
									{plan.goal && (
										<p className="text-muted-foreground text-sm">{plan.goal}</p>
									)}
								</CardHeader>
								<CardContent>
									<ul className="divide-y rounded-lg border">
										{plan.items.map((item) => {
											const isDone = item.status === "completed";
											const due = formatDate(item.dueDate);
											return (
												<li
													key={item.id}
													className="flex items-center justify-between gap-3 px-4 py-3"
												>
													<div className="flex min-w-0 items-center gap-3">
														<button
															type="button"
															onClick={() =>
																!isDone &&
																completeMutation.mutate({ itemId: item.id })
															}
															disabled={isDone || completeMutation.isPending}
															className="shrink-0"
															aria-label={
																isDone ? "Completed" : "Mark complete"
															}
														>
															{isDone ? (
																<CheckCircle2Icon className="size-5 text-green-600" />
															) : (
																<CircleIcon className="size-5 text-muted-foreground hover:text-foreground" />
															)}
														</button>
														<div className="min-w-0">
															<p
																className={
																	isDone
																		? "truncate text-muted-foreground text-sm line-through"
																		: "truncate font-medium text-sm"
																}
															>
																{item.title}
															</p>
															{item.topicId && (
																<p className="text-muted-foreground text-xs">
																	Linked topic
																</p>
															)}
														</div>
													</div>
													{due && (
														<span className="inline-flex shrink-0 items-center gap-1 text-muted-foreground text-xs">
															<CalendarIcon className="size-3.5" />
															{due}
														</span>
													)}
												</li>
											);
										})}
									</ul>
								</CardContent>
							</Card>
						);
					})}
				</div>
			)}
		</div>
	);
}
