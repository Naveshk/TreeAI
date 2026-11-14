import { API_PREFIX, ApiError, NETWORK_ERROR_MESSAGE, errorFromBody, parseJson } from "./client";
import type { DatasetDetail } from "./types";

export interface UploadCallbacks {
  /** Transfer progress of the file to the server, 0–100. */
  onProgress?: (percent: number) => void;
  /** The file has been fully sent; the server is now validating and profiling it. */
  onUploaded?: () => void;
}

/**
 * Upload a CSV with XMLHttpRequest (fetch cannot report upload progress).
 * The percentage only covers the network transfer, never server-side processing.
 */
export function uploadDataset(file: File, callbacks: UploadCallbacks = {}): Promise<DatasetDetail> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_PREFIX}/datasets`);
    xhr.setRequestHeader("Accept", "application/json");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        callbacks.onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.upload.onload = () => callbacks.onUploaded?.();
    xhr.onerror = () => reject(new ApiError(0, "NETWORK_ERROR", NETWORK_ERROR_MESSAGE));
    xhr.onload = () => {
      const body = parseJson(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as DatasetDetail);
      } else {
        reject(errorFromBody(xhr.status, body));
      }
    };

    const form = new FormData();
    form.append("file", file, file.name);
    xhr.send(form);
  });
}
