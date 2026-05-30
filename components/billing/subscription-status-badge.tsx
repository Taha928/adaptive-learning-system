"use client";

import { Badge } from "@/components/ui/badge";

type SubscriptionStatus =
	| "active"
	| "trialing"
	| "past_due"
	| "canceled"
	| "incomplete"
	| "incomplete_expired"
	| "unpaid"
	| "paused";

interface SubscriptionStatusBadgeProps {
	status: string;
	className?: string;
}

const statusConfig: Record<
	SubscriptionStatus,
	{
		label: string;
		variant: "default" | "secondary" | "destructive" | "outline";
	}
> = {
	active: { label: "Active", variant: "default" },
	trialing: { label: "Trial", variant: "secondary" },
	past_due: { label: "Past Due", variant: "destructive" },
	canceled: { label: "Canceled", variant: "outline" },
	incomplete: { label: "Incomplete", variant: "outline" },
	incomplete_expired: { label: "Expired", variant: "destructive" },
	unpaid: { label: "Unpaid", variant: "destructive" },
	paused: { label: "Paused", variant: "secondary" },
};

export function SubscriptionStatusBadge({
	status,
	className,
}: SubscriptionStatusBadgeProps) {
	const normalized = (
		status in statusConfig ? status : "active"
	) as SubscriptionStatus;
	const config = statusConfig[normalized];

	return (
		<Badge
			variant={status in statusConfig ? config.variant : "outline"}
			className={className}
		>
			{status in statusConfig ? config.label : status}
		</Badge>
	);
}
