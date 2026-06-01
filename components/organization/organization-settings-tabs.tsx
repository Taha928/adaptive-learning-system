"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";
import type * as React from "react";
import { CreditsSettingsTab } from "@/components/billing/credits-settings-tab";
import { PlansOverview } from "@/components/billing/plans-overview";
import { SubscriptionSettingsTab } from "@/components/billing/subscription-settings-tab";
import { OrganizationChangeNameCard } from "@/components/organization/organization-change-name-card";
import { OrganizationLogoCard } from "@/components/organization/organization-logo-card";
import {
	UnderlinedTabs,
	UnderlinedTabsContent,
	UnderlinedTabsList,
	UnderlinedTabsTrigger,
} from "@/components/ui/custom/underlined-tabs";
import { billingConfig } from "@/config/billing.config";

const tabValues = ["general", "plan"] as const;
type TabValue = (typeof tabValues)[number];

type OrganizationSettingsTabsProps = {
	isAdmin: boolean;
};

export function OrganizationSettingsTabs({
	isAdmin,
}: OrganizationSettingsTabsProps): React.JSX.Element {
	const [tab, setTab] = useQueryState(
		"tab",
		parseAsStringLiteral(tabValues).withDefault("general"),
	);

	return (
		<UnderlinedTabs
			className="w-full"
			value={tab}
			onValueChange={(value) => setTab(value as TabValue)}
		>
			<UnderlinedTabsList className="mb-6 sm:-ml-4">
				<UnderlinedTabsTrigger value="general">General</UnderlinedTabsTrigger>
				<UnderlinedTabsTrigger value="plan">Plan</UnderlinedTabsTrigger>
				{billingConfig.enabled && (
					<UnderlinedTabsTrigger value="subscription">
						Subscription
					</UnderlinedTabsTrigger>
				)}
				{billingConfig.enabled && (
					<UnderlinedTabsTrigger value="credits">Credits</UnderlinedTabsTrigger>
				)}
			</UnderlinedTabsList>
			<UnderlinedTabsContent value="general">
				<div className="space-y-4">
					<OrganizationLogoCard />
					<OrganizationChangeNameCard />
				</div>
			</UnderlinedTabsContent>
			<UnderlinedTabsContent value="plan">
				<PlansOverview />
			</UnderlinedTabsContent>
			{billingConfig.enabled && (
				<UnderlinedTabsContent value="subscription">
					<SubscriptionSettingsTab isAdmin={isAdmin} />
				</UnderlinedTabsContent>
			)}
			{billingConfig.enabled && (
				<UnderlinedTabsContent value="credits">
					<CreditsSettingsTab isAdmin={isAdmin} />
				</UnderlinedTabsContent>
			)}
		</UnderlinedTabs>
	);
}
