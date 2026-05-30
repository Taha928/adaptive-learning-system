"use client";

import { AlertTriangleIcon } from "lucide-react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Line,
	LineChart,
	XAxis,
	YAxis,
} from "recharts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { CenteredSpinner } from "@/components/ui/custom/centered-spinner";
import { trpc } from "@/trpc/client";

const masteryChartConfig = {
	mastery: {
		label: "Mastery %",
		color: "var(--chart-1)",
	},
} satisfies ChartConfig;

const accuracyChartConfig = {
	percentage: {
		label: "Accuracy %",
		color: "var(--chart-2)",
	},
} satisfies ChartConfig;

function formatDateLabel(iso: string): string {
	const date = new Date(iso);
	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}

export function TutorAnalytics(): React.JSX.Element {
	const overviewQuery = trpc.organization.analytics.getOverview.useQuery();
	const masteryQuery = trpc.organization.analytics.getTopicMastery.useQuery();
	const trendQuery = trpc.organization.analytics.getAccuracyTrend.useQuery();
	const weakQuery = trpc.organization.analytics.getWeakTopics.useQuery();

	const isLoading =
		overviewQuery.isPending ||
		masteryQuery.isPending ||
		trendQuery.isPending ||
		weakQuery.isPending;

	if (isLoading) {
		return <CenteredSpinner />;
	}

	const overview = overviewQuery.data;
	const weakTopics = weakQuery.data ?? [];

	const masteryData = (masteryQuery.data ?? []).map((t) => ({
		topicTitle: t.topicTitle,
		mastery: Number((t.mastery * 100).toFixed(1)),
	}));

	const trendData = (trendQuery.data ?? []).map((point) => ({
		date: formatDateLabel(point.date),
		percentage: point.percentage,
	}));

	return (
		<div className="space-y-6">
			{weakTopics.length > 0 && (
				<Alert variant="destructive">
					<AlertTriangleIcon className="size-4" />
					<AlertTitle>
						{weakTopics.length === 1
							? "1 topic needs attention"
							: `${weakTopics.length} topics need attention`}
					</AlertTitle>
					<AlertDescription>
						<span>
							Mastery is below 60% for:{" "}
							{weakTopics
								.slice(0, 5)
								.map((t) => `${t.topicTitle} (${Math.round(t.mastery * 100)}%)`)
								.join(", ")}
							{weakTopics.length > 5
								? `, and ${weakTopics.length - 5} more`
								: ""}
							.
						</span>
					</AlertDescription>
				</Alert>
			)}

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<Card>
					<CardHeader>
						<CardDescription>Courses</CardDescription>
						<CardTitle className="text-2xl">
							{overview?.courseCount ?? 0}
						</CardTitle>
					</CardHeader>
				</Card>
				<Card>
					<CardHeader>
						<CardDescription>Quizzes</CardDescription>
						<CardTitle className="text-2xl">
							{overview?.quizCount ?? 0}
						</CardTitle>
					</CardHeader>
				</Card>
				<Card>
					<CardHeader>
						<CardDescription>
							{overview?.scope === "self" ? "My attempts" : "Quiz attempts"}
						</CardDescription>
						<CardTitle className="text-2xl">
							{overview?.attemptCount ?? 0}
						</CardTitle>
					</CardHeader>
				</Card>
				<Card>
					<CardHeader>
						<CardDescription>Average score</CardDescription>
						<CardTitle className="text-2xl">
							{overview?.averageScore != null
								? `${overview.averageScore}%`
								: "—"}
						</CardTitle>
					</CardHeader>
				</Card>
			</div>

			<div className="grid gap-4 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Topic mastery</CardTitle>
						<CardDescription>Latest mastery score per topic</CardDescription>
					</CardHeader>
					<CardContent>
						{masteryData.length === 0 ? (
							<p className="py-12 text-center text-muted-foreground text-sm">
								No mastery data yet. Take a quiz to start tracking progress.
							</p>
						) : (
							<ChartContainer config={masteryChartConfig}>
								<BarChart accessibilityLayer data={masteryData}>
									<CartesianGrid vertical={false} />
									<XAxis
										dataKey="topicTitle"
										tickLine={false}
										axisLine={false}
										tickMargin={8}
										tickFormatter={(value: string) =>
											value.length > 12 ? `${value.slice(0, 12)}…` : value
										}
									/>
									<YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
									<ChartTooltip content={<ChartTooltipContent />} />
									<Bar
										dataKey="mastery"
										fill="var(--color-mastery)"
										radius={4}
									/>
								</BarChart>
							</ChartContainer>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Accuracy trend</CardTitle>
						<CardDescription>Recent graded quiz attempts</CardDescription>
					</CardHeader>
					<CardContent>
						{trendData.length === 0 ? (
							<p className="py-12 text-center text-muted-foreground text-sm">
								No graded attempts yet.
							</p>
						) : (
							<ChartContainer config={accuracyChartConfig}>
								<LineChart
									accessibilityLayer
									data={trendData}
									margin={{ left: 12, right: 12 }}
								>
									<CartesianGrid vertical={false} />
									<XAxis
										dataKey="date"
										tickLine={false}
										axisLine={false}
										tickMargin={8}
									/>
									<YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
									<ChartTooltip content={<ChartTooltipContent />} />
									<Line
										dataKey="percentage"
										type="monotone"
										stroke="var(--color-percentage)"
										strokeWidth={2}
										dot={false}
									/>
								</LineChart>
							</ChartContainer>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
