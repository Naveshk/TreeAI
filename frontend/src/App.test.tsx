import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "./App";
import { TEAM } from "./config/team";
import { initials } from "./lib/misc";
import { renderRoute } from "./test/renderApp";
import { samples } from "./test/fixtures";
import { mockApi } from "./test/mockApi";

describe("App", () => {
  it("renders the TreeMind AI heading and tagline", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "TreeMind AI" })).toBeInTheDocument();
    // The footer repeats the tagline; the hero inside <main> must show it exactly once.
    expect(
      within(screen.getByRole("main")).getByText(
        "Upload Your Data. Train Your Model. Understand Your Predictions.",
      ),
    ).toBeInTheDocument();
  });
});

describe("Home page", () => {
  it("shows the main sections and the workflow", () => {
    renderRoute("/");
    for (const name of ["Look inside the forest", "How it works", "The people behind the project"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("heading", { name: "Explore individual trees" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(6);
  });

  it("renders team cards from the team configuration file", () => {
    renderRoute("/");
    const team = screen.getByRole("heading", { name: "The people behind the project" }).closest("section")!;
    for (const member of TEAM) {
      expect(within(team).getByText(member.name)).toBeInTheDocument();
      expect(within(team).getByText(member.rollNumber)).toBeInTheDocument();
    }
    // Confirmed photo-to-member mapping, in order.
    const cards = within(team).getAllByRole("listitem");
    const expected = [
      ["Nave", "Roll No. 12345", "/images/team/navesh.jpeg"],
      ["Mohan", "Roll No. 12445", "/images/team/mohan1.jpeg"],
      ["Yash", "Roll No. 5432", "/images/team/mohan.jpeg"],
    ];
    expect(cards).toHaveLength(expected.length);
    expected.forEach(([name, roll, src], i) => {
      const card = cards[i]!;
      expect(within(card).getByRole("heading", { name })).toBeInTheDocument();
      expect(within(card).getByText(roll!)).toBeInTheDocument();
      expect(within(card).getByRole("img", { name: `Photo of ${name}` })).toHaveAttribute("src", src);
    });
    // Cards show only photo/initials, name and roll number: no role or designation text.
    for (const card of within(team).getAllByRole("listitem")) {
      expect(card.querySelectorAll("p")).toHaveLength(1);
    }
    // Initials are generated from each name; members may share initials, so count per value.
    const expectedInitials = new Map<string, number>();
    for (const member of TEAM.filter((m) => !m.photo)) {
      const value = initials(member.name);
      expectedInitials.set(value, (expectedInitials.get(value) ?? 0) + 1);
    }
    for (const [value, count] of expectedInitials) {
      expect(within(team).getAllByText(value, { exact: true })).toHaveLength(count);
    }
  });

  it("Get Started navigates to the upload page", async () => {
    mockApi({ "GET /api/samples": { body: samples } });
    const { router } = renderRoute("/");
    fireEvent.click(screen.getAllByRole("link", { name: "Get Started" })[0]!);
    await waitFor(() => expect(router.state.location.pathname).toBe("/upload"));
    expect(await screen.findByRole("heading", { name: "Add a dataset" })).toBeInTheDocument();
  });

  it("toggles the mobile menu", () => {
    renderRoute("/");
    const toggle = screen.getByRole("button", { name: "Open menu" });
    expect(document.getElementById("mobile-nav")).toHaveClass("hidden");
    fireEvent.click(toggle);
    expect(document.getElementById("mobile-nav")).not.toHaveClass("hidden");
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
  });

  it("shows a 404 page for unknown routes", () => {
    renderRoute("/does-not-exist");
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });
});
