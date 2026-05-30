"use client";

import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { appConfig } from "@/config/app.config";
import { cn } from "@/lib/utils";

const stats = [
	{
		value: "2.4M+",
		description: "Adaptive questions practiced by learners every month.",
	},
	{
		value: "120+",
		description:
			"Subjects studied, from organic chemistry to constitutional law.",
	},
];

const values = [
	{
		title: "Understanding over memorizing",
		description:
			"We design for recall and reasoning, not cramming. If you can't explain it, you haven't learned it yet.",
	},
	{
		title: "Grounded, not hallucinated",
		description:
			"Every answer ties back to your own material with a citation. The tutor admits when it doesn't know.",
	},
	{
		title: "Meet learners where they are",
		description:
			"Adaptive by default. The plan bends to your pace, your gaps and your exam date — not the other way around.",
	},
	{
		title: "Your work is yours",
		description:
			"Your uploads stay private to your workspace and are never used to train models. Full stop.",
	},
];

export function AboutSection() {
	return (
		<main className="isolate overflow-clip">
			{/* Hero Section */}
			<section className="relative py-16 pt-32 lg:pt-40" id="hero">
				<div className="marketing-spotlight pointer-events-none absolute inset-x-0 top-0 h-96" />
				<div className="relative mx-auto flex max-w-2xl flex-col gap-32 px-6 md:max-w-3xl lg:max-w-7xl lg:px-10">
					<div className="flex flex-col gap-32">
						<div className="flex flex-col items-start gap-6">
							<div className="text-sm font-semibold uppercase tracking-widest text-marketing-accent">
								Our mission
							</div>
							<h1
								className={cn(
									"text-balance font-display text-5xl leading-[1.05] tracking-tight",
									"text-marketing-fg",
									"sm:text-[5rem] sm:leading-[1.02]",
								)}
							>
								Great tutoring, for{" "}
								<span className="marketing-em">everyone.</span>
							</h1>
							<div className="flex max-w-3xl flex-col gap-4 text-lg leading-8 text-marketing-fg-muted">
								<p>
									A one-on-one tutor is the single most effective way to learn —
									and historically the most expensive. {appConfig.appName}{" "}
									exists to close that gap: take the material a learner already
									has, and turn it into a patient, always-available tutor that
									teaches, quizzes and plans around them.
								</p>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* Stats Section */}
			<section className="py-16" id="stats">
				<div className="mx-auto flex max-w-2xl flex-col gap-10 px-6 md:max-w-3xl lg:max-w-7xl lg:gap-16 lg:px-10">
					<div className="flex max-w-2xl flex-col gap-6">
						<div className="flex flex-col gap-2">
							<div className="text-sm font-semibold text-marketing-fg-muted">
								The 2-sigma problem, at scale
							</div>
							<h2
								className={cn(
									"text-pretty font-display text-4xl leading-tight tracking-tight",
									"text-marketing-fg",
									"sm:text-5xl",
								)}
							>
								Built on the science of how people actually learn.
							</h2>
						</div>
						<div className="text-base leading-7 text-marketing-fg-muted text-pretty">
							<p>
								Retrieval practice, spaced repetition and immediate feedback are
								the most reliable findings in learning research.{" "}
								{appConfig.appName} wires them into a loop that runs on your own
								coursework.
							</p>
						</div>
					</div>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						{stats.map((stat) => (
							<div
								key={stat.value}
								className="relative rounded-2xl border border-marketing-border bg-marketing-card p-7"
							>
								<div className="font-display text-4xl tracking-tight text-marketing-fg sm:text-5xl">
									{stat.value}
								</div>
								<p className="mt-2 text-sm leading-6 text-marketing-fg-muted">
									{stat.description}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* Values Section */}
			<section className="py-16" id="values">
				<div className="mx-auto flex max-w-2xl flex-col gap-10 px-6 md:max-w-3xl lg:max-w-7xl lg:gap-16 lg:px-10">
					<div className="flex max-w-2xl flex-col gap-6">
						<div className="flex flex-col gap-2">
							<h2
								className={cn(
									"text-pretty font-display text-4xl leading-tight tracking-tight",
									"text-marketing-fg",
									"sm:text-5xl",
								)}
							>
								What we believe
							</h2>
						</div>
						<div className="text-base leading-7 text-marketing-fg-muted text-pretty">
							<p>The principles behind every product decision we make.</p>
						</div>
					</div>
					<div>
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
							{values.map((value) => (
								<div
									key={value.title}
									className="relative rounded-2xl border border-marketing-border bg-marketing-card p-7"
								>
									<p className="font-display text-lg text-marketing-fg">
										{value.title}
									</p>
									<p className="mt-2 text-sm leading-6 text-marketing-fg-muted">
										{value.description}
									</p>
								</div>
							))}
						</div>
					</div>
				</div>
			</section>

			{/* CTA Section */}
			<section className="py-16" id="cta">
				<div className="mx-auto flex max-w-2xl flex-col gap-10 px-6 md:max-w-3xl lg:max-w-7xl lg:px-10">
					<div className="flex flex-col gap-6">
						<div className="flex max-w-4xl flex-col gap-2">
							<h2
								className={cn(
									"text-pretty font-display text-4xl leading-tight tracking-tight",
									"text-marketing-fg",
									"sm:text-5xl",
								)}
							>
								Come learn with us.
							</h2>
						</div>
						<div className="max-w-3xl text-base leading-7 text-marketing-fg-muted text-pretty">
							<p>
								Bring your next chapter, lecture or certification.{" "}
								{appConfig.appName} will turn it into something you can actually
								master.
							</p>
						</div>
					</div>
					<div className="flex items-center gap-4">
						<Link
							href="/auth/sign-up"
							className={cn(
								"inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold shadow-sm",
								"bg-marketing-accent text-marketing-accent-fg hover:bg-marketing-accent-hover",
							)}
						>
							Start learning free
						</Link>
						<Link
							href="/contact"
							className={cn(
								"group inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium",
								"text-marketing-fg ring-1 ring-marketing-border hover:bg-marketing-card",
							)}
						>
							Talk to us
							<ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
						</Link>
					</div>
				</div>
			</section>
		</main>
	);
}
