"""Read the REAL fitted trees inside a trained forest and explain predictions.

Nothing here simulates a tree:
- structures come from `forest.estimators_[i].tree_`
- paths come from `estimator.decision_path()` / `estimator.apply()` on the input after the
  pipeline's own fitted preprocessor (directions are never recomputed, because sklearn
  compares in float32)
- per-tree outputs come from `estimator.predict_proba()` / `estimator.predict()`
- trees inside a forest predict class INDICES; labels are mapped through `forest.classes_`
- the forest's own `predict` / `predict_proba` is authoritative, and the explanation must
  reproduce it (`np.allclose`) or an error is raised
"""

from collections import Counter
from typing import Any

import numpy as np
import pandas as pd
from sklearn.pipeline import Pipeline

from app.errors import InternalError
from app.ml.feature_mapping import split_rules


def _forest(pipeline: Pipeline) -> Any:
    return pipeline.named_steps["forest"]


def tree_summaries(pipeline: Pipeline) -> list[dict[str, int]]:
    return [
        {
            "index": i,
            "n_nodes": int(est.tree_.node_count),
            "depth": int(est.get_depth()),
            "n_leaves": int(est.get_n_leaves()),
        }
        for i, est in enumerate(_forest(pipeline).estimators_)
    ]


def _node_output(
    value: np.ndarray, task_type: str, classes: list[str] | None
) -> tuple[list[float], str | float]:
    if task_type == "classification":
        counts = np.asarray(value[0], dtype=float)
        total = counts.sum()
        fractions = counts / total if total > 0 else counts
        assert classes is not None
        return [float(f) for f in fractions], classes[int(np.argmax(fractions))]
    mean = float(value[0][0])
    return [mean], mean


def extract_tree(
    pipeline: Pipeline,
    tree_index: int,
    schema: list[dict[str, Any]],
    task_type: str,
    classes: list[str] | None,
) -> dict[str, Any]:
    estimator = _forest(pipeline).estimators_[tree_index]
    tree = estimator.tree_
    left, right = tree.children_left, tree.children_right

    depths = np.zeros(tree.node_count, dtype=int)
    for node in range(tree.node_count):  # children always have larger ids than parents
        if left[node] != -1:
            depths[left[node]] = depths[node] + 1
            depths[right[node]] = depths[node] + 1

    nodes: list[dict[str, Any]] = []
    for node in range(tree.node_count):
        is_leaf = left[node] == -1
        value, prediction = _node_output(tree.value[node], task_type, classes)
        entry: dict[str, Any] = {
            "id": node,
            "depth": int(depths[node]),
            "is_leaf": bool(is_leaf),
            "left": None if is_leaf else int(left[node]),
            "right": None if is_leaf else int(right[node]),
            "feature": None,
            "feature_kind": None,
            "threshold": None,
            "threshold_display": None,
            "left_rule": None,
            "right_rule": None,
            "n_samples": int(tree.n_node_samples[node]),
            "weighted_n_samples": float(tree.weighted_n_node_samples[node]),
            "impurity": float(tree.impurity[node]),
            "value": value,
            "prediction": prediction,
        }
        if not is_leaf:
            feature = schema[int(tree.feature[node])]
            threshold = float(tree.threshold[node])
            rules = split_rules(feature, threshold)
            entry.update(
                feature=feature["name"],
                feature_kind=feature["kind"],
                threshold=threshold,
                threshold_display=rules["threshold_display"],
                left_rule=rules["left_rule"],
                right_rule=rules["right_rule"],
            )
        nodes.append(entry)

    return {
        "tree_index": tree_index,
        "n_nodes": int(tree.node_count),
        "depth": int(estimator.get_depth()),
        "n_leaves": int(estimator.get_n_leaves()),
        "nodes": nodes,
    }


