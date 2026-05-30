"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

const steps = [
	{
		step: "01",
		title: "Bring your material",
		description:
			"Upload lecture slides, a textbook chapter, your messy notes or even a YouTube link. Lumen reads it all and organizes it into topics.",
	},
	{
		step: "02",
		title: "Learn, then prove it",
		description:
			"Work through AI lessons, ask the tutor anything, and take quizzes that adapt to your weak spots. Every answer comes with feedback.",
	},
	{
		step: "03",
		title: "Track and adapt",
		description:
			"Watch mastery climb topic by topic. Lumen reshuffles your study plan so you're always revising the thing you're about to forget.",
	},
];

export function HowItWorksSection() {
	return (
		<section id="how-it-works" className="scroll-mt-14 py-20 lg:py-28">
			<div className="mx-auto flex max-w-2xl flex-col gap-12 px-6 md:max-w-3xl lg:max-w-7xl lg:gap-16 lg:px-10">
				<div className="flex max-w-2xl flex-col gap-4">
					<div className="text-sm font-semibold uppercase tracking-widest text-marketing-accent">
						How it works
					</div>
					<h2 className="text-pretty font-display text-4xl leading-tight tracking-tight text-marketing-fg sm:text-5xl">
						From overwhelmed to{" "}
						<span className="marketing-em">on top of it</span> in three steps.
					</h2>
				</div>

				<div className="relative grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6">
					{/* connecting line on desktop */}
					<div className="pointer-events-none absolute left-0 right-0 top-7 hidden h-px bg-marketing-border md:block" />
					{steps.map((s, i) => (
						<motion.div
							key={s.step}
							initial={{ opacity: 0, y: 24 }}
							whileInView={{ opacity: 1, y: 0 }}
							viewport={{ once: true, margin: "-60px" }}
							transition={{
								duration: 0.55,
								delay: i * 0.12,
								ease: [0.21, 0.5, 0.18, 1],
							}}
							className="relative flex flex-col gap-4"
						>
							<span
								className={cn(
									"relative z-10 flex size-14 items-center justify-center rounded-full font-display text-lg font-semibold",
									"border border-marketing-border bg-marketing-bg-elevated text-marketing-accent shadow-sm",
								)}
							>
								{s.step}
							</span>
							<h3 className="font-display text-xl text-marketing-fg tracking-tight">
								{s.title}
							</h3>
							<p className="text-sm leading-7 text-marketing-fg-muted">
								{s.description}
							</p>
						</motion.div>
					))}
				</div>
			</div>
		</section>
	);
}
