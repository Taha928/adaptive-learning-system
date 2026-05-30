"use client";

import { ClipboardListIcon } from "lucide-react";
import Link from "next/link";
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
import { trpc } from "@/trpc/client";

function formatDate(value: string | Date | null): string {
	if (!value) return "—";
	const d = typeof value === "string" ? new Date(value) : value;
	return d.toLocaleString(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});
}

export function QuizAttemptsTable() {
	const { data, isPending } = trpc.organization.quiz.listMyAttempts.useQuery(
		{},
	);

	const attempts = data?.attempts ?? [];

	if (isPending) return <CenteredSpinner />;

	if (attempts.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
				<ClipboardListIcon className="size-8 text-muted-foreground" />
				<div>
					<p className="font-medium">No attempts yet</p>
					<p className="text-muted-foreground text-sm">
						Take a quiz and your results will show up here.
					</p>
				</div>
				<Button asChild variant="outline">
					<Link href="/dashboard/organization/quizzes">Go to quizzes</Link>
				</Button>
			</div>
		);
	}

	return (
		<div className="rounded-lg border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Quiz</TableHead>
						<TableHead>Course</TableHead>
						<TableHead>Score</TableHead>
						<TableHead>Result</TableHead>
						<TableHead>Taken</TableHead>
						<TableHead className="w-24" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{attempts.map((a) => (
						<TableRow key={a.id}>
							<TableCell className="font-medium">{a.quiz.title}</TableCell>
							<TableCell className="text-muted-foreground">
								{a.quiz.course?.title ?? "—"}
							</TableCell>
							<TableCell>
								{a.percentage ?? 0}%{" "}
								<span className="text-muted-foreground text-xs">
									({a.score}/{a.maxScore})
								</span>
							</TableCell>
							<TableCell>
								<Badge variant={a.passed ? "default" : "destructive"}>
									{a.passed ? "Passed" : "Not passed"}
								</Badge>
							</TableCell>
							<TableCell className="text-muted-foreground text-sm">
								{formatDate(a.submittedAt)}
							</TableCell>
							<TableCell>
								<Button asChild variant="ghost" size="sm">
									<Link
										href={`/dashboard/organization/quizzes/attempts/${a.id}`}
									>
										Review
									</Link>
								</Button>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
