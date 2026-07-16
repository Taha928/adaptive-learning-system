"use client";

import type * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useStorage } from "@/hooks/use-storage";
import { initialsFor } from "@/lib/auth/profile";
import { cn } from "@/lib/utils";

export type UserAvatarProps = {
	name: string;
	/**
	 * The user's picture. A Google account supplies an absolute URL here (via
	 * Better Auth's `user.image`) and useStorage passes it straight through; an
	 * uploaded avatar is a bucket key and gets resolved. Absent for a plain
	 * email sign-up, which is what the initials are for.
	 */
	src?: string | null;
	email?: string | null;
	className?: string;
	fallbackClassName?: string;
};

export function UserAvatar({
	name,
	src,
	email,
	className,
	fallbackClassName,
}: UserAvatarProps): React.JSX.Element {
	const signedUrl = useStorage(src);
	return (
		<Avatar className={cn("size-8 group-focus:ring-2", className)}>
			<AvatarImage src={signedUrl ?? undefined} alt={name} />
			<AvatarFallback
				className={cn("bg-neutral-200 dark:bg-neutral-700", fallbackClassName)}
			>
				<span className="font-medium text-xs" suppressHydrationWarning>
					{initialsFor(name, email)}
				</span>
			</AvatarFallback>
		</Avatar>
	);
}