def aggregate_classification(
    tree_probas: np.ndarray, classes: list[str], model_proba: np.ndarray, model_label: str
) -> dict[str, Any]:
    """Majority-vote tally (educational) next to the forest's real soft-vote result."""
    votes = [classes[int(np.argmax(p))] for p in tree_probas]
    counts = Counter(votes)
    tally = [{"label": label, "count": int(counts.get(label, 0))} for label in classes]
    top = max(counts.values())
    majority = [label for label in classes if counts.get(label, 0) == top]
    consistent = bool(np.allclose(tree_probas.mean(axis=0), model_proba, atol=1e-9))
    return {
        "votes": votes,
        "vote_tally": tally,
        "majority_vote": majority,
        "majority_agrees_with_model": majority == [model_label],
        "consistent": consistent,
    }


def explain_prediction(
    pipeline: Pipeline,
    x: pd.DataFrame,
    schema: list[dict[str, Any]],
    task_type: str,
    classes: list[str] | None,
    display_inputs: dict[str, Any],
) -> dict[str, Any]:
    """Per-tree predictions and real decision paths for ONE prepared input row."""
    forest = _forest(pipeline)
    x_t = pipeline.named_steps["preprocess"].transform(x)

    trees: list[dict[str, Any]] = []
    tree_outputs: list[np.ndarray] = []
    for index, estimator in enumerate(forest.estimators_):
        tree = estimator.tree_
        indicator = estimator.decision_path(x_t)
        path = [
            int(n) for n in sorted(indicator.indices[indicator.indptr[0] : indicator.indptr[1]])
        ]
        leaf = int(estimator.apply(x_t)[0])
        if path[-1] != leaf:
            raise InternalError(
                "INTERNAL_INCONSISTENCY", "Decision path does not end at the predicted leaf."
            )

        steps = []
        for node, nxt in zip(path, path[1:], strict=False):
            feature = schema[int(tree.feature[node])]
            rules = split_rules(feature, float(tree.threshold[node]))
            went = "left" if nxt == tree.children_left[node] else "right"
            steps.append(
                {
                    "node_id": node,
                    "feature": feature["name"],
                    "rule": rules[f"{went}_rule"],
                    "went": went,
                    "input_value": display_inputs.get(feature["name"]),
                }
            )

        if task_type == "classification":
            proba = estimator.predict_proba(x_t)[0]
            tree_outputs.append(proba)
            assert classes is not None
            prediction: str | float = classes[int(np.argmax(proba))]
            probabilities = [
                {"label": c, "probability": float(p)} for c, p in zip(classes, proba, strict=True)
            ]
        else:
            value = float(estimator.predict(x_t)[0])
            tree_outputs.append(np.array([value]))
            prediction, probabilities = value, None

        trees.append(
            {
                "tree_index": index,
                "prediction": prediction,
                "probabilities": probabilities,
                "leaf_id": leaf,
                "path": path,
                "steps": steps,
            }
        )

    if task_type == "classification":
        assert classes is not None
        model_proba = pipeline.predict_proba(x)[0]
        model_label = str(pipeline.predict(x)[0])
        summary = aggregate_classification(
            np.vstack(tree_outputs), classes, model_proba, model_label
        )
        result = {
            "prediction": model_label,
            "probabilities": [
                {"label": c, "probability": float(p)}
                for c, p in zip(classes, model_proba, strict=True)
            ],
            "aggregation": "mean_of_tree_probabilities",
            "vote_tally": summary["vote_tally"],
            "majority_vote": summary["majority_vote"],
            "majority_agrees_with_model": summary["majority_agrees_with_model"],
            "tree_mean": None,
            "consistent": summary["consistent"],
        }
    else:
        model_value = float(pipeline.predict(x)[0])
        tree_mean = float(np.mean([o[0] for o in tree_outputs]))
        result = {
            "prediction": model_value,
            "probabilities": None,
            "aggregation": "mean_of_tree_predictions",
            "vote_tally": None,
            "majority_vote": None,
            "majority_agrees_with_model": None,
            "tree_mean": tree_mean,
            "consistent": bool(np.isclose(tree_mean, model_value, rtol=1e-9, atol=1e-9)),
        }

    if not result["consistent"]:
        raise InternalError(
            "INTERNAL_INCONSISTENCY",
            "The per-tree explanation does not reproduce the model's prediction.",
        )
    result["trees"] = trees
    return result
