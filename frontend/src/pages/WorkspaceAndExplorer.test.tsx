import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { dataset, DS_ID, modelSummary, preview, profile } from "../test/fixtures";
import { envelope, mockApi, type RecordedCall } from "../test/mockApi";
import { renderRoute } from "../test/renderApp";

function mocks(extra: Record<string, unknown> = {}, models: unknown[] = []) {
  return {
    "GET /api/datasets": { body: [dataset] },
    [`GET /api/datasets/${DS_ID}`]: { body: dataset },
    [`GET /api/datasets/${DS_ID}/profile`]: { body: profile },
    [`GET /api/datasets/${DS_ID}/preview`]: (call: RecordedCall) => {
      const q = new URLSearchParams(call.search);
      return { body: preview(Number(q.get("offset")), Number(q.get("limit"))) };
    },
    "GET /api/models": { body: models },
    [`GET /api/models?dataset_id=${DS_ID}`]: { body: models },
    ...extra,
  } as Parameters<typeof mockApi>[0];
}

describe("Workspace", () => {
  it("lists datasets as cards", async () => {
    mockApi(mocks({}, [modelSummary]));
    renderRoute("/workspace");
    const card = (await screen.findByRole("link", { name: "flowers" })).closest("li")!;
    expect(within(card).getByText("flowers.csv")).toBeInTheDocument();
    expect(within(card).getByText("60")).toBeInTheDocument();
    expect(within(card).getByText("Uploaded")).toBeInTheDocument();
    expect(within(card).getByText("Trained models").nextSibling).toHaveTextContent("1");
  });

  it("shows an empty state", async () => {
    mockApi({ "GET /api/datasets": { body: [] }, "GET /api/models": { body: [] } });
    renderRoute("/workspace");
    expect(await screen.findByText("No datasets yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add a dataset" })).toHaveAttribute("href", "/upload");
  });

  it("disables model pages until a model exists, without fake links", async () => {
    mockApi(mocks());
    renderRoute(`/datasets/${DS_ID}`);
    await screen.findByRole("heading", { level: 1, name: "flowers" });
    const nav = screen.getByRole("navigation", { name: "Workspace" });
    expect(within(nav).getByRole("link", { name: /Dataset Explorer/ })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: /Model Configuration/ })).toHaveAttribute("href", `/datasets/${DS_ID}/train`);
    await waitFor(() => expect(within(nav).getAllByText("Train a model first")).toHaveLength(3));
    for (const label of ["Training & Evaluation", "Prediction Studio", "Forest Explorer"]) {
      expect(within(nav).queryByRole("link", { name: new RegExp(label) })).toBeNull();
      expect(within(nav).getByText(label).closest("[aria-disabled]")).toHaveAttribute("aria-disabled", "true");
    }
  });

  it("links model pages once a ready model exists", async () => {
    mockApi(mocks({}, [modelSummary]));
    renderRoute(`/datasets/${DS_ID}`);
    const nav = await screen.findByRole("navigation", { name: "Workspace" });
    expect(await within(nav).findByRole("link", { name: /Forest Explorer/ })).toHaveAttribute(
      "href",
      `/models/${modelSummary.id}/forest`,
    );
  });
});

