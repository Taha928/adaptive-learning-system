"use client";

import { CheckIcon } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { appConfig } from "@/config/app.config";
import { studyNexPlans } from "@/lib/billing/studynex-plans";
import { formatCurrency } from "@/lib/billing/utils";
import { cn } from "@/lib/utils";

/**
 * Read-only plans panel shown in settings (item 6). Billing is not wired up, so
 * this simply shows the StudyNex plans: Free (current), Pro (coming soon) and
 * Institution (contact us). No credits, no checkout.
 */
export function PlansOverview(): React.JSX.Element {
	return (
		<div className="grid gap-4 md:grid-cols-3">
			{studyNexPlans.map((plan) => {
				const isCurrent = plan.isFree;
				const price = plan.prices[0];

				return (
					<Card
						key={plan.id}
						className={cn(
							"flex flex-col",
							plan.recommended && "border-primary",
						)}
					>
						<CardHeader>
							<div className="flex items-center justify-between gap-2">
								<CardTitle>{plan.name}</CardTitle>
								{isCurrent && <Badge>Current</Badge>}
								{plan.comingSoon && (
									<Badge variant="secondary">Coming soon</Badge>
								)}
							</div>
							<CardDescription>{plan.description}</CardDescription>
							<p className="pt-2 font-semibold text-2xl">
								{plan.isFree
									? formatCurrency(0, "usd")
									: plan.isEnterprise
										? "Contact us"
										: price
											? `${formatCurrency(price.amount, price.currency)}`
											: ""}
								{price && !plan.isEnterprise && (
									<span className="font-normal text-muted-foreground text-sm">
										/month
									</span>
								)}
							</p>
						</CardHeader>
						<CardContent className="flex flex-1 flex-col justify-between gap-6">
							<ul className="space-y-2 text-muted-foreground text-sm">
								{plan.features.map((feature) => (
									<li key={feature} className="flex gap-2">
										<CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
										<span>{feature}</span>
									</li>
								))}
							</ul>
							{plan.isEnterprise ? (
								<Button asChild variant="outline" className="w-full">
									<Link href={`mailto:${appConfig.contact.email}`}>
										Contact us
									</Link>
								</Button>
							) : (
								<Button
									disabled
									variant={isCurrent ? "outline" : "default"}
									className="w-full"
								>
									{isCurrent ? "Current plan" : "Coming soon"}
								</Button>
							)}
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
}
