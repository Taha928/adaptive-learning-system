import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * StudyNex mascot — a friendly graduate "spark" companion (Duolingo-style brand
 * character). Clean, minimal and professional. Inherits the theme accent via
 * `text-primary`, so it adapts to the palette. Reused for empty states,
 * onboarding, milestones, and as the Nex help-bot avatar.
 *
 * Pass `animated` for a gentle idle bob + occasional wiggle (respects
 * prefers-reduced-motion via the `motion-safe:` variant).
 */
export function StudyNexMascot({
	className,
	animated = false,
	...props
}: React.SVGProps<SVGSVGElement> & { animated?: boolean }) {
	return (
		<svg
			viewBox="0 0 120 120"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			role="img"
			aria-label="StudyNex mascot"
			className={cn(
				"text-primary [transform-origin:50%_80%]",
				animated &&
					"motion-safe:animate-mascot-bob motion-safe:hover:animate-mascot-wiggle",
				className,
			)}
			{...props}
		>
			<title>StudyNex mascot</title>
			{/* soft shadow */}
			<ellipse cx="60" cy="110" rx="30" ry="5" className="fill-black/5" />

			{/* body */}
			<rect x="22" y="36" width="76" height="72" rx="28" fill="currentColor" />
			{/* belly highlight */}
			<rect
				x="34"
				y="58"
				width="52"
				height="44"
				rx="22"
				className="fill-white/15"
			/>

			{/* eyes */}
			<circle cx="47" cy="66" r="12" fill="white" />
			<circle cx="73" cy="66" r="12" fill="white" />
			<circle cx="49" cy="68" r="5.5" className="fill-slate-800" />
			<circle cx="71" cy="68" r="5.5" className="fill-slate-800" />
			<circle cx="51" cy="66" r="1.8" fill="white" />
			<circle cx="73" cy="66" r="1.8" fill="white" />

			{/* smile */}
			<path
				d="M50 86 Q60 95 70 86"
				stroke="white"
				strokeWidth="4"
				strokeLinecap="round"
				fill="none"
			/>

			{/* graduation cap */}
			<path d="M60 12 L94 26 L60 40 L26 26 Z" className="fill-slate-800" />
			<path d="M44 33 L44 44 Q60 52 76 44 L76 33" className="fill-slate-700" />
			{/* tassel */}
			<path
				d="M94 26 L94 40"
				stroke="currentColor"
				strokeWidth="2.5"
				strokeLinecap="round"
			/>
			<circle cx="94" cy="43" r="3.5" fill="currentColor" />
		</svg>
	);
}
