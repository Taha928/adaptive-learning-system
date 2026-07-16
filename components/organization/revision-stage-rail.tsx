"use client";

import { CheckIcon } from "lucide-react";
import type { AdaptiveStage } from "@/hooks/use-adaptive-attempt";
import { cn } from "@/lib/utils";

const STAGE_LABEL: Record<string, string> = {
	easy: "Easy",
	medium: "Medium",
	hard: "Hard",
};

/**
 * Where you are on the Easy -> Medium -> Hard ladder.
 *
 * An assessment must never show this — the level is a control signal there, and
 * naming it turns a diagnostic into a label. Revision is the opposite case: the
 * ladder IS the progress, and seeing "Easy done, Medium next" is the reward for
 * doing the work.
 */
export function RevisionStageRail({
	stage,
	className,
}: {
	stage: AdaptiveStage;
	className?: string;
}) {
	return (
		<div className={cn("flex items-center gap-1", className)}>
			{stage.stages.map((s, i) => {
				const isCurrent = stage.current === s.stage;
				return (
					<div key={s.stage} className="flex flex-1 items-center gap-1">
						<div
							className={cn(
								"flex min-w-0 flex-1 flex-col gap-1.5 rounded-md border px-2.5 py-2 transition-colors",
								s.complete && "border-emerald-500/40 bg-emerald-500/5",
								isCurrent && "border-primary bg-primary/5",
								!s.complete && !isCurrent && "opacity-55",
							)}
						>
							<span className="flex items-center gap-1.5 font-medium text-xs">
								{s.complete && (
									<CheckIcon className="size-3 shrink-0 text-emerald-600" />
								)}
								<span
									className={cn(
										"truncate",
										s.complete && "text-emerald-700 dark:text-emerald-400",
										isCurrent && "text-primary",
									)}
								>
									{STAGE_LABEL[s.stage] ?? s.stage}
								</span>
							</span>
							{/* Segments rather than a bar: a stage can run past its target
							    when answers are wrong, and a bar that overflows reads as a
							    bug. Dots just keep filling. */}
							<span className="flex gap-0.5">
								{Array.from({
									length: Math.max(stage.perStage, s.answered),
								}).map((_, dot) => (
									<span
										key={dot}
										className={cn(
											"h-1 flex-1 rounded-full",
											dot < s.answered
												? s.complete
													? "bg-emerald-500"
													: "bg-primary"
												: "bg-muted",
										)}
									/>
								))}
							</span>
						</div>
						{i < stage.stages.length - 1 && (
							<span
								className={cn(
									"h-px w-2 shrink-0",
									s.complete ? "bg-emerald-500/50" : "bg-border",
								)}
							/>
						)}
					</div>
				);
			})}
		</div>
	);
}
