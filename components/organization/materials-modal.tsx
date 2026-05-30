"use client";

import NiceModal, { type NiceModalHocProps } from "@ebay/nice-modal-react";
import { MaterialType } from "@prisma/client";
import { Loader2Icon, UploadIcon } from "lucide-react";
import { useRef, useState } from "react";
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
import { createMaterialSchema } from "@/schemas/organization-material-schemas";
import { trpc } from "@/trpc/client";

export type MaterialsModalProps = NiceModalHocProps & {
	courseId: string;
};

export const MaterialsModal = NiceModal.create<MaterialsModalProps>(
	({ courseId }) => {
		const modal = useEnhancedModal();
		const utils = trpc.useUtils();
		const fileInputRef = useRef<HTMLInputElement>(null);
		const [isExtracting, setIsExtracting] = useState(false);

		const createMutation = trpc.organization.material.create.useMutation({
			onSuccess: () => {
				toast.success("Material added");
				utils.organization.material.list.invalidate();
				utils.organization.course.list.invalidate();
				modal.handleClose();
			},
			onError: (error) =>
				toast.error(error.message || "Failed to add material"),
		});

		const form = useZodForm({
			schema: createMaterialSchema,
			defaultValues: {
				courseId,
				title: "",
				fileType: MaterialType.note,
				extractedText: "",
			},
		});

		// Upload a PDF and pull its text into the form via the extraction endpoint.
		const handlePdfUpload = async (file: File) => {
			setIsExtracting(true);
			try {
				const body = new FormData();
				body.append("file", file);
				const res = await fetch("/api/materials/extract", {
					method: "POST",
					body,
				});
				if (!res.ok) {
					const data = (await res.json().catch(() => null)) as {
						message?: string;
					} | null;
					throw new Error(data?.message ?? "Extraction failed");
				}
				const data = (await res.json()) as { text: string; pageCount: number };
				form.setValue("extractedText", data.text);
				form.setValue("fileType", MaterialType.pdf);
				form.setValue("fileSizeBytes", file.size);
				if (!form.getValues("title")) {
					form.setValue("title", file.name.replace(/\.pdf$/i, ""));
				}
				toast.success(`Extracted text from ${data.pageCount} page(s)`);
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "Could not read PDF",
				);
			} finally {
				setIsExtracting(false);
			}
		};

		const onSubmit = form.handleSubmit((data) => {
			createMutation.mutate(
				data as Parameters<typeof createMutation.mutate>[0],
			);
		});

		const isPending = createMutation.isPending;

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
						<SheetTitle>Add Material</SheetTitle>
						<SheetDescription>
							Upload a PDF or paste notes. The text feeds the AI tutor for
							quizzes and study plans.
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
															placeholder="Week 1 — Lecture notes"
															autoComplete="off"
															{...field}
														/>
													</FormControl>
													<FormMessage />
												</Field>
											</FormItem>
										)}
									/>

									<input
										ref={fileInputRef}
										type="file"
										accept="application/pdf"
										className="hidden"
										onChange={(e) => {
											const file = e.target.files?.[0];
											if (file) handlePdfUpload(file);
											e.target.value = "";
										}}
									/>
									<Button
										type="button"
										variant="outline"
										className="w-full"
										disabled={isExtracting}
										onClick={() => fileInputRef.current?.click()}
									>
										{isExtracting ? (
											<Loader2Icon className="size-4 animate-spin" />
										) : (
											<UploadIcon className="size-4" />
										)}
										{isExtracting ? "Extracting…" : "Upload PDF"}
									</Button>

									<FormField
										control={form.control}
										name="extractedText"
										render={({ field }) => (
											<FormItem asChild>
												<Field>
													<FormLabel>Content</FormLabel>
													<FormControl>
														<Textarea
															placeholder="Paste notes here, or upload a PDF above to fill this automatically…"
															className="h-64 max-h-[50vh] resize-none overflow-y-auto font-mono text-xs"
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
								<Button
									type="submit"
									disabled={isPending || isExtracting}
									loading={isPending}
								>
									Add Material
								</Button>
							</SheetFooter>
						</form>
					</Form>
				</SheetContent>
			</Sheet>
		);
	},
);
