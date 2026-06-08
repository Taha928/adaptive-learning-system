import type { ReactNode } from "react";
import { CookieBanner } from "@/components/marketing/navigation/cookie-banner";
import { Footer } from "@/components/marketing/navigation/footer";
import { Header } from "@/components/marketing/navigation/header";
import { NexAssistant } from "@/components/marketing/nex-assistant";
import { ThemeToggle } from "@/components/ui/custom/theme-toggle";
import { MarketingProviders } from "./providers";

/**
 * Marketing Layout
 * Wraps all public/marketing pages with marketing-specific providers.
 * Lighter weight than SaaS - no auth/organization context.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
	return (
		<MarketingProviders>
			<div className="marketing-root bg-marketing-bg text-marketing-fg font-display-headings antialiased selection:bg-marketing-accent/20 selection:text-marketing-fg">
				<Header />
				<main className="min-h-screen">{children}</main>
				<Footer />
			</div>
			{/* Theme toggle sits to the left of the Nex assistant launcher. */}
			<ThemeToggle className="fixed bottom-6 left-4 z-50 rounded-full" />
			<NexAssistant />
			<CookieBanner />
		</MarketingProviders>
	);
}
