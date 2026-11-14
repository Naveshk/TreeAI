import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MAX_UPLOAD_BYTES } from "../config/limits";
import { dataset, profile, samples } from "../test/fixtures";
import { FakeXhr, installFakeXhr } from "../test/fakeXhr";
import { envelope, mockApi } from "../test/mockApi";
import { renderRoute } from "../test/renderApp";

const explorerMocks = {
  "GET /api/samples": { body: samples },
  [`GET /api/datasets/${dataset.id}`]: { body: dataset },
  [`GET /api/datasets/${dataset.id}/profile`]: { body: profile },
  "GET /api/datasets": { body: [dataset] },
  "GET /api/models": { body: [] },
  [`GET /api/models?dataset_id=${dataset.id}`]: { body: [] },
};

function selectFile(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [file] } });
}

describe("Upload page", () => {
  it("rejects non-CSV and oversized files on the client without uploading", async () => {
    installFakeXhr();
    mockApi(explorerMocks);
    renderRoute("/upload");

    selectFile(new File(["x"], "notes.txt"));
    expect(screen.getByText("Only .csv files can be uploaded.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();

    const big = new File(["x"], "big.csv");
    Object.defineProperty(big, "size", { value: MAX_UPLOAD_BYTES + 1 });
    selectFile(big);
    expect(screen.getByText(/upload limit is 50.0 MB/)).toBeInTheDocument();
    expect(FakeXhr.last).toBeNull();
  });

  it("uploads with distinct uploading/processing states and opens the returned dataset", async () => {
    installFakeXhr();
    mockApi(explorerMocks);
    const { router } = renderRoute("/upload");

    selectFile(new File(["a;b\n1;2\n"], "flowers.csv"));
    expect(screen.getByTestId("selected-file")).toHaveTextContent("flowers.csv");
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    const xhr = FakeXhr.last!;
    act(() => xhr.progress(3, 4));
    expect(screen.getByText("Uploading file…")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    act(() => xhr.finishUpload());
    expect(screen.getByText(/Processing on server/)).toBeInTheDocument();
    expect(screen.queryByText("75%")).not.toBeInTheDocument();

    await act(async () => xhr.respond(201, dataset));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/datasets/${dataset.id}`));
    expect(await screen.findByRole("heading", { level: 1, name: "flowers" })).toBeInTheDocument();
  });

  it("shows the backend validation message and allows retry", async () => {
    installFakeXhr();
    mockApi(explorerMocks);
    renderRoute("/upload");

    selectFile(new File(["a,a\n1,2\n"], "dup.csv"));
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await act(async () =>
      FakeXhr.last!.respond(400, envelope("DUPLICATE_COLUMNS", "Column names must be unique. Duplicated: a.")),
    );

    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Upload failed")).toBeInTheDocument();
    expect(within(alert).getByText("Column names must be unique. Duplicated: a.")).toBeInTheDocument();
    const first = FakeXhr.last;
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(FakeXhr.last).not.toBe(first);
  });

  it("lists the sample datasets from the API and loads one", async () => {
    const api = mockApi({ ...explorerMocks, "POST /api/samples/wine/load": { status: 201, body: dataset } });
    const { router } = renderRoute("/upload");

    expect(await screen.findByRole("heading", { name: "Iris" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Wine" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Diabetes" })).toBeInTheDocument();
    expect(screen.getAllByText("Classification")).toHaveLength(2);
    expect(screen.getByText("Regression")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load Wine" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/datasets/${dataset.id}`));
    expect(api.calls.some((c) => c.method === "POST" && c.path === "/api/samples/wine/load")).toBe(true);
  });

  it("shows an error when samples cannot be loaded", async () => {
    mockApi({ "GET /api/samples": { status: 502 } });
    renderRoute("/upload");
    expect(await screen.findByText(/Cannot reach the TreeMind AI server/)).toBeInTheDocument();
  });
});
