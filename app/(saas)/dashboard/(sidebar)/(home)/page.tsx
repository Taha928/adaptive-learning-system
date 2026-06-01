import { redirect } from "next/navigation";
import type * as React from "react";
import { ensureActiveWorkspace } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * StudyNex presents a single-workspace experience. The dashboard root no longer
 * shows an organization picker — it ensures the signed-in user has an active
 * workspace and sends them straight into it.
 */
export default async function DashboardHomePage(): Promise<React.JSX.Element> {
	const workspaceId = await ensureActiveWorkspace();

	if (!workspaceId) {
		redirect("/auth/sign-in");
	}

	redirect("/dashboard/organization");
}
