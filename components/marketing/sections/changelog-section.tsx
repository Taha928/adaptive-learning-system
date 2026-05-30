"use client";

import { cn } from "@/lib/utils";

const changelog = [
	{
		version: "2.1.0",
		date: "May 2026",
		items: [
			{
				title: "Adaptive study plans",
				description:
					"Tell Lumen your goal and exam date — it builds a day-by-day plan and reshuffles as your mastery changes.",
			},
			{
				title: "Short-answer grading",
				description:
					"Open-ended questions are now graded with AI feedback that explains exactly what was missing.",
			},
			{
				title: "Citations in tutor replies",
				description:
					"Every answer links back to the exact slide or page in your uploaded material.",
			},
		],
	},
	{
		version: "2.0.0",
		date: "March 2026",
		items: [
			{
				title: "Mastery analytics",
				description:
					"Per-topic mastery scores, time-on-task and quiz trends so you study where it counts.",
			},
			{
				title: "Class workspaces",
				description:
					"Share courses with classmates and let instructors track a whole cohort's progress.",
			},
			{
				title: "Gemini 2.5 tutor",
				description:
					"Upgraded the tutor to Gemini 2.5 for faster, more grounded explanations.",
			},
		],
	},
	{
		version: "1.0.0",
		date: "January 2026",
		items: [
			{
				title: "Launch",
				description:
					"Upload materials, auto-build courses and topics, and chat with a tutor grounded in your notes.",
			},
			{
				title: "AI quiz generation",
				description:
					"Generate multiple-choice, true/false and short-answer quizzes from any topic.",
			},
			{
				title: "Progress tracking",
				description:
					"Track attempts, scores and what you've covered across every course.",
			},
		],
	},
];

export function ChangelogSection() {
	return (
		<main className="isolate overflow-clip">
			{/* Hero Section */}
			<section className="py-16 pt-32 lg:pt-40" id="changelog-hero">
				<div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 md:max-w-3xl lg:max-w-7xl lg:px-10">
					<h1
						className={cn(
							"text-balance font-display text-5xl leading-12 tracking-tight",
							"text-marketing-fg",
							"sm:text-[5rem] sm:leading-20",
						)}
					>
						Changelog
					</h1>
					<div className="max-w-3xl text-lg leading-8 text-marketing-fg-muted">
						<p>
							See what we've been working on. New features and improvements
							every month.
						</p>
					</div>
				</div>
			</section>

			{/* Changelog Entries */}
			<section className="py-16" id="releases">
				<div className="mx-auto max-w-2xl px-6 md:max-w-3xl lg:max-w-7xl lg:px-10">
					<div className="flex flex-col gap-16">
						{changelog.map((release) => (
							<div key={release.version} className="flex flex-col gap-6">
								{/* Version Header */}
								<div className="flex items-center gap-4">
									<span className="inline-flex rounded-full bg-marketing-accent px-3 py-1 text-sm font-medium text-marketing-accent-fg">
										v{release.version}
									</span>
									<span className="text-sm text-marketing-fg-subtle">
										{release.date}
									</span>
								</div>

								{/* Release Items */}
								<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
									{release.items.map((item, itemIndex) => (
										<div
											key={itemIndex}
											className="flex flex-col gap-2 rounded-xl bg-marketing-card p-6"
										>
											<h3 className="font-semibold text-marketing-fg">
												{item.title}
											</h3>
											<p className="text-sm text-marketing-fg-muted">
												{item.description}
											</p>
										</div>
									))}
								</div>
							</div>
						))}
					</div>
				</div>
			</section>
		</main>
	);
}
