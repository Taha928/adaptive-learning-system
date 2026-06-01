"use client";

import {
	ChevronLeftIcon,
	MessageCircleQuestionIcon,
	XIcon,
} from "lucide-react";
import { useState } from "react";
import { StudyNexMascot } from "@/components/studynex-mascot";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Nexy — a lightweight contextual help assistant (item 15).
 *
 * Purpose: answer basic "how do I use StudyNex" questions and guide new users.
 * It is intentionally NOT a subject tutor and is kept separate from the main AI
 * Tutor — it only serves canned, guided answers about the platform.
 */
interface HelpEntry {
	question: string;
	answer: string;
}

const HELP_ENTRIES: HelpEntry[] = [
	{
		question: "How do I upload a file?",
		answer:
			"Open a course and use the upload button to add PDFs, PPTs, notes or images. StudyNex reads your material so the AI Tutor and quizzes can use it. You can also attach files directly in an AI Tutor chat.",
	},
	{
		question: "Where are my quizzes?",
		answer:
			"Go to Assessments → Quizzes in the sidebar. Generate a Quick (5), Standard (10) or Practice (20) quiz from any topic. Find past results under My Attempts.",
	},
	{
		question: "How do I view my progress?",
		answer:
			"Check Analytics → Progress Report for your scores and weak topics. Your daily learning streak shows on the Home dashboard.",
	},
	{
		question: "What is the AI Tutor?",
		answer:
			"The AI Tutor (top of the sidebar) is your Gemini-powered study companion. Ask questions, attach files, and get explanations grounded in your own material.",
	},
	{
		question: "How do I start learning?",
		answer:
			"1) Create a course. 2) Upload your materials. 3) Ask the AI Tutor or generate a quiz. Your study plan and progress build automatically as you go.",
	},
];

export function NexyHelpWidget() {
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState<HelpEntry | null>(null);

	return (
		<div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3 print:hidden">
			{open && (
				<div className="flex w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
					{/* Header */}
					<div className="flex items-center gap-3 border-b bg-primary/5 p-3">
						<StudyNexMascot className="size-9 shrink-0" />
						<div className="min-w-0 flex-1">
							<p className="font-semibold text-sm leading-tight">Nexy</p>
							<p className="text-muted-foreground text-xs leading-tight">
								Your StudyNex help guide
							</p>
						</div>
						<Button
							size="icon-sm"
							variant="ghost"
							onClick={() => setOpen(false)}
							aria-label="Close help"
						>
							<XIcon className="size-4" />
						</Button>
					</div>

					{/* Body */}
					<div className="max-h-[60vh] overflow-y-auto p-3">
						{active ? (
							<div className="space-y-3">
								<button
									type="button"
									onClick={() => setActive(null)}
									className="flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
								>
									<ChevronLeftIcon className="size-3.5" />
									All questions
								</button>
								<p className="font-medium text-sm">{active.question}</p>
								<p className="text-muted-foreground text-sm leading-relaxed">
									{active.answer}
								</p>
							</div>
						) : (
							<div className="space-y-2">
								<p className="px-1 pb-1 text-muted-foreground text-xs">
									Hi! I can help you find your way around StudyNex. Pick a
									question:
								</p>
								{HELP_ENTRIES.map((entry) => (
									<button
										key={entry.question}
										type="button"
										onClick={() => setActive(entry)}
										className="w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
									>
										{entry.question}
									</button>
								))}
							</div>
						)}
					</div>
				</div>
			)}

			{/* Launcher */}
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				aria-label={open ? "Close help" : "Open help"}
				className={cn(
					"flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105",
				)}
			>
				{open ? (
					<XIcon className="size-6" />
				) : (
					<MessageCircleQuestionIcon className="size-6" />
				)}
			</button>
		</div>
	);
}
