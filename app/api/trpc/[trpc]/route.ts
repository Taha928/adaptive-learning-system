import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createTRPCContext } from "@/trpc/context";
import { appRouter } from "@/trpc/routers/app";

// Some procedures (e.g. quiz submit) make live AI calls to grade
// free-response/image answers, so allow more than the default function timeout.
export const maxDuration = 60;

const handler = (req: Request) =>
	fetchRequestHandler({
		endpoint: "/api/trpc",
		req,
		router: appRouter,
		createContext: createTRPCContext,
	});

export { handler as GET, handler as POST };
