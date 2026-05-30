"use client";

import { ArrowRightIcon, CheckIcon, SparklesIcon } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const ease = [0.21, 0.5, 0.18, 1] as const;

function MasteryRing({ value }: { value: number }) {
	const r = 26;
	const c = 2 * Math.PI * r;
	const offset = c - (value / 100) * c;
	return (
		<svg viewBox="0 0 64 64" className="size-16 -rotate-90">
			<circle
				cx="32"
				cy="32"
				r={r}
				fill="none"
				strokeWidth="6"
				className="stroke-marketing-border"
			/>
			<motion.circle
				cx="32"
				cy="32"
				r={r}
				fill="none"
				strokeWidth="6"
				strokeLinecap="round"
				className="stroke-marketing-accent"
				strokeDasharray={c}
				initial={{ strokeDashoffset: c }}
				whileInView={{ strokeDashoffset: offset }}
				viewport={{ once: true }}
				transition={{ duration: 1.1, delay: 0.5, ease }}
			/>
		</svg>
	);
}

function HeroPreview() {
	return (
		<motion.div
			initial={{ opacity: 0, y: 28 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.8, delay: 0.25, ease }}
			className="relative mx-auto w-full max-w-xl lg:max-w-none"
		>
			{/* Main tutor-chat panel */}
			<div className="relative rounded-2xl border border-marketing-border bg-marketing-bg-elevated p-1.5 shadow-[0_28px_80px_-30px_rgba(80,50,10,0.35)]">
				<div className="overflow-hidden rounded-xl border border-marketing-border bg-marketing-card">
					{/* Window bar */}
					<div className="flex items-center gap-2 border-b border-marketing-border px-4 py-3">
						<span className="flex size-6 items-center justify-center rounded-md bg-marketing-accent text-marketing-accent-fg">
							<SparklesIcon className="size-3.5" />
						</span>
						<span className="font-display text-sm font-medium text-marketing-fg">
							StudyNex tutor
						</span>
						<span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-marketing-accent-soft px-2 py-0.5 text-[11px] font-medium text-marketing-fg-muted">
							<span className="size-1.5 rounded-full bg-marketing-accent" />
							Gemini · grounded in your notes
						</span>
					</div>

					{/* Conversation */}
					<div className="flex flex-col gap-4 p-5">
						<div className="ml-auto max-w-[78%] rounded-2xl rounded-br-sm bg-marketing-accent px-4 py-2.5 text-sm leading-6 text-marketing-accent-fg">
							Explain the chain rule like I'm five, using my lecture 4 notes.
						</div>
						<div className="max-w-[88%] rounded-2xl rounded-bl-sm bg-marketing-bg-elevated px-4 py-3 text-sm leading-6 text-marketing-fg ring-1 ring-marketing-border">
							Think of a function inside a function like a box inside a box. To
							open both, you peel the outside first, then the inside, and{" "}
							<span className="font-medium text-marketing-fg">
								multiply the two rates of change
							</span>
							. From your notes, slide 12 is the same idea.
							<div className="mt-3 flex flex-wrap gap-2">
								<span className="rounded-full bg-marketing-card px-2.5 py-1 text-xs font-medium text-marketing-fg-muted">
									Lecture 4 · slide 12
								</span>
								<span className="rounded-full bg-marketing-card px-2.5 py-1 text-xs font-medium text-marketing-fg-muted">
									Practice 3 questions →
								</span>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Floating quiz card */}
			<motion.div
				initial={{ opacity: 0, y: 18, rotate: -3 }}
				animate={{ opacity: 1, y: 0, rotate: -3 }}
				transition={{ duration: 0.7, delay: 0.6, ease }}
				className="absolute -left-4 -bottom-10 w-52 rounded-xl border border-marketing-border bg-marketing-bg-elevated p-4 shadow-xl sm:-left-10"
			>
				<div className="flex items-center justify-between">
					<span className="text-xs font-semibold tracking-wide text-marketing-fg-subtle uppercase">
						Quiz · Derivatives
					</span>
				</div>
				<div className="mt-3 flex items-center gap-3">
					<MasteryRing value={92} />
					<div>
						<p className="font-display text-2xl text-marketing-fg">92%</p>
						<p className="text-xs text-marketing-fg-muted">
							Mastery, +14% today
						</p>
					</div>
				</div>
			</motion.div>

			{/* Floating study-plan card */}
			<motion.div
				initial={{ opacity: 0, y: 18, rotate: 4 }}
				animate={{ opacity: 1, y: 0, rotate: 4 }}
				transition={{ duration: 0.7, delay: 0.75, ease }}
				className="absolute -right-3 -top-8 w-48 rounded-xl border border-marketing-border bg-marketing-bg-elevated p-4 shadow-xl sm:-right-8"
			>
				<p className="text-xs font-semibold tracking-wide text-marketing-fg-subtle uppercase">
					Today's plan
				</p>
				<ul className="mt-3 flex flex-col gap-2 text-sm text-marketing-fg">
					{[
						{ label: "Review limits", done: true },
						{ label: "Quiz: chain rule", done: true },
						{ label: "Read §3.2", done: false },
					].map((item) => (
						<li key={item.label} className="flex items-center gap-2">
							<span
								className={cn(
									"flex size-4 shrink-0 items-center justify-center rounded-full",
									item.done
										? "bg-marketing-accent text-marketing-accent-fg"
										: "border border-marketing-border-strong",
								)}
							>
								{item.done && (
									<CheckIcon className="size-2.5" strokeWidth={3} />
								)}
							</span>
							<span
								className={cn(
									item.done && "text-marketing-fg-muted line-through",
								)}
							>
								{item.label}
							</span>
						</li>
					))}
				</ul>
			</motion.div>
		</motion.div>
	);
}

