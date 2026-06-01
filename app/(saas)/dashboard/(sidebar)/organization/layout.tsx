import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type * as React from "react";
import { OrganizationMenuItems } from "@/components/organization/organization-menu-items";
import { SidebarLayout } from "@/components/sidebar-layout";
import {
	ensureActiveWorkspace,
	getOrganizationById,
	getSession,
} from "@/lib/auth/server";
import { shouldRedirectToChoosePlan } from "@/lib/billing/guards";
import { OrganizationProviders } from "./providers";

export type OrganizationLayoutProps = React.PropsWithChildren;

/**
 * Organization layout that requires an active organization in the session.
 * If no active organization is set, redirects to /dashboard to select one.
 * If billing requires a plan and none is active, redirects to /dashboard/choose-plan.
 */
export default async function OrganizationLayout({
	children,
}: OrganizationLayoutProps): Promise<React.JSX.Element> {
	const session = await getSession();

	// If no session, the auth middleware will handle redirect
	if (!session) {
		redirect("/auth/sign-in");
	}

	// Single-workspace model: if the session has no active workspace yet (or its
	// write didn't land), self-heal here by ensuring/activating one and loading
	// it directly by id. This avoids a redirect ping-pong with /dashboard.
	const activeOrganizationId =
		session.session.activeOrganizationId ?? (await ensureActiveWorkspace());
	if (!activeOrganizationId) {
		redirect("/auth/sign-in");
	}

	// Get the active organization details
	const organization = await getOrganizationById(activeOrganizationId);
	if (!organization) {
		// Workspace genuinely missing — fall back to the dashboard entry point.
		redirect("/dashboard");
	}

	// Check if user needs to choose a plan before accessing organization
	const needsToChoosePlan = await shouldRedirectToChoosePlan(organization.id);
	if (needsToChoosePlan) {
		redirect("/dashboard/choose-plan");
	}

	const cookieStore = await cookies();

	return (
		<OrganizationProviders organization={organization}>
			<SidebarLayout
				defaultOpen={cookieStore.get("sidebar_state")?.value !== "false"}
				defaultWidth={cookieStore.get("sidebar_width")?.value}
				menuItems={<OrganizationMenuItems />}
			>
				{children}
			</SidebarLayout>
		</OrganizationProviders>
	);
}
