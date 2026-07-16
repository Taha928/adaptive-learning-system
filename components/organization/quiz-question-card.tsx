"use client";

import { ImageIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

/** 8 MB — matches the server's responseImage ceiling. */
const MAX_ANSWER_IMAGE_BYTES = 8 * 1024 * 1024;

export function fileToDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
}

/** Read an image answer as a data URL, reporting size problems to the student. */
export async function readAnswerImage(file: File | null): Promise<string | null> {
	if (!file) return null;
	if (file.size > MAX_ANSWER_IMAGE_BYTES) {
		toast.error("Image is too large (max 8 MB).");
		return null;
	}
	try {
		return await fileToDataUrl(file);
	} catch {
		toast.error("Could not read the image.");
		return null;
	}
}

export function toOptions(options: unknown): string[] {
	return Array.isArray(options)
		? options.filter((o): o is string => typeof o === "string")
		: [];
}

export type RunnerQuestion = {
	id: string;
	prompt: string;
	type: string;
	options: unknown;
	points: number;
	orderIndex: number;
	topicTitle?: string | null;
};

type Props = {
	question: RunnerQuestion;
	/** 1-based position in the assessment. */
	index: number;
	total: number;
	value: string;
	image: { name: string; url: string } | null;
	onValueChange: (value: string) => void;
	onImageSelected: (file: File | null) => void;
	onImageRemoved: () => void;
	disabled?: boolean;
};

/**
 * One question, in the only presentation the student ever sees.
 *
 * Note what is absent: any difficulty badge. In fixed mode the student chose
 * the level, so repeating it is noise; in adaptive mode the level is an
 * internal control signal, and showing it would turn a diagnostic into a label
 * ("I'm on the easy ones"). The topic is shown instead — it orients without
 * grading.
 */
export function QuizQuestionCard({
	question,
	index,
	total,
	value,
	image,
	onValueChange,
	onImageSelected,
	onImageRemoved,
	disabled = false,
}: Props) {
	const options = toOptions(question.options);
	const isFreeResponse =
		question.type === "shortAnswer" ||
		question.type === "longAnswer" ||
		options.length === 0;

	return (
		<Card>
			<CardHeader className="gap-1">
				<div className="flex items-baseline justify-between gap-3">
					<span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
						Question {index} of {total}
					</span>
					{question.topicTitle && (
						<span className="truncate text-muted-foreground text-xs">
							{question.topicTitle}
						</span>
					)}
				</div>
				<CardTitle className="text-base leading-snug">
					{question.prompt}
				</CardTitle>
			</CardHeader>
			<CardContent>
				{isFreeResponse ? (
					<div className="space-y-3">
						{question.type === "longAnswer" ? (
							<Textarea
								placeholder="Write your answer…"
								className="min-h-32"
								value={value}
								disabled={disabled}
								onChange={(e) => onValueChange(e.target.value)}
							/>
						) : (
							<Input
								placeholder="Type your answer…"
								value={value}
								disabled={disabled}
								onChange={(e) => onValueChange(e.target.value)}
							/>
						)}

						{/* Image answer, e.g. a photo of handwritten working. */}
						{image ? (
							<div className="flex items-center gap-3 rounded-md border p-2">
								{/* biome-ignore lint/performance/noImgElement: local data URL preview */}
								<img
									src={image.url}
									alt="Your answer"
									className="size-16 rounded object-cover"
								/>
								<span className="min-w-0 flex-1 truncate text-muted-foreground text-sm">
									{image.name}
								</span>
								<Button
									type="button"
									size="icon-sm"
									variant="ghost"
									onClick={onImageRemoved}
									aria-label="Remove image"
									disabled={disabled}
								>
									<XIcon className="size-4" />
								</Button>
							</div>
						) : (
							<label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-muted-foreground text-sm transition-colors hover:bg-accent">
								<ImageIcon className="size-4" />
								Attach an image of your answer
								<input
									type="file"
									accept="image/*"
									className="hidden"
									disabled={disabled}
									onChange={(e) => {
										onImageSelected(e.target.files?.[0] ?? null);
										e.target.value = "";
									}}
								/>
							</label>
						)}
					</div>
				) : (
					<RadioGroup
						value={value}
						onValueChange={onValueChange}
						disabled={disabled}
					>
						{options.map((option, optIndex) => {
							const id = `${question.id}-${optIndex}`;
							return (
								<label
									key={id}
									htmlFor={id}
									className="flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-accent"
								>
									<RadioGroupItem value={option} id={id} />
									<span>{option}</span>
								</label>
							);
						})}
					</RadioGroup>
				)}
			</CardContent>
		</Card>
	);
}