export function HeroSection() {
	return (
		<section
			id="hero"
			className="relative scroll-mt-14 overflow-hidden pb-28 pt-12 lg:pb-40"
		>
			{/* Atmosphere */}
			<div className="marketing-spotlight pointer-events-none absolute inset-x-0 top-0 h-[640px]" />
			<div className="marketing-grid pointer-events-none absolute inset-0 opacity-[0.5] [mask-image:radial-gradient(60%_50%_at_50%_0%,black,transparent)]" />

			<div className="relative mx-auto grid max-w-2xl grid-cols-1 items-center gap-16 px-6 md:max-w-3xl lg:max-w-7xl lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:px-10">
				<div className="flex flex-col items-start gap-7 pt-8">
					{/* Headline */}
					<motion.h1
						initial={{ opacity: 0, y: 16 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.7, delay: 0.08, ease }}
						className={cn(
							"max-w-2xl text-balance font-display text-5xl tracking-display-tight",
							"text-marketing-fg",
							"sm:text-6xl sm:leading-[1.04]",
							"lg:text-[4.5rem] lg:leading-[1.02]",
						)}
					>
						Your notes, turned into a{" "}
						<span className="marketing-highlight">tutor</span> that never
						sleeps.
					</motion.h1>

					{/* Description */}
					<motion.p
						initial={{ opacity: 0, y: 16 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.7, delay: 0.16, ease }}
						className="max-w-xl text-lg leading-8 text-marketing-fg-muted"
					>
						Upload your slides, PDFs and notes. StudyNex breaks them into bite-size
						lessons, writes quizzes that adapt to what you get wrong, and builds
						a study plan you'll actually finish, with a Gemini tutor on call
						24/7.
					</motion.p>

					{/* CTA Buttons */}
					<motion.div
						initial={{ opacity: 0, y: 16 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.7, delay: 0.24, ease }}
						className="flex flex-wrap items-center gap-3"
					>
						<Link
							href="/auth/sign-up"
							className={cn(
								"inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold shadow-sm transition",
								"bg-marketing-accent text-marketing-accent-fg hover:bg-marketing-accent-hover",
							)}
						>
							Start learning free
							<ArrowRightIcon className="size-4" />
						</Link>
						<Link
							href="/#how-it-works"
							className={cn(
								"inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition",
								"text-marketing-fg ring-1 ring-marketing-border hover:bg-marketing-card",
							)}
						>
							See how it works
						</Link>
					</motion.div>

					<motion.p
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ duration: 0.7, delay: 0.34, ease }}
						className="text-sm text-marketing-fg-subtle"
					>
						Free to start · No card required · Works with any subject
					</motion.p>
				</div>

				<HeroPreview />
			</div>
		</section>
	);
}