describe("Dataset Explorer", () => {
  it("shows backend metadata in the overview", async () => {
    mockApi(mocks());
    renderRoute(`/datasets/${DS_ID}`);
    await screen.findByRole("heading", { level: 1, name: "flowers" });
    expect(screen.getByText("Rows").nextSibling).toHaveTextContent("60");
    expect(screen.getByText("Duplicate rows").nextSibling).toHaveTextContent("2");
    expect(screen.getByText("semicolon")).toBeInTheDocument();
    expect(screen.getByText("utf-8-sig")).toBeInTheDocument();
  });

  it("switches between the five sections via the URL", async () => {
    mockApi(mocks());
    const { router } = renderRoute(`/datasets/${DS_ID}`);
    await screen.findByRole("heading", { level: 1, name: "flowers" });
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Overview", "Columns", "Preview", "Data Quality", "ML Suitability"]);

    fireEvent.click(screen.getByRole("tab", { name: "Columns" }));
    expect(router.state.location.search).toContain("tab=columns");
    fireEvent.click(screen.getByRole("button", { name: "petal_length" }));
    expect(screen.getByText("Median").nextSibling).toHaveTextContent("4.35");
  });

  it("paginates the preview with the backend offset/limit contract", async () => {
    const api = mockApi(mocks());
    const { router } = renderRoute(`/datasets/${DS_ID}?tab=preview`);
    expect(await screen.findByText("row-0")).toBeInTheDocument();
    expect(screen.getAllByText("missing").length).toBeGreaterThan(0); // null cell from the API
    expect(screen.getByText("Rows 1–25 of 60")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("row-25")).toBeInTheDocument();
    expect(router.state.location.search).toContain("offset=25");
    const previews = api.calls.filter((c) => c.path.endsWith("/preview")).map((c) => c.search);
    expect(previews).toEqual(["?offset=0&limit=25", "?offset=25&limit=25"]);

    fireEvent.change(screen.getByLabelText("Rows per page"), { target: { value: "50" } });
    expect(await screen.findByText("Rows 1–50 of 60")).toBeInTheDocument();
  });

  it("shows data-quality information and warnings", async () => {
    mockApi(mocks());
    renderRoute(`/datasets/${DS_ID}?tab=quality`);
    expect(await screen.findByText("The dataset contains 2 duplicate row(s).")).toBeInTheDocument();
    expect(screen.getByText("5 · 8.3%")).toBeInTheDocument();
    expect(screen.getByText("Columns with missing values").nextSibling).toHaveTextContent("1 / 3");
  });

  it("presents ML suitability as a recommendation", async () => {
    mockApi(mocks());
    renderRoute(`/datasets/${DS_ID}?tab=suitability`);
    expect(await screen.findByText("These are recommendations, not a model configuration")).toBeInTheDocument();
    const row = screen.getByRole("cell", { name: "petal_length" }).closest("tr")!;
    expect(within(row).getByText("regression")).toBeInTheDocument();
  });

  it("shows a not-found state", async () => {
    mockApi({
      ...mocks(),
      [`GET /api/datasets/${DS_ID}`]: { status: 404, body: envelope("DATASET_NOT_FOUND", "Dataset not found.") },
    });
    renderRoute(`/datasets/${DS_ID}`);
    expect(await screen.findByText("Dataset not found", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to workspace" })).toBeInTheDocument();
  });

  it("deletes only after confirmation and returns to the workspace with a notice", async () => {
    const api = mockApi(mocks({ [`DELETE /api/datasets/${DS_ID}`]: { status: 204 } }));
    const { router } = renderRoute(`/datasets/${DS_ID}`);
    await screen.findByRole("heading", { level: 1, name: "flowers" });

    fireEvent.click(screen.getByRole("button", { name: "Delete flowers" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.calls.some((c) => c.method === "DELETE")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Delete flowers" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Delete flowers" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/workspace"));
    expect(await screen.findByText("Dataset “flowers” was deleted.")).toBeInTheDocument();
    expect(api.calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
  });

  it("keeps the dialog open with the error when deletion fails", async () => {
    mockApi(mocks({ [`DELETE /api/datasets/${DS_ID}`]: { status: 500, body: envelope("INTERNAL_ERROR", "secret") } }));
    renderRoute(`/datasets/${DS_ID}`);
    await screen.findByRole("heading", { level: 1, name: "flowers" });
    fireEvent.click(screen.getByRole("button", { name: "Delete flowers" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete permanently" }));
    expect(await within(screen.getByRole("dialog")).findByText(/Something went wrong/)).toBeInTheDocument();
    expect(screen.queryByText("secret")).toBeNull();
  });
});
