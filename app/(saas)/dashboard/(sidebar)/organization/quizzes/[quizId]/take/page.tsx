import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type * as React from "react";
import { QuizRunner } from "@/components/organization/quiz-runner";
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
	title: "Take Quiz",
};

export type TakeQuizPageProps = {
	params: Promise<{ quizId: string }>;
};

export default async function TakeQuizPage({
	params,
}: TakeQuizPageProps): Promise<React.JSX.Element> {
	const { quizId } = await params;

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
							{ label: "Take" },
						]}
					/>
				</PagePrimaryBar>
			</PageHeader>
			<PageBody>
				<PageContent title="Take Quiz">
					<QuizRunner quizId={quizId} />
				</PageContent>
			</PageBody>
		</Page>
	);
}
