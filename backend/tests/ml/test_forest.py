"""Tree extraction and explanations must match the real fitted scikit-learn forest."""

import numpy as np
import pandas as pd
import pytest

from app.errors import AppError
from app.ml.feature_mapping import format_number, split_rules
from app.ml.forest import aggregate_classification, explain_prediction, extract_tree
from app.ml.inputs import build_input_frame
from app.ml.preprocessing import FeatureSpec
from app.ml.training import TrainingConfig, train_random_forest

IRIS = pd.read_csv("app/samples/iris.csv")


def _iris_with_category() -> pd.DataFrame:
    frame = IRIS.copy()
    frame["region"] = np.array(["north", "south", "east"])[frame.index % 3]
    return frame


SPECS = [FeatureSpec(c, "numeric") for c in IRIS.columns[:4]] + [
    FeatureSpec("region", "categorical")
]
HP = dict(
    n_estimators=30,
    max_depth=None,
    min_samples_split=2,
    min_samples_leaf=1,
    max_features="sqrt",
    bootstrap=True,
    criterion="gini",
)


@pytest.fixture(scope="module")
def clf():
    cfg = TrainingConfig("classification", "species", SPECS, 0.2, 3, True, HP)
    return train_random_forest(_iris_with_category(), cfg)


@pytest.fixture(scope="module")
def reg():
    specs = [FeatureSpec(c, "numeric") for c in IRIS.columns[:3]]
    hp = {**HP, "criterion": "squared_error", "max_features": 1.0}
    cfg = TrainingConfig("regression", "petal_width_cm", specs, 0.2, 3, False, hp)
    return train_random_forest(IRIS, cfg)


INPUTS = [
    {
        "sepal_length_cm": 5.1,
        "sepal_width_cm": 3.5,
        "petal_length_cm": 1.4,
        "petal_width_cm": 0.2,
        "region": "north",
    },
    {
        "sepal_length_cm": 6.0,
        "sepal_width_cm": 2.7,
        "petal_length_cm": 5.1,
        "petal_width_cm": 1.6,
        "region": "east",
    },
    {
        "sepal_length_cm": 6.3,
        "sepal_width_cm": 2.5,
        "petal_length_cm": 4.9,
        "petal_width_cm": None,
        "region": None,
    },
]


@pytest.mark.parametrize("inputs", INPUTS)
def test_classification_explanation_reproduces_forest(clf, inputs) -> None:
    frame, display, _, _ = build_input_frame(inputs, clf.input_schema)
    result = explain_prediction(
        clf.pipeline, frame, clf.input_schema, "classification", clf.classes, display
    )
    forest = clf.pipeline.named_steps["forest"]
    x_t = clf.pipeline.named_steps["preprocess"].transform(frame)

    assert result["prediction"] == clf.pipeline.predict(frame)[0]
    expected_proba = clf.pipeline.predict_proba(frame)[0]
    assert [p["probability"] for p in result["probabilities"]] == pytest.approx(expected_proba)
    tree_mean = np.mean(
        [[p["probability"] for p in t["probabilities"]] for t in result["trees"]], axis=0
    )
    assert tree_mean == pytest.approx(expected_proba)
    assert result["consistent"] is True
    assert sum(v["count"] for v in result["vote_tally"]) == len(forest.estimators_)

    for tree_result, estimator in zip(result["trees"], forest.estimators_, strict=True):
        tree = estimator.tree_
        path = tree_result["path"]
        assert path[0] == 0
        assert path[-1] == tree_result["leaf_id"] == estimator.apply(x_t)[0]
        assert tree.children_left[path[-1]] == -1
        for parent, child, step in zip(path, path[1:], tree_result["steps"], strict=False):
            expected_dir = "left" if child == tree.children_left[parent] else "right"
            assert child in (tree.children_left[parent], tree.children_right[parent])
            assert step["went"] == expected_dir
        label_index = int(estimator.predict(x_t)[0])  # trees predict class indices
        assert tree_result["prediction"] == forest.classes_[label_index]


@pytest.mark.parametrize(
    "inputs",
    [
        {"sepal_length_cm": 5.0, "sepal_width_cm": 3.0, "petal_length_cm": 1.5},
        {"sepal_length_cm": 7.2, "sepal_width_cm": 3.0, "petal_length_cm": 6.0},
    ],
)
def test_regression_explanation_is_mean_of_trees(reg, inputs) -> None:
    frame, display, _, _ = build_input_frame(inputs, reg.input_schema)
    result = explain_prediction(reg.pipeline, frame, reg.input_schema, "regression", None, display)

    model_value = reg.pipeline.predict(frame)[0]
    assert result["prediction"] == pytest.approx(model_value)
    assert result["tree_mean"] == pytest.approx(model_value)
    assert np.mean([t["prediction"] for t in result["trees"]]) == pytest.approx(model_value)
    assert result["vote_tally"] is None


