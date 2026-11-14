import { describe, expect, it } from "vitest";

import { ApiError, GENERIC_ERROR_MESSAGE, NETWORK_ERROR_MESSAGE, requestJson, userMessage } from "../api/client";
import { uploadDataset } from "../api/upload";
import { MAX_UPLOAD_BYTES } from "../config/limits";
import { dataset, tree0 } from "../test/fixtures";
import { FakeXhr, installFakeXhr } from "../test/fakeXhr";
import { envelope, mockApi } from "../test/mockApi";
import { formatBytes, formatNumber, formatPercent } from "./format";
import { initials, validateCsvFile } from "./misc";
import { defaultExpanded, layoutTree, visibleCount } from "./treeLayout";

describe("api client", () => {
  it("returns parsed JSON on success and undefined for 204", async () => {
    mockApi({ "GET /api/x": { body: { a: 1 } }, "DELETE /api/x": { status: 204 } });
    await expect(requestJson("/x")).resolves.toEqual({ a: 1 });
    await expect(requestJson("/x", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("turns the error envelope into an ApiError", async () => {
    mockApi({ "GET /api/x": { status: 422, body: envelope("UNKNOWN_CATEGORY", "Bad value.", { feature: "f" }) } });
    const error = await requestJson("/x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, code: "UNKNOWN_CATEGORY", message: "Bad value.", details: { feature: "f" } });
  });

  it("handles non-envelope and network failures", async () => {
    mockApi({ "GET /api/a": { status: 500, body: "oops" }, "GET /api/b": { status: 502 } });
    await expect(requestJson("/a")).rejects.toMatchObject({ code: "UNEXPECTED_RESPONSE" });
    await expect(requestJson("/b")).rejects.toMatchObject({ code: "NETWORK_ERROR", message: NETWORK_ERROR_MESSAGE });

    globalThis.fetch = (() => Promise.reject(new TypeError("down"))) as typeof fetch;
    await expect(requestJson("/c")).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });

  it("never shows internal error details", () => {
    expect(userMessage(new ApiError(500, "INTERNAL_ERROR", "Traceback…"))).toBe(GENERIC_ERROR_MESSAGE);
    expect(userMessage(new ApiError(400, "PARSE_ERROR", "Bad CSV."))).toBe("Bad CSV.");
    expect(userMessage(new Error("x"))).toBe(GENERIC_ERROR_MESSAGE);
  });
});

describe("uploadDataset (XHR)", () => {
  it("reports transfer progress, then processing, then resolves", async () => {
    installFakeXhr();
    const progress: number[] = [];
    let uploaded = false;
    const promise = uploadDataset(new File(["a,b\n1,2\n"], "d.csv"), {
      onProgress: (p) => progress.push(p),
      onUploaded: () => (uploaded = true),
    });
    const xhr = FakeXhr.last!;
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe("/api/datasets");
    expect((xhr.sentBody!.get("file") as File).name).toBe("d.csv");
    xhr.progress(5, 10);
    xhr.progress(10, 10);
    xhr.finishUpload();
    expect(progress).toEqual([50, 100]);
    expect(uploaded).toBe(true);
    xhr.respond(201, dataset);
    await expect(promise).resolves.toEqual(dataset);
  });

  it("rejects with the backend error or a network error", async () => {
    installFakeXhr();
    const failing = uploadDataset(new File(["x"], "d.csv"));
    FakeXhr.last!.respond(400, envelope("DUPLICATE_COLUMNS", "Column names must be unique."));
    await expect(failing).rejects.toMatchObject({ code: "DUPLICATE_COLUMNS", status: 400 });

    const offline = uploadDataset(new File(["x"], "d.csv"));
    FakeXhr.last!.fail();
    await expect(offline).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });
});

describe("helpers", () => {
  it("formats values", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(50 * 1024 * 1024)).toBe("50.0 MB");
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(2.4500000476)).toBe("2.45");
    expect(formatPercent(0.8333)).toBe("83.3%");
  });

  it("generates initials", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("Team Member 1")).toBe("TM");
    expect(initials("")).toBe("?");
  });

  it("pre-checks CSV files on the client", () => {
    expect(validateCsvFile(new File(["a,b"], "data.txt"))).toMatch(/Only \.csv/);
    expect(validateCsvFile(new File([], "data.csv"))).toMatch(/empty/);
    const big = new File(["x"], "big.csv");
    Object.defineProperty(big, "size", { value: MAX_UPLOAD_BYTES + 1 });
    expect(validateCsvFile(big)).toMatch(/upload limit is 50.0 MB/);
    expect(validateCsvFile(new File(["a,b\n1,2"], "ok.CSV"))).toBeNull();
  });
});

describe("tree layout", () => {
  it("expands shallow nodes plus the whole highlighted path", () => {
    expect([...defaultExpanded(tree0.nodes, 1, null)]).toEqual([0]);
    expect([...defaultExpanded(tree0.nodes, 1, [0, 2, 4])].sort()).toEqual([0, 2]);
  });

  it("lays out only visible nodes with correct branch sides", () => {
    const collapsed = layoutTree(tree0.nodes, new Set([0]));
    expect(collapsed.nodes.map((n) => n.id).sort()).toEqual([0, 1, 2]);
    expect(collapsed.nodes.find((n) => n.id === 2)!.hasHiddenChildren).toBe(true);
    expect(visibleCount(tree0.nodes, new Set([0]))).toBe(3);

    const full = layoutTree(tree0.nodes, new Set([0, 2]));
    expect(full.nodes).toHaveLength(5);
    const sides = Object.fromEntries(full.links.map((l) => [l.target.id, l.side]));
    expect(sides).toEqual({ 1: "left", 2: "right", 3: "left", 4: "right" });
    const left = full.nodes.find((n) => n.id === 1)!;
    const right = full.nodes.find((n) => n.id === 2)!;
    expect(left.x).toBeLessThan(right.x);
    expect(right.y).toBeGreaterThan(full.nodes.find((n) => n.id === 0)!.y);
  });
});
