import { lazy } from "@trpc/server";
import type { inferRouterOutputs } from "@trpc/server";
import { createTRPCRouter } from "@/trpc/init";

export const appRouter = createTRPCRouter({
	admin: lazy(() => import("./admin")),
	contact: lazy(() => import("./contact")),
	organization: lazy(() => import("./organization")),
	storage: lazy(() => import("./storage")),
	user: lazy(() => import("./user")),
});

// export type definition of API
export type AppRouter = typeof appRouter;

/** Inferred return types of every procedure, for typing component props. */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
