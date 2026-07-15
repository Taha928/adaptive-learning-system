import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type * as React from "react";
import { TopicLesson } from "@/components/organization/topic-lesson";
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
	title: "Learn Topic",
};

export type TopicLessonPageProps = {
	params: Promise<{ topicId: string }>;
};

export default async function TopicLessonPage({
	params,
}: TopicLessonPageProps): Promise<React.JSX.Element> {
	const { topicId } = await params;

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
							{ label: "Courses", href: "/dashboard/organization/courses" },
							{ label: "Lesson" },
						]}
					/>
				</PagePrimaryBar>
			</PageHeader>
			<PageBody>
				<PageContent title="Learn">
					<TopicLesson topicId={topicId} />
				</PageContent>
			</PageBody>
		</Page>
	);
}
