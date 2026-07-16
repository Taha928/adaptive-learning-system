import { describe, expect, it } from "vitest";
import { firstNameFor, initialsFor, workspaceNameFor } from "@/lib/auth/profile";

describe("firstNameFor", () => {
	it("takes the first word of a display name", () => {
		expect(firstNameFor("Muneeb Ahmad Khunzada")).toBe("Muneeb");
		expect(firstNameFor("Taha")).toBe("Taha");
	});

	it("survives the padding a sign-up form lets through", () => {
		expect(firstNameFor("  Taha   Khan  ")).toBe("Taha");
	});

	it("returns null when there is no name", () => {
		expect(firstNameFor("")).toBeNull();
		expect(firstNameFor("   ")).toBeNull();
		expect(firstNameFor(null)).toBeNull();
		expect(firstNameFor(undefined)).toBeNull();
	});
});

describe("workspaceNameFor", () => {
	it("uses the first name only", () => {
		expect(workspaceNameFor("Muneeb Ahmad Khunzada")).toBe("Muneeb's Workspace");
	});

	it("works for a single-word name", () => {
		expect(workspaceNameFor("Taha")).toBe("Taha's Workspace");
	});

	it("falls back when the name is missing, rather than rendering \"'s Workspace\"", () => {
		expect(workspaceNameFor(null)).toBe("My Workspace");
		expect(workspaceNameFor("")).toBe("My Workspace");
		expect(workspaceNameFor("   ")).toBe("My Workspace");
	});
});

describe("initialsFor", () => {
	it("takes first and last initials", () => {
		expect(initialsFor("Muneeb Khunzada")).toBe("MK");
	});

	it("skips the middle name — two letters, not three", () => {
		expect(initialsFor("Muneeb Ahmad Khunzada")).toBe("MK");
	});

	it("uses two letters of a single-word name", () => {
		expect(initialsFor("Taha")).toBe("TA");
	});

	it("handles a one-letter name without crashing", () => {
		expect(initialsFor("T")).toBe("T");
	});

	it("falls back to the email when there is no name", () => {
		expect(initialsFor(null, "muneeb@example.com")).toBe("M");
		expect(initialsFor("", "zed@example.com")).toBe("Z");
	});

	it("never renders an empty avatar", () => {
		expect(initialsFor(null, null)).toBe("?");
		expect(initialsFor("", "")).toBe("?");
	});

	it("uppercases regardless of how it was typed", () => {
		expect(initialsFor("taha khan")).toBe("TK");
		expect(initialsFor(null, "taha@example.com")).toBe("T");
	});

	it("copes with extra whitespace", () => {
		expect(initialsFor("  taha   khan  ")).toBe("TK");
	});
});
