"use client";

import NiceModal from "@ebay/nice-modal-react";
import {
	CheckCircle2Icon,
	ClockIcon,
	FileTextIcon,
	PlusIcon,
	SparklesIcon,
	TrashIcon,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { MaterialsModal } from "@/components/organization/materials-modal";
import { QuizzesTable } from "@/components/organization/quizzes-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CenteredSpinner } from "@/components/ui/custom/centered-spinner";
import { capitalize } from "@/lib/utils";
import { trpc } from "@/trpc/client";

export function CourseDetail({ courseId }: { courseId: string }) {
	const utils = trpc.useUtils();

	const { data: course, isPending: courseLoading } =
		trpc.organization.course.get.useQuery({ id: courseId });

	const { data: materialsData, isPending: materialsLoading } =
		trpc.organization.material.list.useQuery({ courseId });

	const { data: topicsData } = trpc.organization.quiz.listTopics.useQuery({
		courseId,
	});

	const deleteMaterial = trpc.organization.material.delete.useMutation({
		onSuccess: () => {
			toast.success("Material deleted");
			utils.organization.material.list.invalidate();
			utils.organization.course.list.invalidate();
		},
		onError: (error) => toast.error(error.message || "Failed to delete"),
	});

	const segmentTopics = trpc.organization.material.segmentTopics.useMutation({
		onSuccess: (result) => {
			toast.success(
				`Created ${result.topicsCreated} topic(s). You can now generate quizzes.`,
			);
			utils.organization.material.list.invalidate();
			utils.organization.quiz.listTopics.invalidate();
		},
		onError: (error) =>
			toast.error(error.message || "Failed to generate topics"),
	});

	if (courseLoading) return <CenteredSpinner />;
	if (!course)
		return <p className="text-muted-foreground">Course not found.</p>;

	const materials = materialsData?.materials ?? [];

	return (
		<div className="space-y-6">
			<div className="flex items-start justify-between gap-4">
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						<h2 className="font-semibold text-xl">{course.title}</h2>
						<Badge variant="secondary">{capitalize(course.status)}</Badge>
						<Badge variant="outline">{capitalize(course.level)}</Badge>
					</div>
					{course.subject && (
						<p className="text-muted-foreground text-sm">{course.subject}</p>
					)}
					{course.description && (
						<p className="max-w-2xl text-sm">{course.description}</p>
					)}
				</div>
			</div>

			<section className="space-y-3">
				<div className="flex items-center justify-between">
					<h3 className="font-medium">Materials</h3>
					<Button
						size="sm"
						onClick={() => NiceModal.show(MaterialsModal, { courseId })}
					>
						<PlusIcon className="size-4" />
						Add Material
					</Button>
				</div>

				{materialsLoading ? (
					<CenteredSpinner />
				) : materials.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center">
						<FileTextIcon className="size-7 text-muted-foreground" />
						<p className="text-muted-foreground text-sm">
							No materials yet. Upload a PDF or paste notes to get started.
						</p>
					</div>
				) : (
					<ul className="divide-y rounded-lg border">
						{materials.map((m) => (
							<li
								key={m.id}
								className="flex items-center justify-between gap-3 px-4 py-3"
							>
								<div className="flex min-w-0 items-center gap-3">
									<FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
									<div className="min-w-0">
										<p className="truncate font-medium text-sm">{m.title}</p>
										<p className="text-muted-foreground text-xs uppercase">
											{m.fileType}
										</p>
									</div>
								</div>
								<div className="flex items-center gap-3">
									<Badge
										variant={m._count.topics > 0 ? "secondary" : "outline"}
									>
										{m._count.topics} topic{m._count.topics === 1 ? "" : "s"}
									</Badge>
									{m.status === "ready" ? (
										<span className="inline-flex items-center gap-1 text-green-600 text-xs">
											<CheckCircle2Icon className="size-3.5" />
											Ready
										</span>
									) : (
										<span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
											<ClockIcon className="size-3.5" />
											{capitalize(m.status)}
										</span>
									)}
									<Button
										variant="outline"
										size="sm"
										disabled={
											segmentTopics.isPending &&
											segmentTopics.variables?.id === m.id
										}
										onClick={() => segmentTopics.mutate({ id: m.id })}
									>
										<SparklesIcon className="size-4" />
										{m._count.topics > 0 ? "Re-segment" : "Generate Topics"}
									</Button>
									<Button
										variant="ghost"
										size="icon"
										className="size-8"
										onClick={() =>
											NiceModal.show(ConfirmationModal, {
												title: "Delete material",
												message: `Delete "${m.title}"?`,
												confirmLabel: "Delete",
												destructive: true,
												onConfirm: () => deleteMaterial.mutate({ id: m.id }),
											})
										}
									>
										<TrashIcon className="size-4" />
										<span className="sr-only">Delete material</span>
									</Button>
								</div>
							</li>
						))}
					</ul>
				)}
			</section>

			<section className="space-y-3">
				<h3 className="font-medium">Topics</h3>
				{(topicsData?.topics ?? []).length === 0 ? (
					<div className="rounded-lg border border-dashed px-4 py-8 text-center text-muted-foreground text-sm">
						No topics yet. Use “Generate Topics” on a material above to create
						them.
					</div>
				) : (
					<ul className="grid gap-2 sm:grid-cols-2">
						{(topicsData?.topics ?? []).map((t) => (
							<li key={t.id} className="rounded-lg border p-3">
								<div className="flex items-center justify-between gap-2">
									<p className="font-medium text-sm">{t.title}</p>
									<Badge variant="outline" className="shrink-0">
										{t._count.quizzes} quiz
										{t._count.quizzes === 1 ? "" : "zes"}
									</Badge>
								</div>
								{t.summary && (
									<p className="mt-1 text-muted-foreground text-xs">
										{t.summary}
									</p>
								)}
							</li>
						))}
					</ul>
				)}
			</section>

			<section className="space-y-3">
				<h3 className="font-medium">Quizzes</h3>
				<QuizzesTable courseId={courseId} />
			</section>
		</div>
	);
}
