import { createTRPCRouter } from "@/trpc/init";
import { adminAnalyticsRouter } from "@/trpc/routers/admin/admin-analytics-router";
import { adminOrganizationRouter } from "@/trpc/routers/admin/admin-organization-router";
import { adminUserRouter } from "@/trpc/routers/admin/admin-user-router";

export const adminRouter = createTRPCRouter({
	analytics: adminAnalyticsRouter,
	organization: adminOrganizationRouter,
	user: adminUserRouter,
});
