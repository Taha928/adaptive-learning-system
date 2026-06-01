"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const ease = [0.21, 0.5, 0.18, 1] as const;

/**
 * Subtle rotating text — cycles through phrases with a fade/slide transition.
 * Used in the hero (item 12) and the "learn from anything" line (item 13).
 * Intentionally not a marquee; modern fade rotation instead.
 */
export function RotatingText({
	phrases,
	interval = 2400,
	className,
}: {
	phrases: string[];
	interval?: number;
	className?: string;
}) {
	const [index, setIndex] = useState(0);

	useEffect(() => {
		if (phrases.length <= 1) return;
		const id = setInterval(() => {
			setIndex((i) => (i + 1) % phrases.length);
		}, interval);
		return () => clearInterval(id);
	}, [phrases.length, interval]);

	return (
		<span className={cn("relative inline-flex overflow-hidden", className)}>
			<AnimatePresence mode="wait">
				<motion.span
					key={index}
					initial={{ opacity: 0, y: "0.6em" }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: "-0.6em" }}
					transition={{ duration: 0.4, ease }}
					className="inline-block"
				>
					{phrases[index]}
				</motion.span>
			</AnimatePresence>
		</span>
	);
}
