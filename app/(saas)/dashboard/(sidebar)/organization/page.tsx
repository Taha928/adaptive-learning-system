import { redirect } from "next/navigation";

/**
 * The organization landing route. For the Learning Tutor we skip the generic
 * SaaS dashboard and send users straight to their Courses.
 */
export default function OrganizationIndexPage(): never {
	redirect("/dashboard/organization/courses");
}
