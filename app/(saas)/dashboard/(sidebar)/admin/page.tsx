import type { Metadata } from "next";
import type * as React from "react";
import { AdminOverview } from "@/components/admin/admin-overview";
import {
	Page,
	PageBody,
	PageBreadcrumb,
	PageContent,
	PageHeader,
	PagePrimaryBar,
} from "@/components/ui/custom/page";

export const metadata: Metadata = {
	title: "Admin Overview",
};

export default function AdminOverviewPage(): React.JSX.Element {
	return (
		<Page>
			<PageHeader>
				<PagePrimaryBar>
					<PageBreadcrumb
						segments={[
							{ label: "Home", href: "/dashboard" },
							{ label: "Admin" },
						]}
					/>
				</PagePrimaryBar>
			</PageHeader>
			<PageBody>
				<PageContent title="Overview">
					<AdminOverview />
				</PageContent>
			</PageBody>
		</Page>
	);
}
