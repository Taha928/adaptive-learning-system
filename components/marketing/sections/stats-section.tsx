"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface Stat {
	value: string;
	label: string;
	description: string;
}

export function StatsSection() {
	const stats: Stat[] = [
		{
			value: "2.4M+",
			label: "Questions practiced",
			description: "Adaptive quiz questions answered by learners.",
		},
		{
			value: "3×",
			label: "Faster review",
			description: "Less re-reading, more recall that actually sticks.",
		},
		{
			value: "94%",
			label: "Hit their goal",
			description: "Of learners who finish their plan reach their target.",
		},
		{
			value: "24/7",
			label: "Tutor on call",
			description: "Answers grounded in your notes, any hour.",
		},
	];

	return (
		<section id="stats" className="py-20 lg:py-24">
			<div className="mx-auto max-w-2xl px-6 md:max-w-3xl lg:max-w-7xl lg:px-10">
				<div className="overflow-hidden rounded-3xl border border-marketing-border bg-marketing-card">
					<div className="grid grid-cols-2 divide-marketing-border lg:grid-cols-4 lg:divide-x">
						{stats.map((stat, i) => (
							<motion.div
								key={stat.label}
								initial={{ opacity: 0, y: 16 }}
								whileInView={{ opacity: 1, y: 0 }}
								viewport={{ once: true }}
								transition={{ duration: 0.5, delay: i * 0.08 }}
								className={cn(
									"flex flex-col gap-1 p-7 lg:p-9",
									i < 2 && "border-b border-marketing-border lg:border-b-0",
									i % 2 === 1 && "border-l border-marketing-border lg:border-l",
								)}
							>
								<div className="font-display text-4xl tracking-tight text-marketing-fg sm:text-5xl">
									{stat.value}
								</div>
								<div className="mt-2 text-sm font-semibold text-marketing-fg">
									{stat.label}
								</div>
								<p className="text-sm leading-6 text-marketing-fg-muted">
									{stat.description}
								</p>
							</motion.div>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}
