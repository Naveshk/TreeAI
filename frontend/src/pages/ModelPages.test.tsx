import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { EvaluationResponse, ExplainResponse, InputSchema, ModelDetail, TreeStructure } from "../api/types";
import {
  dataset,
  DS_ID,
  evaluation,
  explainResult,
  inputSchema,
  MODEL_ID,
  modelDetail,
  modelSummary,
  profile,
  REG_MODEL_ID,
  tree0,
  treeList,
} from "../test/fixtures";
import { envelope, mockApi, type RecordedCall } from "../test/mockApi";
import { renderRoute } from "../test/renderApp";

const base = {
  "GET /api/datasets": { body: [dataset] },
  [`GET /api/datasets/${DS_ID}`]: { body: dataset },
  [`GET /api/datasets/${DS_ID}/profile`]: { body: profile },
  "GET /api/models": { body: [modelSummary] },
  [`GET /api/models?dataset_id=${DS_ID}`]: { body: [modelSummary] },
  [`GET /api/models/${MODEL_ID}`]: { body: modelDetail },
  [`GET /api/models/${MODEL_ID}/evaluation`]: { body: evaluation },
  [`GET /api/models/${MODEL_ID}/input-schema`]: { body: inputSchema },
  [`GET /api/models/${MODEL_ID}/trees`]: { body: treeList },
  [`GET /api/models/${MODEL_ID}/trees/0`]: { body: tree0 },
  [`GET /api/models/${MODEL_ID}/trees/1`]: { body: { ...tree0, tree_index: 1 } },
};

