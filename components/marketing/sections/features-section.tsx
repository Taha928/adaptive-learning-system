"use client";

import {
	CalendarCheckIcon,
	FileStackIcon,
	LineChartIcon,
	type LucideIcon,
	MessageCircleQuestionIcon,
	SparklesIcon,
	UsersRoundIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface Feature {
	title: string;
	description: string;
	icon: LucideIcon;
	className: string;
	accent?: boolean;
}

const features: Feature[] = [
	{
		title: "A tutor that knows your material",
		description:
			"Ask anything and get answers grounded in your own uploads, with citations back to the exact slide or page. Powered by advanced AI, available any hour of the night before the exam.",
		icon: SparklesIcon,
		className: "lg:col-span-2 lg:row-span-2",
		accent: true,
	},
	{
		title: "Notes in, course out",
		description:
			"Drop in PDFs, docs or links. StudyNex extracts the text and structures it into topics and bite-size lessons.",
		icon: FileStackIcon,
		className: "lg:col-span-2",
	},
	{
		title: "Quizzes that adapt",
		description:
			"Auto-generated multiple-choice, true/false and short-answer questions that lean into whatever you keep missing, each graded with feedback.",
		icon: MessageCircleQuestionIcon,
		className: "",
	},
	{
		title: "A plan you'll finish",
		description:
			"Tell StudyNex your goal and exam date. It builds a day-by-day study plan and adjusts as you go.",
		icon: CalendarCheckIcon,
		className: "",
	},
	{
		title: "See what's sticking",
		description:
			"Mastery scores per topic, time-on-task and quiz trends, so you spend your hours where they count.",
		icon: LineChartIcon,
		className: "",
	},
	{
		title: "Study together",
		description:
			"Share courses in a workspace, invite classmates, and let instructors track the whole cohort.",
		icon: UsersRoundIcon,
		className: "",
	},
];

function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
	const Icon = feature.icon;
	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-60px" }}
			transition={{
				duration: 0.55,
				delay: (index % 3) * 0.08,
				ease: [0.21, 0.5, 0.18, 1],
			}}
			className={cn(
				"group relative flex flex-col gap-4 overflow-hidden rounded-2xl border p-6 sm:p-7",
				feature.accent
					? "border-marketing-border bg-marketing-accent-soft"
					: "border-marketing-border bg-marketing-card",
				feature.className,
			)}
		>
			{feature.accent && (
				<div className="marketing-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(80%_80%_at_80%_0%,black,transparent)]" />
			)}
			<span
				className={cn(
					"relative flex size-11 items-center justify-center rounded-xl",
					feature.accent
						? "bg-marketing-accent text-marketing-accent-fg"
						: "bg-marketing-bg-elevated text-marketing-accent ring-1 ring-marketing-border",
				)}
			>
				<Icon className="size-5" />
			</span>
			<div className="relative flex flex-col gap-2">
				<h3
					className={cn(
						"font-display text-marketing-fg tracking-tight",
						feature.accent ? "text-2xl sm:text-3xl" : "text-lg",
					)}
				>
					{feature.title}
				</h3>
				<p
					className={cn(
						"text-marketing-fg-muted leading-7",
						feature.accent ? "text-base max-w-md" : "text-sm",
					)}
				>
					{feature.description}
				</p>
			</div>
		</motion.div>
	);
}

export function FeaturesSection() {
	return (
		<section id="features" className="scroll-mt-14 py-20 lg:py-28">
			<div className="mx-auto flex max-w-2xl flex-col gap-12 px-6 md:max-w-3xl lg:max-w-7xl lg:gap-16 lg:px-10">
				{/* Header */}
				<div className="flex max-w-2xl flex-col gap-4">
					<div className="text-sm font-semibold uppercase tracking-widest text-marketing-accent">
						Everything to learn it once
					</div>
					<h2
						className={cn(
							"text-pretty font-display text-4xl leading-tight tracking-tight text-marketing-fg",
							"sm:text-5xl",
						)}
					>
						One workspace from <span className="marketing-em">first read</span>{" "}
						to exam day.
					</h2>
					<p className="text-base leading-7 text-marketing-fg-muted text-pretty">
						No more juggling a PDF reader, a flashcard app and a calendar.
						StudyNex pulls the whole study loop into one place, and the AI does
						the busy work.
					</p>
				</div>

				{/* Bento Grid */}
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{features.map((feature, index) => (
						<FeatureCard key={feature.title} feature={feature} index={index} />
					))}
				</div>
			</div>
		</section>
	);
}
