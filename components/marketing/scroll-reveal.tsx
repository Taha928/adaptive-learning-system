"use client";

import { motion } from "motion/react";
import type * as React from "react";

const ease = [0.21, 0.5, 0.18, 1] as const;

/**
 * Scroll-based reveal wrapper (item 14): children fade + slide up as they enter
 * the viewport. Soft, professional motion in keeping with Khanmigo/Notion.
 */
export function ScrollReveal({
	children,
	delay = 0,
	className,
}: {
	children: React.ReactNode;
	delay?: number;
	className?: string;
}) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 24 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-80px" }}
			transition={{ duration: 0.6, delay, ease }}
			className={className}
		>
			{children}
		</motion.div>
	);
}