describe("Model Configuration", () => {
  it("starts from the profile: last suitable column as target, others as features", async () => {
    mockApi(base);
    renderRoute(`/datasets/${DS_ID}/train`);
    const target = await screen.findByLabelText("Target column");
    expect(target).toHaveValue("species");
    expect(screen.getByRole("radio", { name: "Classification" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /petal_length/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /color/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /species/ })).toBeDisabled();
  });

  it("never lets the target be a feature and suggests the task", async () => {
    mockApi(base);
    renderRoute(`/datasets/${DS_ID}/train`);
    fireEvent.change(await screen.findByLabelText("Target column"), { target: { value: "petal_length" } });
    expect(screen.getByRole("checkbox", { name: /petal_length/ })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /petal_length/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /species/ })).toBeChecked(); // previous target becomes a feature
    expect(screen.getByRole("radio", { name: "Regression" })).toBeChecked();
    expect(screen.getByText(/5 rows have no value/)).toBeInTheDocument();
  });

  it("validates inputs before sending anything", async () => {
    const api = mockApi(base);
    renderRoute(`/datasets/${DS_ID}/train`);
    const trees = await screen.findByLabelText("Number of trees (n_estimators)");
    fireEvent.change(trees, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Train Random Forest" }));
    expect(screen.getByText("Enter a whole number from 1 to 500.")).toBeInTheDocument();
    expect(api.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("submits the configuration and opens the evaluation", async () => {
    let sent: RecordedCall | null = null;
    mockApi({
      ...base,
      "POST /api/models": (call) => {
        sent = call;
        return { status: 201, body: modelDetail };
      },
    });
    const { router } = renderRoute(`/datasets/${DS_ID}/train`);
    await screen.findByLabelText("Target column");
    fireEvent.change(screen.getByLabelText("Number of trees (n_estimators)"), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "No limit" }));
    fireEvent.click(screen.getByRole("button", { name: "Train Random Forest" }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/models/${MODEL_ID}`));
    expect(sent!.body).toMatchObject({
      dataset_id: DS_ID,
      task_type: "classification",
      target_column: "species",
      feature_columns: ["petal_length", "color"],
      test_size: 0.2,
      stratify: true,
      random_state: 42,
      hyperparameters: { n_estimators: 25, max_depth: null, criterion: "gini", max_features: null, bootstrap: true },
    });
  });

  it("shows backend training errors", async () => {
    mockApi({
      ...base,
      "POST /api/models": { status: 422, body: envelope("CLASS_TOO_SMALL_FOR_STRATIFY", "Stratified splitting needs at least 2 rows per class.") },
    });
    renderRoute(`/datasets/${DS_ID}/train`);
    await screen.findByLabelText("Target column");
    fireEvent.click(screen.getByRole("button", { name: "Train Random Forest" }));
    expect(await screen.findByText("Stratified splitting needs at least 2 rows per class.")).toBeInTheDocument();
  });
});

describe("Training & Evaluation", () => {
  it("renders classification metrics and the confusion matrix from the API", async () => {
    mockApi(base);
    renderRoute(`/models/${MODEL_ID}`);
    expect((await screen.findByText("Accuracy")).nextSibling).toHaveTextContent("83.3%");
    const matrix = screen.getByRole("table", { name: "Confusion matrix" });
    expect(within(matrix).getAllByRole("cell").map((c) => c.textContent)).toEqual(["4", "0", "0", "0", "3", "1", "0", "1", "3"]);
    expect(screen.getByRole("cell", { name: "versicolor" })).toBeInTheDocument();
    expect(screen.getByText("n_estimators=3")).toBeInTheDocument();
  });

  it("renders regression metrics", async () => {
    const reg: ModelDetail = { ...modelDetail, id: REG_MODEL_ID, task_type: "regression", classes: null, target_column: "y" };
    const regEval: EvaluationResponse = {
      model_id: REG_MODEL_ID,
      split: "test",
      metrics: { task_type: "regression", n_samples: 20, mae: 44.375, mse: 2969.83, rmse: 54.4961, r2: 0.4395 },
    };
    mockApi({ ...base, [`GET /api/models/${REG_MODEL_ID}`]: { body: reg }, [`GET /api/models/${REG_MODEL_ID}/evaluation`]: { body: regEval } });
    renderRoute(`/models/${REG_MODEL_ID}`);
    expect(await screen.findByText("44.375")).toBeInTheDocument();
    expect(screen.getByText("54.4961")).toBeInTheDocument();
    expect(screen.getByText("0.4395")).toBeInTheDocument();
  });

  it("explains when a model failed", async () => {
    mockApi({ ...base, [`GET /api/models/${MODEL_ID}`]: { body: { ...modelDetail, status: "failed", error_message: "Training failed unexpectedly." } } });
    renderRoute(`/models/${MODEL_ID}`);
    expect(await screen.findByText("This model is not available")).toBeInTheDocument();
  });
});

describe("Prediction Studio", () => {
  it("builds the form from the model's features and sends real inputs", async () => {
    let sent: RecordedCall | null = null;
    mockApi({
      ...base,
      [`POST /api/models/${MODEL_ID}/predict`]: (call) => {
        sent = call;
        return {
          body: {
            model_id: MODEL_ID,
            task_type: "classification",
            prediction: "virginica",
            probabilities: explainResult.probabilities,
            imputed_features: [{ feature: "color", value: "red", strategy: "most frequent training value" }],
            warnings: [],
          },
        };
      },
    });
    renderRoute(`/models/${MODEL_ID}/predict`);
    const numberField = await screen.findByLabelText(/petal_length/);
    expect(screen.getByLabelText(/color/)).toHaveDisplayValue("(missing: use “red”)");
    expect(screen.getByText("Training range 1 – 6.9")).toBeInTheDocument();

    fireEvent.change(numberField, { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Predict" }));
    expect(screen.getByText("Enter a number or leave empty.")).toBeInTheDocument();
    expect(sent).toBeNull();

    fireEvent.change(numberField, { target: { value: "5.1" } });
    fireEvent.click(screen.getByRole("button", { name: "Predict" }));
    expect(await screen.findByTestId("prediction")).toHaveTextContent("virginica");
    expect(sent!.body).toEqual({ inputs: { petal_length: 5.1, color: null } });
    expect(screen.getByRole("list", { name: "Class probabilities" })).toHaveTextContent("56.7%");
    expect(screen.getByText(/was empty and was filled with/)).toBeInTheDocument();
  });

  it("shows backend validation errors", async () => {
    mockApi({ ...base, [`POST /api/models/${MODEL_ID}/predict`]: { status: 422, body: envelope("UNKNOWN_CATEGORY", "'green' is not a known category for 'color'.") } });
    renderRoute(`/models/${MODEL_ID}/predict`);
    fireEvent.click(await screen.findByRole("button", { name: "Predict" }));
    expect(await screen.findByText("'green' is not a known category for 'color'.")).toBeInTheDocument();
  });
});

describe("Forest Explorer", () => {
  it("shows a real tree and inspects nodes before any explanation", async () => {
    mockApi(base);
    renderRoute(`/models/${MODEL_ID}/forest`);
    expect(await screen.findByRole("group", { name: "Decision tree 0" })).toBeInTheDocument();
    expect(screen.getByText("5 nodes · depth 2 · 3 leaves")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Node 2: color ∈ \{blue\}/ }));
    expect(screen.getAllByText("color ∈ {blue}").length).toBeGreaterThan(0);
    expect(screen.getByText("Decision node")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Tree \d/ })).toHaveLength(3);
  });

  it("explains an input: highlights the real path and shows votes vs averaged probabilities", async () => {
    let sent: RecordedCall | null = null;
    mockApi({
      ...base,
      [`POST /api/models/${MODEL_ID}/explain`]: (call) => {
        sent = call;
        return { body: explainResult };
      },
    });
    renderRoute(`/models/${MODEL_ID}/forest`);
    fireEvent.change(await screen.findByLabelText(/^petal_length/), { target: { value: "5.1" } });
    fireEvent.change(screen.getByLabelText(/^color/), { target: { value: "red" } });
    fireEvent.click(screen.getByRole("button", { name: "Explain prediction" }));

    expect(await screen.findByTestId("forest-prediction")).toHaveTextContent("virginica");
    expect(sent!.body).toEqual({ inputs: { petal_length: 5.1, color: "red" } });
    const onPath = [...document.querySelectorAll("[data-on-path='true']")].map((n) => n.getAttribute("data-node-id"));
    expect(onPath).toEqual(["0", "2", "4"]);
    expect(document.querySelectorAll("path[data-path='true']")).toHaveLength(2);

    expect(screen.getByRole("list", { name: "Tree votes" })).toHaveTextContent("2 / 3");
    expect(screen.getByText("Majority vote and averaged probabilities differ")).toBeInTheDocument();
    expect(screen.getByText(/Leaf #4: predicts/)).toBeInTheDocument();
    expect(screen.getByText("petal_length > 2.45")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tree 1: predicts versicolor" })).toBeInTheDocument();
  });

  it("selects another tree through the URL", async () => {
    mockApi(base);
    const { router } = renderRoute(`/models/${MODEL_ID}/forest`);
    fireEvent.click(await screen.findByRole("button", { name: /^Tree 1:/ }));
    await waitFor(() => expect(router.state.location.search).toBe("?tree=1"));
    expect(await screen.findByRole("group", { name: "Decision tree 1" })).toBeInTheDocument();
  });

  it("explains a regression forest as the mean of its trees", async () => {
    const reg: ModelDetail = { ...modelDetail, id: REG_MODEL_ID, task_type: "regression", classes: null, target_column: "y" };
    const regTree: TreeStructure = {
      ...tree0,
      model_id: REG_MODEL_ID,
      task_type: "regression",
      criterion: "squared_error",
      classes: null,
      nodes: tree0.nodes.map((n, i) => ({ ...n, value: [10 * (i + 1)], prediction: 10 * (i + 1) })),
    };
    const regSchema: InputSchema = { ...inputSchema, model_id: REG_MODEL_ID, task_type: "regression", classes: null };
    const regExplain: ExplainResponse = {
      ...explainResult,
      model_id: REG_MODEL_ID,
      task_type: "regression",
      prediction: 40,
      probabilities: null,
      aggregation: "mean_of_tree_predictions",
      vote_tally: null,
      majority_vote: null,
      majority_agrees_with_model: null,
      tree_mean: 40,
      trees: explainResult.trees.map((t, i) => ({ ...t, prediction: [50, 30, 40][i]!, probabilities: null })),
    };
    mockApi({
      ...base,
      [`GET /api/models/${REG_MODEL_ID}`]: { body: reg },
      [`GET /api/models/${REG_MODEL_ID}/input-schema`]: { body: regSchema },
      [`GET /api/models/${REG_MODEL_ID}/trees`]: { body: { ...treeList, model_id: REG_MODEL_ID, task_type: "regression" } },
      [`GET /api/models/${REG_MODEL_ID}/trees/0`]: { body: regTree },
      [`POST /api/models/${REG_MODEL_ID}/explain`]: { body: regExplain },
    });
    renderRoute(`/models/${REG_MODEL_ID}/forest`);
    fireEvent.click(await screen.findByRole("button", { name: "Explain prediction" }));
    expect(await screen.findByTestId("forest-prediction")).toHaveTextContent("40");
    expect(screen.getByText(/\(50 \+ 30 \+ 40\) ÷ 3 =/)).toBeInTheDocument();
    expect(screen.getByText("Highest tree").nextSibling).toHaveTextContent("50");
  });
});
