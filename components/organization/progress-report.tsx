"use client";

import { PrinterIcon } from "lucide-react";
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

				<section className="mb-6">
					<h2 className="mb-2 font-semibold">Topic mastery</h2>
					{mastery.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No mastery data yet.
						</p>
					) : (
						<ul className="space-y-1">
							{mastery.map((m) => (
								<li
									key={m.topicId}
									className="flex items-center justify-between gap-3 text-sm"
								>
									<span>{m.topicTitle}</span>
									<span
										className={
											m.mastery < 0.6 ? "text-rose-600" : "text-emerald-600"
										}
									>
										{Math.round(m.mastery * 100)}%
									</span>
								</li>
							))}
						</ul>
					)}
				</section>

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
