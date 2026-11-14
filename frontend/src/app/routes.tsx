import type { RouteObject } from "react-router";

import { PublicLayout } from "../components/layout/PublicLayout";
import { WorkspaceLayout } from "../components/layout/WorkspaceLayout";
import HomePage from "../pages/HomePage";
import NotFoundPage from "../pages/NotFoundPage";
import UploadPage from "../pages/UploadPage";

/** Workspace pages are code-split: they load on first visit (keeps the landing page light). */
const page = (load: () => Promise<{ default: () => React.JSX.Element }>) => async () => ({
  Component: (await load()).default,
});

export const routes: RouteObject[] = [
  {
    element: <PublicLayout />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/upload", element: <UploadPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
  {
    element: <WorkspaceLayout />,
    children: [
      { path: "/workspace", lazy: page(() => import("../pages/WorkspacePage")) },
      { path: "/datasets/:datasetId", lazy: page(() => import("../pages/DatasetExplorerPage")) },
      { path: "/datasets/:datasetId/train", lazy: page(() => import("../pages/ModelConfigPage")) },
      { path: "/models/:modelId", lazy: page(() => import("../pages/EvaluationPage")) },
      { path: "/models/:modelId/predict", lazy: page(() => import("../pages/PredictionStudioPage")) },
      { path: "/models/:modelId/forest", lazy: page(() => import("../pages/ForestExplorerPage")) },
    ],
  },
];
