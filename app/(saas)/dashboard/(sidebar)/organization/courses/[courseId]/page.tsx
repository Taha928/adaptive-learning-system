import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type * as React from "react";
import { CourseDetail } from "@/components/organization/course-detail";
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
	title: "Course",
};

export type CourseDetailPageProps = {
	params: Promise<{ courseId: string }>;
};

export default async function CourseDetailPage({
	params,
}: CourseDetailPageProps): Promise<React.JSX.Element> {
	const { courseId } = await params;

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
							{ label: "Detail" },
						]}
					/>
				</PagePrimaryBar>
			</PageHeader>
			<PageBody>
				<PageContent title="Course">
					<CourseDetail courseId={courseId} />
				</PageContent>
			</PageBody>
		</Page>
	);
}
