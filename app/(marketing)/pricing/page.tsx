import type { Metadata } from "next";
import { CtaSection } from "@/components/marketing/sections/cta-section";
import { FaqSection } from "@/components/marketing/sections/faq-section";
import { PricingSection } from "@/components/marketing/sections/pricing-section";
import { appConfig } from "@/config/app.config";
import { studyNexPlans } from "@/lib/billing/studynex-plans";
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
				"No. The Free plan lets you build a course, run quizzes and chat with the AI tutor right away, no card required.",
		},
		{
			question: "When is the Pro plan available?",
			answer:
				"Pro is coming soon. It will unlock unlimited AI tutoring, advanced analytics, priority responses and full progress tracking for $9.99/month.",
		},
		{
			question: "What is the Institution plan?",
			answer:
				"Institution is for schools and teams: classroom management, student analytics, multiple users and a teacher dashboard. Contact us and we'll tailor it to your group.",
		},
		{
			question: "How is StudyNex different from ChatGPT or other chatbots?",
			answer:
				"StudyNex is built specifically for education. You upload your own study materials (PDFs, notes, PPTs) and it turns them into a structured learning experience — generating quizzes, tracking progress and adapting to your content and performance, rather than acting as a general chatbot.",
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
				plans={studyNexPlans}
				showFreePlans={true}
				showEnterprisePlans={true}
				defaultInterval="month"
			/>

			{/* FAQ */}
			<FaqSection content={pricingFaq} />

			{/* CTA */}
			<CtaSection content={ctaContent} centered />
		</main>
	);
}
