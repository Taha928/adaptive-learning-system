import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type * as React from "react";
import { QuizAttemptsTable } from "@/components/organization/quiz-attempts-table";
import {
	Page,
	PageBody,
	PageBreadcrumb,
	PageContent,
	PageHeader,
	PagePrimaryBar,
} from "@/components/ui/custom/page";
import { getOrganizationById, getSession } from "@/lib/auth/server";

export const metadata: Metadata = {
	title: "My Attempts",
};

export default async function MyAttemptsPage(): Promise<React.JSX.Element> {
	const session = await getSession();
	if (!session?.session.activeOrganizationId) {
		redirect("/dashboard");
	}

	const organization = await getOrganizationById(
		session.session.activeOrganizationId,
	);
	if (!organization) {
		redirect("/dashboard");
	}

	return (
		<Page>
			<PageHeader>
				<PagePrimaryBar>
					<PageBreadcrumb
						segments={[
							{ label: "Home", href: "/dashboard" },
							{ label: organization.name, href: "/dashboard/organization" },
							{ label: "Quizzes", href: "/dashboard/organization/quizzes" },
							{ label: "My Attempts" },
						]}
					/>
				</PagePrimaryBar>
			</PageHeader>
			<PageBody>
				<PageContent title="My Attempts">
					<QuizAttemptsTable />
				</PageContent>
			</PageBody>
		</Page>
	);
}
