"use client";

import NiceModal from "@ebay/nice-modal-react";
import {
	BookOpenIcon,
	FileTextIcon,
	MoreHorizontalIcon,
	PencilIcon,
	PlusIcon,
	TrashIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { CoursesModal } from "@/components/organization/courses-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CenteredSpinner } from "@/components/ui/custom/centered-spinner";
import { InputSearch } from "@/components/ui/custom/input-search";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { capitalize } from "@/lib/utils";
import { trpc } from "@/trpc/client";

const STATUS_VARIANT: Record<
	string,
	"default" | "secondary" | "outline" | "destructive"
> = {
	published: "default",
	draft: "secondary",
	archived: "outline",
};

export function CoursesTable() {
	const utils = trpc.useUtils();
	const [search, setSearch] = useState("");

	const { data, isPending } = trpc.organization.course.list.useQuery({
		query: search || undefined,
	});

	const deleteMutation = trpc.organization.course.delete.useMutation({
		onSuccess: () => {
			toast.success("Course deleted");
			utils.organization.course.list.invalidate();
		},
		onError: (error) => toast.error(error.message || "Failed to delete course"),
	});

	const courses = data?.courses ?? [];

	const handleDelete = (id: string, title: string) => {
		NiceModal.show(ConfirmationModal, {
			title: "Delete course",
			message: `Delete "${title}"? This also removes its materials, topics, and quizzes. This cannot be undone.`,
			confirmLabel: "Delete",
			destructive: true,
			onConfirm: () => deleteMutation.mutate({ id }),
		});
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between gap-2">
				<InputSearch
					placeholder="Search courses..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="max-w-xs"
				/>
				<Button onClick={() => NiceModal.show(CoursesModal)}>
					<PlusIcon className="size-4" />
					New Course
				</Button>
			</div>

			{isPending ? (
				<CenteredSpinner />
			) : courses.length === 0 ? (
				<div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
					<BookOpenIcon className="size-8 text-muted-foreground" />
					<div>
						<p className="font-medium">No courses yet</p>
						<p className="text-muted-foreground text-sm">
							Create a course, then add materials to generate quizzes.
						</p>
					</div>
					<Button
						variant="outline"
						onClick={() => NiceModal.show(CoursesModal)}
					>
						<PlusIcon className="size-4" />
						New Course
					</Button>
				</div>
			) : (
				<div className="rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Title</TableHead>
								<TableHead>Subject</TableHead>
								<TableHead>Level</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="text-right">Materials</TableHead>
								<TableHead className="w-10" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{courses.map((course) => (
								<TableRow key={course.id}>
									<TableCell className="font-medium">
										<Link
											href={`/dashboard/organization/courses/${course.id}`}
											className="hover:underline"
										>
											{course.title}
										</Link>
									</TableCell>
									<TableCell className="text-muted-foreground">
										{course.subject ?? "—"}
									</TableCell>
									<TableCell>{capitalize(course.level)}</TableCell>
									<TableCell>
										<Badge
											variant={STATUS_VARIANT[course.status] ?? "secondary"}
										>
											{capitalize(course.status)}
										</Badge>
									</TableCell>
									<TableCell className="text-right">
										<span className="inline-flex items-center gap-1 text-muted-foreground">
											<FileTextIcon className="size-3.5" />
											{course._count.materials}
										</span>
									</TableCell>
									<TableCell>
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button variant="ghost" size="icon" className="size-8">
													<MoreHorizontalIcon className="size-4" />
													<span className="sr-only">Actions</span>
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												<DropdownMenuItem
													onClick={() =>
														NiceModal.show(CoursesModal, { course })
													}
												>
													<PencilIcon className="size-4" />
													Edit
												</DropdownMenuItem>
												<DropdownMenuItem
													variant="destructive"
													onClick={() => handleDelete(course.id, course.title)}
												>
													<TrashIcon className="size-4" />
													Delete
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
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
