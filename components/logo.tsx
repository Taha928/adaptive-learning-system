import type * as React from "react";
import { appConfig } from "@/config/app.config";
import { cn } from "@/lib/utils";

export type LogoProps = {
	className?: string;
	withLabel?: boolean;
};

export function Logo({
	withLabel = true,
	className,
}: LogoProps): React.JSX.Element {
	return (
		<span
			className={cn(
				"flex items-center font-semibold text-foreground leading-none",
				className,
			)}
		>
			<div className="flex size-9 items-center justify-center p-1">
				<div className="flex size-7 items-center justify-center rounded-[0.5rem] border bg-primary text-primary-foreground shadow-sm">
					<svg
						width="17"
						height="17"
						viewBox="0 0 24 24"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
						aria-hidden="true"
					>
						{/* Spark of insight: a four-point star of light */}
						<path
							d="M12 1.5c.46 4.86 1.64 6.04 6.5 6.5-4.86.46-6.04 1.64-6.5 6.5-.46-4.86-1.64-6.04-6.5-6.5 4.86-.46 6.04-1.64 6.5-6.5Z"
							fill="currentColor"
						/>
						<path
							d="M18 14.25c.27 2.86.96 3.55 3.82 3.82-2.86.27-3.55.96-3.82 3.82-.27-2.86-.96-3.55-3.82-3.82 2.86-.27 3.55-.96 3.82-3.82Z"
							fill="currentColor"
							opacity="0.7"
						/>
					</svg>
				</div>
			</div>
			{withLabel && (
				<span className="ml-2 hidden font-bold text-lg tracking-tight md:block">
					{appConfig.appName}
				</span>
			)}
		</span>
	);
}
