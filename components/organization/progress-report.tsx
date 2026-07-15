"use client";

import { PrinterIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CenteredSpinner } from "@/components/ui/custom/centered-spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useSession } from "@/hooks/use-session";
import { trpc } from "@/trpc/client";

function formatDate(value: string | Date | null): string {
	if (!value) return "—";
	const d = typeof value === "string" ? new Date(value) : value;
	return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

const BAR_TONE = {
	good: "bg-emerald-600",
	mid: "bg-amber-500",
	bad: "bg-rose-600",
} as const;

/** One topic with a mastery bar — the bar carries the comparison, the number the detail. */
function TopicBar({
	title,
	mastery,
	tone,
}: {
	title: string;
	mastery: number;
	tone: keyof typeof BAR_TONE;
}) {
	const pct = Math.round(mastery * 100);
	return (
		<div className="space-y-1">
			<div className="flex items-baseline justify-between gap-3">
				<span className="truncate text-sm">{title}</span>
				<span className="shrink-0 font-medium text-sm tabular-nums">
					{pct}%
				</span>
			</div>
			<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
				<div
					className={`h-full rounded-full ${BAR_TONE[tone]}`}
					style={{ width: `${Math.max(pct, 2)}%` }}
				/>
			</div>
		</div>
	);
}

export function ProgressReport({
	organizationName,
}: {
	organizationName: string;
}) {
	const { user } = useSession();
	const overviewQuery = trpc.organization.analytics.getOverview.useQuery();
	const masteryQuery = trpc.organization.analytics.getTopicMastery.useQuery();
	const weakQuery = trpc.organization.analytics.getWeakTopics.useQuery();
	const attemptsQuery = trpc.organization.quiz.listMyAttempts.useQuery({});

	if (
		overviewQuery.isPending ||
		masteryQuery.isPending ||
		weakQuery.isPending ||
		attemptsQuery.isPending
	) {
		return <CenteredSpinner />;
	}

	const overview = overviewQuery.data;
	const mastery = masteryQuery.data ?? [];
	const weak = weakQuery.data ?? [];
	const attempts = attemptsQuery.data?.attempts ?? [];

	// Split mastery into bands so the report answers the two questions a student
	// actually has: what am I good at, and what must I fix? Thresholds match
	// nextDifficulty() in lib/ai/tutor.ts (0.5 / 0.8) so the report agrees with
	// the difficulty the tutor is actually serving.
	const strong = mastery
		.filter((m) => m.mastery >= 0.8)
		.sort((a, b) => b.mastery - a.mastery);
	const developing = mastery
		.filter((m) => m.mastery >= 0.5 && m.mastery < 0.8)
		.sort((a, b) => b.mastery - a.mastery);
	const needsWork = mastery
		.filter((m) => m.mastery < 0.5)
		.sort((a, b) => a.mastery - b.mastery);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between gap-3 print:hidden">
				<p className="text-muted-foreground text-sm">
					Use “Print / Save as PDF” to export this report.
				</p>
				<Button onClick={() => window.print()}>
					<PrinterIcon className="size-4" />
					Print / Save as PDF
				</Button>
			</div>

			<div className="rounded-lg border p-6 print:border-0 print:p-0">
				<header className="mb-6 border-b pb-4">
					<h1 className="font-bold text-2xl">Student Progress Report</h1>
					<p className="text-muted-foreground text-sm">
						{organizationName} · {user?.name ?? user?.email ?? "Student"} ·{" "}
						{new Date().toLocaleDateString(undefined, { dateStyle: "long" })}
					</p>
				</header>

				<section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
					<div>
						<p className="text-muted-foreground text-xs">Courses</p>
						<p className="font-semibold text-xl">
							{overview?.courseCount ?? 0}
						</p>
					</div>
					<div>
						<p className="text-muted-foreground text-xs">Quiz attempts</p>
						<p className="font-semibold text-xl">
							{overview?.attemptCount ?? 0}
						</p>
					</div>
					<div>
						<p className="text-muted-foreground text-xs">Average score</p>
						<p className="font-semibold text-xl">
							{overview?.averageScore != null
								? `${overview.averageScore}%`
								: "—"}
						</p>
					</div>
					<div>
						<p className="text-muted-foreground text-xs">Weak topics</p>
						<p className="font-semibold text-xl">{weak.length}</p>
					</div>
				</section>

				{mastery.length === 0 ? (
					<section className="mb-6">
						<h2 className="mb-2 font-semibold">Topic mastery</h2>
						<p className="text-muted-foreground text-sm">
							No mastery data yet — take a quiz and your strengths and weak
							spots will appear here.
						</p>
					</section>
				) : (
					<>
						{/* The headline answer: where to spend your next hour. */}
						<section className="mb-6 grid gap-4 sm:grid-cols-2">
							<div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-4 print:bg-transparent">
								<h2 className="mb-1 flex items-center gap-2 font-semibold text-rose-700 dark:text-rose-400">
									<TrendingDownIcon className="size-4" />
									Needs improvement
								</h2>
								<p className="mb-3 text-muted-foreground text-xs">
									Below 50% mastery — start here.
								</p>
								{needsWork.length === 0 ? (
									<p className="text-muted-foreground text-sm">
										Nothing below 50%. Good position to be in.
									</p>
								) : (
									<ul className="space-y-2">
										{needsWork.map((m) => (
											<li key={m.topicId}>
												<TopicBar
													title={m.topicTitle}
													mastery={m.mastery}
													tone="bad"
												/>
											</li>
										))}
									</ul>
								)}
							</div>

							<div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4 print:bg-transparent">
								<h2 className="mb-1 flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400">
									<TrendingUpIcon className="size-4" />
									Your strengths
								</h2>
								<p className="mb-3 text-muted-foreground text-xs">
									80% mastery or above — you've got these.
								</p>
								{strong.length === 0 ? (
									<p className="text-muted-foreground text-sm">
										No topic is above 80% yet. Keep practising and they'll
										land here.
									</p>
								) : (
									<ul className="space-y-2">
										{strong.map((m) => (
											<li key={m.topicId}>
												<TopicBar
													title={m.topicTitle}
													mastery={m.mastery}
													tone="good"
												/>
											</li>
										))}
									</ul>
								)}
							</div>
						</section>

						{developing.length > 0 && (
							<section className="mb-6">
								<h2 className="mb-1 font-semibold">Getting there</h2>
								<p className="mb-3 text-muted-foreground text-xs">
									Between 50% and 80% — solid, not yet mastered.
								</p>
								<ul className="grid gap-2 sm:grid-cols-2">
									{developing.map((m) => (
										<li key={m.topicId}>
											<TopicBar
												title={m.topicTitle}
												mastery={m.mastery}
												tone="mid"
											/>
										</li>
									))}
								</ul>
							</section>
						)}
					</>
				)}

				<section>
					<h2 className="mb-2 font-semibold">Quiz attempts</h2>
					{attempts.length === 0 ? (
						<p className="text-muted-foreground text-sm">No attempts yet.</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Quiz</TableHead>
									<TableHead>Score</TableHead>
									<TableHead>Result</TableHead>
									<TableHead>Date</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{attempts.map((a) => (
									<TableRow key={a.id}>
										<TableCell>{a.quiz.title}</TableCell>
										<TableCell>{a.percentage ?? 0}%</TableCell>
										<TableCell>
											<Badge variant={a.passed ? "default" : "destructive"}>
												{a.passed ? "Passed" : "Not passed"}
											</Badge>
										</TableCell>
										<TableCell>{formatDate(a.submittedAt)}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</section>
			</div>
		</div>
	);
}
