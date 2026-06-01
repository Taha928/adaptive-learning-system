"use client";

import {
	BookOpenIcon,
	BotIcon,
	ClipboardListIcon,
	ListChecksIcon,
	UserCheckIcon,
	UsersIcon,
} from "lucide-react";
import type * as React from "react";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { CenteredSpinner } from "@/components/ui/custom/centered-spinner";
import { trpc } from "@/trpc/client";

type Stat = {
	label: string;
	value: number;
	icon: React.ComponentType<{ className?: string }>;
};

export function AdminOverview(): React.JSX.Element {
	const { data, isPending } = trpc.admin.analytics.getStats.useQuery();

	if (isPending) return <CenteredSpinner />;

	const stats: Stat[] = [
		{
			label: "Total students",
			value: data?.totalStudents ?? 0,
			icon: UsersIcon,
		},
		{
			label: "Active (7 days)",
			value: data?.activeStudents ?? 0,
			icon: UserCheckIcon,
		},
		{ label: "Courses", value: data?.totalCourses ?? 0, icon: BookOpenIcon },
		{ label: "Quizzes", value: data?.totalQuizzes ?? 0, icon: ListChecksIcon },
		{
			label: "Quiz attempts",
			value: data?.totalAttempts ?? 0,
			icon: ClipboardListIcon,
		},
		{ label: "Tutor chats", value: data?.totalChats ?? 0, icon: BotIcon },
	];

	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{stats.map((stat) => (
				<Card key={stat.label}>
					<CardHeader>
						<div className="flex items-center justify-between">
							<CardDescription>{stat.label}</CardDescription>
							<stat.icon className="size-4 text-muted-foreground" />
						</div>
						<CardTitle className="text-3xl">{stat.value}</CardTitle>
					</CardHeader>
				</Card>
			))}
		</div>
	);
}
