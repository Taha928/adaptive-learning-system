import { PlayCircleIcon } from "lucide-react";
import { ScrollReveal } from "@/components/marketing/scroll-reveal";
import { StudyNexMascot } from "@/components/studynex-mascot";
import { cn } from "@/lib/utils";

/**
 * Product demo video section (item 23).
 *
 * Drop the finished walkthrough in `public/demo.mp4` (and optionally a
 * `public/demo-poster.jpg`) and it will render automatically. Until then a
 * branded placeholder is shown so the section is ready for the demo.
 */
const DEMO_VIDEO_SRC = "/demo.mp4";
const DEMO_VIDEO_POSTER = "/demo-poster.jpg";
const HAS_DEMO_VIDEO = false; // flip to true once public/demo.mp4 exists

export function DemoVideoSection() {
	return (
		<section id="demo" className="scroll-mt-14 py-20">
			<div className="mx-auto max-w-5xl px-6 lg:px-10">
				<ScrollReveal className="mb-10 flex flex-col items-center gap-4 text-center">
					<h2
						className={cn(
							"text-balance font-display text-[2rem] leading-10 tracking-tight",
							"text-marketing-fg sm:text-5xl sm:leading-14",
						)}
					>
						See StudyNex in action
					</h2>
					<p className="max-w-xl text-lg text-marketing-fg-muted">
						A quick walkthrough of uploading your notes, chatting with the AI
						tutor, and turning your material into adaptive quizzes.
					</p>
				</ScrollReveal>

				<ScrollReveal delay={0.1}>
					<div className="overflow-hidden rounded-2xl border border-marketing-border bg-marketing-card shadow-[0_28px_80px_-30px_rgba(80,50,10,0.35)]">
						{HAS_DEMO_VIDEO ? (
							// biome-ignore lint/a11y/useMediaCaption: product demo, captions added with the final cut
							<video
								className="aspect-video w-full"
								controls
								preload="none"
								poster={DEMO_VIDEO_POSTER}
							>
								<source src={DEMO_VIDEO_SRC} type="video/mp4" />
							</video>
						) : (
							<div className="flex aspect-video w-full flex-col items-center justify-center gap-4 bg-marketing-bg-elevated text-center">
								<StudyNexMascot animated className="size-28" />
								<div className="flex items-center gap-2 text-marketing-fg-muted">
									<PlayCircleIcon className="size-5" />
									<span className="font-medium text-sm">
										Demo video coming soon
									</span>
								</div>
							</div>
						)}
					</div>
				</ScrollReveal>
			</div>
		</section>
	);
}
