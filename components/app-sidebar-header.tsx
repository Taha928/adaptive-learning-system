"use client";

import { GraduationCapIcon, ShieldIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type * as React from "react";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { appConfig } from "@/config/app.config";

/**
 * Simple branded workspace header for the StudyNex single-workspace experience.
 *
 * Replaces the multi-tenant organization switcher. There is no organization
 * switching, creation, or "personal account" concept exposed to the user —
 * just the StudyNex brand and the current area (Learning vs Admin Panel).
 * Clicking it returns to the home of the current area.
 */
export function AppSidebarHeader(): React.JSX.Element {
	const pathname = usePathname();
	const isAdminArea = pathname?.startsWith("/dashboard/admin") ?? false;

	const Icon = isAdminArea ? ShieldIcon : GraduationCapIcon;
	const subtitle = isAdminArea ? "Admin Panel" : "Learning";
	// The brand always returns to the learning app, so admins can click it to
	// leave the admin panel.
	const href = "/dashboard/organization";

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<SidebarMenuButton
					asChild
					className="-mt-1 p-2 transition-none group-data-[collapsible=icon]:ml-1.5 group-data-[collapsible=icon]:h-12! group-data-[collapsible=icon]:bg-transparent!"
					size="lg"
					tooltip={appConfig.appName}
				>
					<Link href={href}>
						<div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
							<Icon className="size-4" />
						</div>
						<div className="flex flex-1 flex-col items-start gap-0.5 overflow-hidden text-left group-data-[collapsible=icon]:hidden">
							<span className="block w-full truncate font-semibold leading-none">
								{appConfig.appName}
							</span>
							<span className="block w-full truncate text-muted-foreground text-xs leading-none">
								{subtitle}
							</span>
						</div>
					</Link>
				</SidebarMenuButton>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
