"use client";

import "@/app/globals.css";

import { captureException } from "@sentry/nextjs";
import { GeistSans } from "geist/font/sans";
import { Instrument_Serif } from "next/font/google";
import * as React from "react";
import { ErrorPage } from "@/components/error-page";

const instrumentSerif = Instrument_Serif({
	subsets: ["latin"],
	weight: "400",
	variable: "--font-display",
});

export default function GlobalErrorPage({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}): React.JSX.Element {
	React.useEffect(() => {
		captureException(error);
	}, [error]);

	return (
		<html
			className={`${GeistSans.variable} ${instrumentSerif.variable} size-full min-h-screen`}
			lang="en"
			suppressHydrationWarning
		>
			<body className="size-full min-h-screen bg-background text-foreground antialiased">
				<ErrorPage error={error} reset={reset} />
			</body>
		</html>
	);
}
