import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type * as React from "react";
import { QuizResultView } from "@/components/organization/quiz-result-view";
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
	title: "Attempt Result",
};

export type AttemptResultPageProps = {
	params: Promise<{ attemptId: string }>;
};

export default async function AttemptResultPage({
	params,
}: AttemptResultPageProps): Promise<React.JSX.Element> {
	const { attemptId } = await params;

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
							{
								label: "My Attempts",
								href: "/dashboard/organization/quizzes/attempts",
							},
							{ label: "Result" },
						]}
					/>
				</PagePrimaryBar>
			</PageHeader>
			<PageBody>
				<PageContent title="Attempt Result">
					<QuizResultView attemptId={attemptId} />
				</PageContent>
			</PageBody>
		</Page>
	);
}
