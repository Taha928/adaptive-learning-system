import { CtaSection } from "@/components/marketing/sections/cta-section";
import { DemoVideoSection } from "@/components/marketing/sections/demo-video-section";
import { FaqSection } from "@/components/marketing/sections/faq-section";
import { FeaturesSection } from "@/components/marketing/sections/features-section";
import { HeroSection } from "@/components/marketing/sections/hero-section";
import { HowItWorksSection } from "@/components/marketing/sections/how-it-works-section";
import { LogoCloudSection } from "@/components/marketing/sections/logo-cloud-section";
import { PricingSection } from "@/components/marketing/sections/pricing-section";
import { appConfig } from "@/config/app.config";
import { studyNexPlans } from "@/lib/billing/studynex-plans";

function OrganizationJsonLd() {
	const jsonLd = {
		"@context": "https://schema.org",
		"@type": "Organization",
		name: appConfig.appName,
		description: appConfig.description,
		url: appConfig.baseUrl,
		logo: `${appConfig.baseUrl}/favicon.svg`,
		contactPoint: {
			"@type": "ContactPoint",
			email: appConfig.contact.email,
			telephone: appConfig.contact.phone,
			contactType: "customer service",
		},
		address: {
			"@type": "PostalAddress",
			streetAddress: appConfig.contact.address,
		},
	};

	return (
		<script
			type="application/ld+json"
			dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
		/>
	);
}

function WebSiteJsonLd() {
	const jsonLd = {
		"@context": "https://schema.org",
		"@type": "WebSite",
		name: appConfig.appName,
		description: appConfig.description,
		url: appConfig.baseUrl,
	};

	return (
		<script
			type="application/ld+json"
			dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
		/>
	);
}

export default function HomePage() {
	const faqContent = {
		headline: "Questions, answered",
		items: [
			{
				question: "What can I upload?",
				answer:
					"PDFs, Word docs, plain text notes and web links. StudyNex extracts the text, structures it into topics, and uses it as the source of truth for lessons, quizzes and the tutor's answers.",
			},
			{
				question: "Where do the quizzes and answers come from?",
				answer:
					"From your own material. StudyNex uses Google's Gemini models to generate questions and tutor replies grounded in what you uploaded, and points back to the exact slide or page so you can verify it.",
			},
			{
				question: "Do I need a credit card to start?",
				answer:
					"No. The free plan lets you create a course, run quizzes and chat with the tutor right away. Upgrade only when you want more courses and unlimited tutor messages.",
			},
			{
				question: "How is StudyNex different from ChatGPT or Gemini?",
				answer:
					"StudyNex is built specifically for education and personalized learning. Unlike general-purpose AI tools, it lets you upload your own study materials (PDFs, notes, PPTs) and turns them into a structured learning experience — generating quizzes, tracking progress, and adapting to your content and performance, rather than acting as a general chatbot.",
			},
			{
				question: "Is my coursework private?",
				answer:
					"Your uploads stay scoped to your workspace and are never used to train models. We use industry-standard encryption in transit and at rest.",
			},
		],
	};

	const ctaContent = {
		headline: "Start the night-before-the-exam differently.",
		description:
			"Upload your first set of notes and watch them turn into a tutor, a quiz set and a plan in minutes. Free to start, no card required.",
		primaryCta: {
			text: "Start learning free",
			href: "/auth/sign-up",
		},
		secondaryCta: {
			text: "See how it works",
			href: "/#how-it-works",
		},
	};

	return (
		<>
			<OrganizationJsonLd />
			<WebSiteJsonLd />
			<HeroSection />
			<LogoCloudSection />
			<FeaturesSection />
			<HowItWorksSection />
			<PricingSection
				headline="Pricing that fits a student budget."
				plans={studyNexPlans}
				showEnterprisePlans={true}
			/>
			<FaqSection content={faqContent} />
			<DemoVideoSection />
			<CtaSection content={ctaContent} />
		</>
	);
}
