import type { PlanDisplay } from "@/lib/billing/types";

/**
 * StudyNex display-only pricing plans.
 *
 * Billing is intentionally not wired up for the FYP (see billingConfig.enabled).
 * These plans exist purely for the marketing site and the read-only "Plan" panel
 * in settings:
 *   • Free        — fully usable today
 *   • Pro         — $9.99/month, marked "coming soon" (no checkout)
 *   • Institution — contact us
 */
export const studyNexPlans: PlanDisplay[] = [
	{
		id: "free",
		name: "Free",
		description: "Everything you need to start learning with AI.",
		isFree: true,
		features: [
			"AI Tutor access",
			"Personalized learning",
			"Quiz generation",
			"Limited daily questions",
		],
		prices: [],
	},
	{
		id: "pro",
		name: "Pro",
		description: "For students with a real exam to pass.",
		recommended: true,
		comingSoon: true,
		features: [
			"Unlimited AI tutoring",
			"Advanced analytics",
			"Priority responses",
			"Study plans",
			"Progress tracking",
		],
		prices: [
			{
				id: "pro_monthly",
				stripePriceId: "",
				type: "recurring",
				interval: "month",
				amount: 999, // $9.99
				currency: "usd",
			},
		],
	},
	{
		id: "institution",
		name: "Institution",
		description: "For schools and teams that learn together.",
		isEnterprise: true,
		features: [
			"Classroom management",
			"Student analytics",
			"Multiple users",
			"Teacher dashboard",
		],
		prices: [],
	},
];
