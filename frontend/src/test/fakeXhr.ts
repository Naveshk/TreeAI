import { vi } from "vitest";

/** Minimal XMLHttpRequest fake for upload tests; the test drives progress and completion. */
export class FakeXhr {
  static last: FakeXhr | null = null;
  method = "";
  url = "";
  status = 0;
  responseText = "";
  sentBody: FormData | null = null;
  headers: Record<string, string> = {};
  upload: { onprogress: ((e: ProgressEvent) => void) | null; onload: (() => void) | null } = {
    onprogress: null,
    onload: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: FormData) {
    this.sentBody = body;
  }
  // ---- test helpers ----
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total } as ProgressEvent);
  }
  finishUpload() {
    this.upload.onload?.();
  }
  respond(status: number, body: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.onload?.();
  }
  fail() {
    this.onerror?.();
  }
}

export function installFakeXhr() {
  FakeXhr.last = null;
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
}
