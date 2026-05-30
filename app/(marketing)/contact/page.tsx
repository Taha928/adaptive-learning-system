import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ContactSection } from "@/components/marketing/sections/contact-section";
import { FaqSection } from "@/components/marketing/sections/faq-section";
import { appConfig } from "@/config/app.config";

export const metadata: Metadata = {
	title: "Contact",
	description: "Get in touch with us. We'd love to hear from you.",
};

const contactFaq = {
	headline: "Questions & Answers",
	items: [
		{
			question: "How quickly will I get a response?",
			answer:
				"We typically respond within 24 hours on weekdays. If you're stuck the night before an exam, mention it — we'll prioritize.",
		},
		{
			question: "Do you work with schools and bootcamps?",
			answer:
				"Yes. We partner with departments, clubs and bootcamps on shared workspaces and bulk seats. Tell us about your program and we'll find a fit.",
		},
		{
			question: "I'm a student and can't afford it — can you help?",
			answer:
				"Reach out with your student ID. We keep a pool of free and discounted seats for learners who need them.",
		},
		{
			question: "I found a bug or have a feature idea.",
			answer:
				"Please send it our way. A lot of Lumen exists because a learner emailed us at midnight with a better idea.",
		},
	],
};

export default function ContactPage() {
	// Redirect to home if contact page is disabled
	if (!appConfig.contact.enabled) {
		redirect("/");
	}

	return (
		<>
			<ContactSection />
			<FaqSection content={contactFaq} />
		</>
	);
}
