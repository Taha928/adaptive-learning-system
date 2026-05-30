import type { Metadata } from "next";
import { CtaSection } from "@/components/marketing/sections/cta-section";
import { FaqSection } from "@/components/marketing/sections/faq-section";
import { PricingSection } from "@/components/marketing/sections/pricing-section";
import { appConfig } from "@/config/app.config";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
	title: "Pricing",
	description: `Simple, student-friendly pricing for ${appConfig.appName}. Start free and upgrade when exams get real.`,
};

const pricingFaq = {
	headline: "Questions & Answers",
	items: [
		{
			question: "Do I need a credit card to start?",
			answer:
				"No. The Free plan lets you build a course, run quizzes and chat with the tutor right away, no card required. Paid plans include a 14-day free trial.",
		},
		{
			question: "Is there a student discount?",
			answer:
				"Scholar is already priced for students. If it's still a stretch, email us with your student ID and we'll sort you out. We keep a pool of free and discounted seats for learners who need them.",
		},
		{
			question: "Can my whole class share one workspace?",
			answer:
				"Yes. Scholar includes shared class workspaces, so you can invite classmates and let an instructor track the cohort. Seats are billed per member.",
		},
		{
			question: "Can I change or cancel my plan later?",
			answer:
				"Anytime. Upgrade, downgrade or cancel from your settings. Changes take effect immediately and we prorate the difference.",
		},
	],
};

const ctaContent = {
	headline: "Still deciding?",
	description:
		"Start on the free plan and build your first course in minutes. Upgrade only when you've got an exam worth winning.",
	primaryCta: {
		text: "Start free",
		href: "/auth/sign-up",
	},
	secondaryCta: {
		text: "Talk to us",
		href: "/contact",
	},
};

export default function PricingPage() {
	return (
		<main className="isolate overflow-clip">
			{/* Hero Section */}
			<section className="py-16 pt-32 lg:pt-40" id="pricing">
				<div className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-6 text-center md:max-w-3xl lg:max-w-7xl lg:px-10">
					<h1
						className={cn(
							"text-balance font-display text-5xl leading-[1.05] tracking-tight",
							"text-marketing-fg",
							"sm:text-[5rem] sm:leading-[1.02]",
						)}
					>
						Priced for a <span className="marketing-em">student</span> budget.
					</h1>
					<div className="max-w-xl text-lg leading-8 text-marketing-fg-muted">
						<p>
							Start free and learn as much as you like. Upgrade to Scholar when
							you've got a real exam on the calendar.
						</p>
					</div>
				</div>
			</section>

			{/* Pricing Cards */}
			<PricingSection
				headline=""
				showFreePlans={true}
				showEnterprisePlans={false}
				defaultInterval="month"
			/>

			{/* FAQ */}
			<FaqSection content={pricingFaq} />

			{/* CTA */}
			<CtaSection content={ctaContent} centered />
		</main>
	);
}
