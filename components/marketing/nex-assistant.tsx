"use client";

import {
	ArrowRightIcon,
	ChevronLeftIcon,
	SparklesIcon,
	XIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { StudyNexMascot } from "@/components/studynex-mascot";
import { cn } from "@/lib/utils";

/**
 * Nex — the friendly on-site assistant for the marketing/home page.
 *
 * Anonymous visitors have no auth/credits, so Nex serves fast, guided answers
 * about the product (what StudyNex is, pricing, how to start) plus a clear
 * sign-up CTA — no API calls, no abuse surface. It mirrors the in-app Nex help
 * bot so the brand character is consistent everywhere.
 */
interface NexEntry {
	question: string;
	answer: string;
}

const NEX_ENTRIES: NexEntry[] = [
	{
		question: "What is StudyNex?",
		answer:
			"StudyNex turns your own slides, PDFs and notes into a personal AI tutor. It explains your material, generates adaptive quizzes from it, tracks what you're weak on, and builds a study plan — all grounded in what you uploaded.",
	},
	{
		question: "How do I get started?",
		answer:
			"Create a free account, make a course, and upload your first PDF or notes. Within minutes you can chat with the AI tutor about it and generate your first quiz. No credit card needed.",
	},
	{
		question: "How much does it cost?",
		answer:
			"The Free plan is $0 and lets you start learning right away. Pro is $9.99/month (coming soon) for unlimited tutoring and advanced analytics. Institutions can contact us for classroom features.",
	},
	{
		question: "Can it make quizzes from my notes?",
		answer:
			"Yes. Upload a PDF or paste notes and StudyNex generates multiple-choice, true/false and short-answer questions straight from your material — then adapts the difficulty to your performance.",
	},
	{
		question: "Is my material private?",
		answer:
			"Your uploads stay scoped to your workspace and are never used to train models, with encryption in transit and at rest.",
	},
];

export function NexAssistant() {
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState<NexEntry | null>(null);

	return (
		<div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3 print:hidden">
			{open && (
				<div className="flex w-[min(23rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-marketing-border bg-marketing-bg-elevated shadow-2xl animate-fadeIn">
					{/* Header */}
					<div className="flex items-center gap-3 border-b border-marketing-border bg-marketing-accent-soft p-3">
						<StudyNexMascot animated className="size-10 shrink-0" />
						<div className="min-w-0 flex-1">
							<p className="flex items-center gap-1.5 font-semibold text-sm leading-tight text-marketing-fg">
								Nex
								<span className="inline-flex items-center gap-1 rounded-full bg-marketing-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-marketing-accent">
									<span className="size-1.5 rounded-full bg-marketing-accent" />
									online
								</span>
							</p>
							<p className="text-marketing-fg-muted text-xs leading-tight">
								Your StudyNex guide
							</p>
						</div>
						<button
							type="button"
							onClick={() => setOpen(false)}
							aria-label="Close Nex"
							className="flex size-8 items-center justify-center rounded-full text-marketing-fg-muted transition-colors hover:bg-marketing-card hover:text-marketing-fg"
						>
							<XIcon className="size-4" />
						</button>
					</div>

					{/* Body */}
					<div className="max-h-[60vh] overflow-y-auto p-3">
						{active ? (
							<div className="space-y-3">
								<button
									type="button"
									onClick={() => setActive(null)}
									className="flex items-center gap-1 text-marketing-fg-muted text-xs hover:text-marketing-fg"
								>
									<ChevronLeftIcon className="size-3.5" />
									All questions
								</button>
								<p className="font-medium text-sm text-marketing-fg">
									{active.question}
								</p>
								<p className="text-marketing-fg-muted text-sm leading-relaxed">
									{active.answer}
								</p>
								<Link
									href="/auth/sign-up"
									className="inline-flex items-center gap-1.5 rounded-full bg-marketing-accent px-4 py-2 text-sm font-semibold text-marketing-accent-fg transition hover:bg-marketing-accent-hover"
								>
									Start learning free
									<ArrowRightIcon className="size-4" />
								</Link>
							</div>
						) : (
							<div className="space-y-2">
								<p className="px-1 pb-1 text-marketing-fg-muted text-xs">
									Hi, I'm Nex! 👋 Ask me anything about StudyNex:
								</p>
								{NEX_ENTRIES.map((entry) => (
									<button
										key={entry.question}
										type="button"
										onClick={() => setActive(entry)}
										className="w-full rounded-xl border border-marketing-border px-3 py-2 text-left text-sm text-marketing-fg transition-all hover:-translate-y-0.5 hover:border-marketing-accent hover:bg-marketing-card"
									>
										{entry.question}
									</button>
								))}
								<Link
									href="/auth/sign-up"
									className="mt-1 flex items-center justify-center gap-1.5 rounded-xl bg-marketing-accent px-4 py-2.5 text-sm font-semibold text-marketing-accent-fg transition hover:bg-marketing-accent-hover"
								>
									Start learning free
									<ArrowRightIcon className="size-4" />
								</Link>
							</div>
						)}
					</div>
				</div>
			)}

			{/* Launcher */}
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				aria-label={open ? "Close Nex" : "Chat with Nex"}
				className={cn(
					"group relative flex items-center gap-2 rounded-full bg-marketing-accent py-2.5 pr-4 pl-2.5 text-marketing-accent-fg shadow-lg transition-transform hover:scale-105",
				)}
			>
				{open ? (
					<XIcon className="size-6" />
				) : (
					<>
						<span className="flex size-9 items-center justify-center rounded-full bg-white/20">
							<StudyNexMascot animated className="size-7 text-white" />
						</span>
						<span className="font-semibold text-sm">Ask Nex</span>
						<SparklesIcon className="size-4" />
					</>
				)}
			</button>
		</div>
	);
}
