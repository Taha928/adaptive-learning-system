"use client";

import {
	BookOpenIcon,
	BotIcon,
	ChartColumnIcon,
	ClipboardListIcon,
	FileTextIcon,
	GraduationCapIcon,
	LayoutDashboardIcon,
	ListChecksIcon,
	SettingsIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import * as React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type MenuItem = {
	label: string;
	href: string;
	icon: React.ComponentType<{ className?: string }>;
	exactMatch?: boolean;
};

type MenuGroup = {
	label?: string;
	items: MenuItem[];
};

/**
 * StudyNex student sidebar — grouped, clean academic-tool structure:
 *   • Home + AI Tutor (always-accessible primaries, no section label)
 *   • Learning      — Courses, Study Plan
 *   • Assessments   — Quizzes, My Attempts
 *   • Analytics     — Progress Report, Tutor Analytics
 *   • Settings      — Settings
 */
export function OrganizationMenuItems(): React.JSX.Element {
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const basePath = "/dashboard/organization";

	const menuGroups: MenuGroup[] = [
		{
			items: [
				{
					label: "Home",
					href: basePath,
					icon: LayoutDashboardIcon,
					exactMatch: true,
				},
				{
					label: "AI Tutor",
					href: `${basePath}/chatbot`,
					icon: BotIcon,
				},
			],
		},
		{
			label: "Learning",
			items: [
				{
					label: "Courses",
					href: `${basePath}/courses`,
					icon: BookOpenIcon,
				},
				{
					label: "Study Plan",
					href: `${basePath}/study-plan`,
					icon: GraduationCapIcon,
				},
			],
		},
		{
			label: "Assessments",
			items: [
				{
					label: "Quizzes",
					href: `${basePath}/quizzes`,
					icon: ListChecksIcon,
					exactMatch: true,
				},
				{
					label: "My Attempts",
					href: `${basePath}/quizzes/attempts`,
					icon: ClipboardListIcon,
				},
			],
		},
		{
			label: "Analytics",
			items: [
				{
					label: "Progress Report",
					href: `${basePath}/report`,
					icon: FileTextIcon,
				},
				{
					label: "Tutor Analytics",
					href: `${basePath}/tutor-analytics`,
					icon: ChartColumnIcon,
				},
			],
		},
		{
			label: "Settings",
			items: [
				{
					label: "Settings",
					href: `${basePath}/settings?tab=general`,
					icon: SettingsIcon,
				},
			],
		},
	];

	const getIsActive = React.useCallback(
		(item: MenuItem): boolean => {
			if (item.exactMatch) {
				return pathname === item.href;
			}
			if (item.href.includes("?")) {
				const [itemPath, itemQuery] = item.href.split("?");
				const itemParams = new URLSearchParams(itemQuery);
				const itemTab = itemParams.get("tab");
				const currentTab = searchParams.get("tab");
				if (pathname === itemPath) {
					if (currentTab === itemTab) return true;
					if (itemTab === "general" && !currentTab) return true;
				}
				return false;
			}
			return pathname.startsWith(item.href);
		},
		[pathname, searchParams],
	);

	return (
		<ScrollArea
			className="[&>[data-radix-scroll-area-viewport]>div]:flex! h-full [&>[data-radix-scroll-area-viewport]>div]:h-full [&>[data-radix-scroll-area-viewport]>div]:flex-col [&>[data-radix-scroll-area-viewport]>div]:-space-y-1"
			verticalScrollBar
		>
			{menuGroups.map((group, groupIndex) => (
				<SidebarGroup className="pb-1" key={groupIndex}>
					{group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
					<SidebarMenu>
						{group.items.map((item, itemIndex) => {
							const isActive = getIsActive(item);
							return (
								<SidebarMenuItem key={itemIndex}>
									<SidebarMenuButton
										asChild
										isActive={isActive}
										tooltip={item.label}
									>
										<Link href={item.href}>
											<item.icon
												className={cn(
													"size-4 shrink-0",
													isActive
														? "text-foreground"
														: "text-muted-foreground",
												)}
											/>
											<span
												className={cn(
													isActive
														? "dark:text-foreground"
														: "dark:text-muted-foreground",
												)}
											>
												{item.label}
											</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							);
						})}
					</SidebarMenu>
				</SidebarGroup>
			))}
		</ScrollArea>
	);
}
