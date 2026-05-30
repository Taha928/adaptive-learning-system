"use client";

import { InfiniteSlider } from "@/components/marketing/primitives/infinite-slider";
import { ProgressiveBlur } from "@/components/marketing/primitives/progressive-blur";

const subjects = [
	"Organic Chemistry",
	"Calculus",
	"Anatomy & Physiology",
	"Machine Learning",
	"Constitutional Law",
	"Macroeconomics",
	"Data Structures",
	"Microbiology",
	"Statistics",
	"World History",
	"Pharmacology",
	"Linear Algebra",
];

export function LogoCloudSection() {
	return (
		<section className="border-t border-marketing-border/60 py-10">
			<div className="mx-auto max-w-7xl px-6 lg:px-10">
				<p className="mb-8 text-center text-sm font-medium uppercase tracking-widest text-marketing-fg-subtle">
					Learners are mastering everything from
				</p>
			</div>
			<div className="group relative mx-auto max-w-screen-2xl overflow-hidden px-4 sm:px-6 md:px-12">
				<InfiniteSlider speedOnHover={20} speed={40} gap={56}>
					{subjects.map((subject) => (
						<span
							key={subject}
							className="whitespace-nowrap font-display text-xl text-marketing-fg-muted sm:text-2xl"
						>
							{subject}
						</span>
					))}
				</InfiniteSlider>

				<ProgressiveBlur
					className="pointer-events-none absolute inset-y-0 left-0 h-full w-24"
					direction="left"
					blurIntensity={1}
				/>
				<ProgressiveBlur
					className="pointer-events-none absolute inset-y-0 right-0 h-full w-24"
					direction="right"
					blurIntensity={1}
				/>
			</div>
		</section>
	);
}
