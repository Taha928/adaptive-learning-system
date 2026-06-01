"use client";

import { RotatingText } from "@/components/marketing/rotating-text";

// Item 13: rotate through the kinds of material StudyNex learns from, instead
// of a scrolling list of subjects (item 12 — no old-school marquee).
const sources = [
	"Lecture Notes",
	"Assignments",
	"Past Papers",
	"Textbooks",
	"PPT Slides",
	"Exam Preparation",
];

export function LogoCloudSection() {
	return (
		<section className="border-t border-marketing-border/60 py-12">
			<div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-6 text-center lg:px-10">
				<p className="font-medium text-marketing-fg-subtle text-sm uppercase tracking-widest">
					Turn anything into a lesson
				</p>
				<p className="font-display text-2xl text-marketing-fg sm:text-3xl">
					Learn from your{" "}
					<RotatingText
						phrases={sources}
						interval={1900}
						className="text-marketing-accent"
					/>
				</p>
			</div>
		</section>
	);
}
