"use client";

import NiceModal, { type NiceModalHocProps } from "@ebay/nice-modal-react";
import { CourseLevel, CourseStatus } from "@prisma/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useEnhancedModal } from "@/hooks/use-enhanced-modal";
import { useZodForm } from "@/hooks/use-zod-form";
import { capitalize } from "@/lib/utils";
import {
	createCourseSchema,
	updateCourseSchema,
} from "@/schemas/organization-course-schemas";
import { trpc } from "@/trpc/client";

export type CoursesModalProps = NiceModalHocProps & {
	course?: {
		id: string;
		title: string;
		description?: string | null;
		subject?: string | null;
		level: string;
		status: string;
	};
};

export const CoursesModal = NiceModal.create<CoursesModalProps>(
	({ course }) => {
		const modal = useEnhancedModal();
		const utils = trpc.useUtils();
		const isEditing = !!course;

		const createMutation = trpc.organization.course.create.useMutation({
			onSuccess: () => {
				toast.success("Course created");
				utils.organization.course.list.invalidate();
				modal.handleClose();
			},
			onError: (error) =>
				toast.error(error.message || "Failed to create course"),
		});

		const updateMutation = trpc.organization.course.update.useMutation({
			onSuccess: () => {
				toast.success("Course updated");
				utils.organization.course.list.invalidate();
				modal.handleClose();
			},
			onError: (error) =>
				toast.error(error.message || "Failed to update course"),
		});

		const form = useZodForm({
			schema: isEditing ? updateCourseSchema : createCourseSchema,
			defaultValues: isEditing
				? {
						id: course.id,
						title: course.title,
						description: course.description ?? "",
						subject: course.subject ?? "",
						level: course.level as CourseLevel,
						status: course.status as CourseStatus,
					}
				: {
						title: "",
						description: "",
						subject: "",
						level: CourseLevel.beginner,
						status: CourseStatus.draft,
					},
		});

		const onSubmit = form.handleSubmit((data) => {
			if (isEditing) {
				updateMutation.mutate(
					data as Parameters<typeof updateMutation.mutate>[0],
				);
			} else {
				createMutation.mutate(
					data as Parameters<typeof createMutation.mutate>[0],
				);
			}
		});

		const isPending = createMutation.isPending || updateMutation.isPending;

		return (
			<Sheet
				open={modal.visible}
				onOpenChange={(open) => !open && modal.handleClose()}
			>
				<SheetContent
					className="sm:max-w-lg"
					onAnimationEndCapture={modal.handleAnimationEndCapture}
				>
					<SheetHeader>
						<SheetTitle>{isEditing ? "Edit Course" : "New Course"}</SheetTitle>
						<SheetDescription className="sr-only">
							{isEditing
								? "Update the course details below."
								: "Fill in the details to create a new course."}
						</SheetDescription>
					</SheetHeader>

					<Form {...form}>
						<form
							onSubmit={onSubmit}
							className="flex flex-1 flex-col overflow-hidden"
						>
							<ScrollArea className="flex-1">
								<div className="space-y-4 px-6 py-4">
									<FormField
										control={form.control}
										name="title"
										render={({ field }) => (
											<FormItem asChild>
												<Field>
													<FormLabel>Title</FormLabel>
													<FormControl>
														<Input
															placeholder="Introduction to Calculus"
															autoComplete="off"
															{...field}
														/>
													</FormControl>
													<FormMessage />
												</Field>
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name="subject"
										render={({ field }) => (
											<FormItem asChild>
												<Field>
													<FormLabel>Subject</FormLabel>
													<FormControl>
														<Input
															placeholder="Mathematics"
															autoComplete="off"
															{...field}
															value={field.value ?? ""}
														/>
													</FormControl>
													<FormMessage />
												</Field>
											</FormItem>
										)}
									/>

									<div className="grid grid-cols-2 gap-4">
										<FormField
											control={form.control}
											name="level"
											render={({ field }) => (
												<FormItem asChild>
													<Field>
														<FormLabel>Level</FormLabel>
														<Select
															onValueChange={field.onChange}
															defaultValue={field.value}
														>
															<FormControl>
																<SelectTrigger className="w-full">
																	<SelectValue placeholder="Select level" />
																</SelectTrigger>
															</FormControl>
															<SelectContent>
																{Object.values(CourseLevel).map((level) => (
																	<SelectItem key={level} value={level}>
																		{capitalize(level)}
																	</SelectItem>
																))}
															</SelectContent>
														</Select>
														<FormMessage />
													</Field>
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name="status"
											render={({ field }) => (
												<FormItem asChild>
													<Field>
														<FormLabel>Status</FormLabel>
														<Select
															onValueChange={field.onChange}
															defaultValue={field.value}
														>
															<FormControl>
																<SelectTrigger className="w-full">
																	<SelectValue placeholder="Select status" />
																</SelectTrigger>
															</FormControl>
															<SelectContent>
																{Object.values(CourseStatus).map((status) => (
																	<SelectItem key={status} value={status}>
																		{capitalize(status)}
																	</SelectItem>
																))}
															</SelectContent>
														</Select>
														<FormMessage />
													</Field>
												</FormItem>
											)}
										/>
									</div>

									<FormField
										control={form.control}
										name="description"
										render={({ field }) => (
											<FormItem asChild>
												<Field>
													<FormLabel>Description</FormLabel>
													<FormControl>
														<Textarea
															placeholder="What this course covers..."
															className="resize-none"
															rows={4}
															{...field}
															value={field.value ?? ""}
														/>
													</FormControl>
													<FormMessage />
												</Field>
											</FormItem>
										)}
									/>
								</div>
							</ScrollArea>

							<SheetFooter className="flex-row justify-end gap-2 border-t">
								<Button
									type="button"
									variant="outline"
									onClick={modal.handleClose}
									disabled={isPending}
								>
									Cancel
								</Button>
								<Button type="submit" disabled={isPending} loading={isPending}>
									{isEditing ? "Update Course" : "Create Course"}
								</Button>
							</SheetFooter>
						</form>
					</Form>
				</SheetContent>
			</Sheet>
		);
	},
);
