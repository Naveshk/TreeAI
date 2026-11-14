import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "./App";

describe("App", () => {
  it("renders the TreeAI heading and tagline", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "TreeAI" })).toBeInTheDocument();
    expect(
      screen.getByText("Upload Your Data. Train Your Model. Understand Your Predictions."),
    ).toBeInTheDocument();
  });
});
