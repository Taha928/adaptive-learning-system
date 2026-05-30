"use client";

import {
	AlertTriangleIcon,
	ArrowRightIcon,
	BookOpenIcon,
	GraduationCapIcon,
	ListChecksIcon,
} from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { trpc } from "@/trpc/client";

const base = "/dashboard/organization";

function formatDate(value: string | Date | null): string {
	if (!value) return "—";
	const d = typeof value === "string" ? new Date(value) : value;
	return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function OrganizationOverview() {
	const overviewQuery = trpc.organization.analytics.getOverview.useQuery();
	const weakQuery = trpc.organization.analytics.getWeakTopics.useQuery();
	const attemptsQuery = trpc.organization.quiz.listMyAttempts.useQuery({});

	if (
		overviewQuery.isPending ||
		weakQuery.isPending ||
		attemptsQuery.isPending
	) {
		return <CenteredSpinner />;
	}

	const overview = overviewQuery.data;
	const weakTopics = weakQuery.data ?? [];
	const recentAttempts = (attemptsQuery.data?.attempts ?? []).slice(0, 5);

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
							Weakest:{" "}
							{weakTopics
								.slice(0, 4)
								.map((t) => `${t.topicTitle} (${Math.round(t.mastery * 100)}%)`)
								.join(", ")}
							. Generate a study plan to focus on these.
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
							{overview?.scope === "self" ? "My attempts" : "Attempts"}
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

			<div className="grid gap-4 lg:grid-cols-3">
				<Card className="lg:col-span-2">
					<CardHeader>
						<CardTitle className="text-base">Recent attempts</CardTitle>
						<CardDescription>Your latest quiz results</CardDescription>
					</CardHeader>
					<CardContent>
						{recentAttempts.length === 0 ? (
							<p className="py-6 text-center text-muted-foreground text-sm">
								No attempts yet — take a quiz to get started.
							</p>
						) : (
							<ul className="divide-y">
								{recentAttempts.map((a) => (
									<li
										key={a.id}
										className="flex items-center justify-between gap-3 py-2.5"
									>
										<Link
											href={`${base}/quizzes/attempts/${a.id}`}
											className="min-w-0 flex-1 truncate text-sm hover:underline"
										>
											{a.quiz.title}
										</Link>
										<span className="flex shrink-0 items-center gap-2">
											<Badge variant={a.passed ? "default" : "destructive"}>
												{a.percentage ?? 0}%
											</Badge>
											<span className="text-muted-foreground text-xs">
												{formatDate(a.submittedAt)}
											</span>
										</span>
									</li>
								))}
							</ul>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">Quick actions</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-2">
						<Button asChild variant="outline" className="justify-start">
							<Link href={`${base}/courses`}>
								<BookOpenIcon className="size-4" />
								Browse courses
							</Link>
						</Button>
						<Button asChild variant="outline" className="justify-start">
							<Link href={`${base}/quizzes`}>
								<ListChecksIcon className="size-4" />
								Take a quiz
							</Link>
						</Button>
						<Button asChild variant="outline" className="justify-start">
							<Link href={`${base}/study-plan`}>
								<GraduationCapIcon className="size-4" />
								My study plan
								<ArrowRightIcon className="ml-auto size-4" />
							</Link>
						</Button>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
