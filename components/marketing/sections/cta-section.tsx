"use client";

import { ArrowRightIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface CtaContent {
	headline: string;
	description: string;
	primaryCta: {
		text: string;
		href: string;
	};
	secondaryCta: {
		text: string;
		href: string;
	};
}

interface CtaSectionProps {
	centered?: boolean;
	content: CtaContent;
}

export function CtaSection({ centered = true, content }: CtaSectionProps) {
	const { headline, description, primaryCta, secondaryCta } = content;

	return (
		<section id="cta" className="px-6 py-20 lg:px-10 lg:py-28">
			<div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl border border-marketing-border bg-marketing-card px-6 py-16 sm:px-12 lg:py-24">
				<div className="marketing-spotlight pointer-events-none absolute inset-0" />
				<div className="marketing-grid pointer-events-none absolute inset-0 opacity-50 [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent)]" />

				<div
					className={cn(
						"relative flex flex-col gap-7",
						centered && "items-center text-center",
					)}
				>
					<span className="inline-flex items-center gap-1.5 rounded-full bg-marketing-accent-soft px-3 py-1 text-xs font-semibold text-marketing-fg">
						<SparklesIcon className="size-3.5 text-marketing-accent" />
						Free to start
					</span>

					<h2
						className={cn(
							"max-w-3xl text-balance font-display text-4xl leading-tight tracking-tight text-marketing-fg",
							"sm:text-5xl",
						)}
					>
						{headline}
					</h2>

					<p className="max-w-2xl text-pretty text-base leading-7 text-marketing-fg-muted sm:text-lg">
						{description}
					</p>

					<div
						className={cn(
							"flex flex-wrap items-center gap-3",
							centered && "justify-center",
						)}
					>
						<Link
							href={primaryCta.href}
							className={cn(
								"inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold shadow-sm transition",
								"bg-marketing-accent text-marketing-accent-fg hover:bg-marketing-accent-hover",
							)}
						>
							{primaryCta.text}
							<ArrowRightIcon className="size-4" />
						</Link>
						<Link
							href={secondaryCta.href}
							className={cn(
								"group inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition",
								"text-marketing-fg ring-1 ring-marketing-border hover:bg-marketing-bg-elevated",
							)}
						>
							{secondaryCta.text}
							<ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
						</Link>
					</div>
				</div>
			</div>
		</section>
	);
}