def test_extracted_tree_matches_sklearn_structure(clf) -> None:
    estimator = clf.pipeline.named_steps["forest"].estimators_[4]
    tree = estimator.tree_
    extracted = extract_tree(clf.pipeline, 4, clf.input_schema, "classification", clf.classes)

    assert extracted["n_nodes"] == tree.node_count
    assert extracted["depth"] == estimator.get_depth()
    assert extracted["n_leaves"] == estimator.get_n_leaves()
    names = [f["name"] for f in clf.input_schema]
    for node in extracted["nodes"]:
        i = node["id"]
        assert node["n_samples"] == tree.n_node_samples[i]
        assert node["impurity"] == pytest.approx(tree.impurity[i])
        assert sum(node["value"]) == pytest.approx(1.0)
        if node["is_leaf"]:
            assert tree.children_left[i] == -1
            assert node["feature"] is None
        else:
            assert (node["left"], node["right"]) == (
                tree.children_left[i],
                tree.children_right[i],
            )
            assert node["feature"] == names[tree.feature[i]]
            assert node["threshold"] == pytest.approx(tree.threshold[i])
    depths = {n["id"]: n["depth"] for n in extracted["nodes"]}
    assert max(depths.values()) == extracted["depth"]


def test_categorical_split_rules() -> None:
    feature = {"name": "region", "kind": "categorical", "categories": ["east", "north", "south"]}
    rules = split_rules(feature, 0.5)
    assert rules["left_rule"] == "region ∈ {east}"
    assert rules["right_rule"] == "region ∈ {north, south}"
    assert split_rules(feature, 1.5)["left_categories"] == ["east", "north"]


def test_numeric_split_rules_and_formatting() -> None:
    feature = {"name": "age", "kind": "numeric", "categories": None}
    assert split_rules(feature, 28.5)["left_rule"] == "age ≤ 28.5"
    assert split_rules(feature, 28.5)["right_rule"] == "age > 28.5"
    assert format_number(2.4500000476837) == "2.45"
    assert format_number(0) == "0"
    assert format_number(1234567.0) == "1.235e+06"


def test_aggregation_reports_majority_vote_disagreement() -> None:
    # Synthetic per-tree probabilities where hard and soft voting disagree:
    # two trees weakly prefer "a", one tree strongly prefers "b".
    probas = np.array([[0.55, 0.45], [0.55, 0.45], [0.0, 1.0]])
    model_proba = probas.mean(axis=0)  # [0.367, 0.633] -> soft vote "b"
    summary = aggregate_classification(probas, ["a", "b"], model_proba, "b")

    assert summary["vote_tally"] == [{"label": "a", "count": 2}, {"label": "b", "count": 1}]
    assert summary["majority_vote"] == ["a"]
    assert summary["majority_agrees_with_model"] is False
    assert summary["consistent"] is True


def test_aggregation_detects_inconsistency() -> None:
    probas = np.array([[1.0, 0.0], [1.0, 0.0]])
    summary = aggregate_classification(probas, ["a", "b"], np.array([0.5, 0.5]), "a")
    assert summary["consistent"] is False


def test_aggregation_reports_ties() -> None:
    probas = np.array([[0.9, 0.1], [0.2, 0.8]])
    summary = aggregate_classification(probas, ["a", "b"], probas.mean(axis=0), "a")
    assert summary["majority_vote"] == ["a", "b"]
    assert summary["majority_agrees_with_model"] is False


def test_input_validation(clf) -> None:
    schema = clf.input_schema
    with pytest.raises(AppError) as info:
        build_input_frame({"bogus": 1}, schema)
    assert info.value.code == "UNKNOWN_FEATURE"
    with pytest.raises(AppError) as info:
        build_input_frame({"region": "west"}, schema)
    assert info.value.code == "UNKNOWN_CATEGORY"
    assert info.value.details["allowed"] == ["east", "north", "south"]
    for bad in ("abc", True, "inf", float("nan")):
        with pytest.raises(AppError) as info:
            build_input_frame({"sepal_length_cm": bad}, schema)
        assert info.value.code == "INVALID_NUMBER"

    frame, _, imputed, warnings = build_input_frame({"sepal_length_cm": "99"}, schema)
    assert frame.loc[0, "sepal_length_cm"] == 99.0
    assert {i["feature"] for i in imputed} == {
        "sepal_width_cm",
        "petal_length_cm",
        "petal_width_cm",
        "region",
    }
    assert any("outside the training range" in w for w in warnings)
