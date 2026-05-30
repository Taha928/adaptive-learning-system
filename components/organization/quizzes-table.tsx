"use client";

import NiceModal from "@ebay/nice-modal-react";
import { ListChecksIcon, PlayIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { GenerateQuizModal } from "@/components/organization/generate-quiz-modal";
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
import { capitalize, cn } from "@/lib/utils";
import { trpc } from "@/trpc/client";

const STATUS_VARIANT: Record<
	string,
	"default" | "secondary" | "outline" | "destructive"
> = {
	published: "default",
	draft: "secondary",
	archived: "outline",
};

const DIFFICULTY_STYLES: Record<string, string> = {
	easy: "bg-emerald-500 text-white border-transparent",
	medium: "bg-amber-500 text-white border-transparent",
	hard: "bg-rose-500 text-white border-transparent",
};

export function QuizzesTable({ courseId }: { courseId?: string }) {
	const { data, isPending } = trpc.organization.quiz.list.useQuery({
		courseId,
	});

	const quizzes = data?.quizzes ?? [];

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-end">
				<Button onClick={() => NiceModal.show(GenerateQuizModal, { courseId })}>
					<SparklesIcon className="size-4" />
					Generate Quiz from Topic
				</Button>
			</div>

			{isPending ? (
				<CenteredSpinner />
			) : quizzes.length === 0 ? (
				<div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
					<ListChecksIcon className="size-8 text-muted-foreground" />
					<div>
						<p className="font-medium">No quizzes yet</p>
						<p className="text-muted-foreground text-sm">
							Generate an adaptive quiz from a topic to get started.
						</p>
					</div>
					<Button
						variant="outline"
						onClick={() => NiceModal.show(GenerateQuizModal, { courseId })}
					>
						<SparklesIcon className="size-4" />
						Generate Quiz from Topic
					</Button>
				</div>
			) : (
				<div className="rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Title</TableHead>
								<TableHead>Course</TableHead>
								<TableHead>Difficulty</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="text-right">Questions</TableHead>
								<TableHead className="text-right">Attempts</TableHead>
								<TableHead className="w-24" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{quizzes.map((quiz) => (
								<TableRow key={quiz.id}>
									<TableCell className="font-medium">
										<Link
											href={`/dashboard/organization/quizzes/${quiz.id}/take`}
											className="hover:underline"
										>
											{quiz.title}
										</Link>
									</TableCell>
									<TableCell className="text-muted-foreground">
										{quiz.course?.title ?? "—"}
									</TableCell>
									<TableCell>
										<Badge
											className={cn(
												"uppercase",
												DIFFICULTY_STYLES[quiz.difficulty] ?? "",
											)}
										>
											{quiz.difficulty}
										</Badge>
									</TableCell>
									<TableCell>
										<Badge variant={STATUS_VARIANT[quiz.status] ?? "secondary"}>
											{capitalize(quiz.status)}
										</Badge>
									</TableCell>
									<TableCell className="text-right text-muted-foreground">
										{quiz._count.questions}
									</TableCell>
									<TableCell className="text-right text-muted-foreground">
										{quiz._count.attempts}
									</TableCell>
									<TableCell className="text-right">
										<Button asChild size="sm" variant="outline">
											<Link
												href={`/dashboard/organization/quizzes/${quiz.id}/take`}
											>
												<PlayIcon className="size-3.5" />
												Take
											</Link>
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	);
}
