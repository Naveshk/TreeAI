import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { userMessage } from "../api/client";
import type { DatasetDetail } from "../api/types";
import { uploadDataset } from "../api/upload";
import { keys } from "./queries";

export type UploadState =
  | { phase: "idle" }
  | { phase: "uploading"; percent: number }
  | { phase: "processing" }
  | { phase: "success"; dataset: DatasetDetail }
  | { phase: "error"; message: string };

export function useUploadDataset() {
  const client = useQueryClient();
  const [state, setState] = useState<UploadState>({ phase: "idle" });

  const upload = useCallback(
    async (file: File): Promise<DatasetDetail | null> => {
      setState({ phase: "uploading", percent: 0 });
      try {
        const dataset = await uploadDataset(file, {
          onProgress: (percent) => setState({ phase: "uploading", percent }),
          onUploaded: () => setState({ phase: "processing" }),
        });
        setState({ phase: "success", dataset });
        void client.invalidateQueries({ queryKey: keys.datasets });
        return dataset;
      } catch (error) {
        setState({ phase: "error", message: userMessage(error) });
        return null;
      }
    },
    [client],
  );

  const reset = useCallback(() => setState({ phase: "idle" }), []);
  return { state, upload, reset };
}
