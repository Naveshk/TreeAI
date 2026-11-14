"""Bundled sample datasets.

The CSVs were exported once from scikit-learn's bundled datasets (load_iris, load_wine,
load_diabetes(scaled=False)) with snake_case column names and readable class labels.
They are ingested through exactly the same pipeline as user uploads.
"""

from dataclasses import dataclass
from pathlib import Path

SAMPLES_DIR = Path(__file__).resolve().parent


@dataclass(frozen=True)
class SampleDataset:
    id: str
    name: str
    description: str
    filename: str
    task_type: str
    target_column: str

    @property
    def path(self) -> Path:
        return SAMPLES_DIR / self.filename


SAMPLES: tuple[SampleDataset, ...] = (
    SampleDataset(
        id="iris",
        name="Iris",
        description="150 iris flowers described by sepal and petal measurements; "
        "predict the species (3 classes).",
        filename="iris.csv",
        task_type="classification",
        target_column="species",
    ),
    SampleDataset(
        id="wine",
        name="Wine",
        description="178 wines described by 13 chemical measurements; predict the "
        "cultivar class (3 classes).",
        filename="wine.csv",
        task_type="classification",
        target_column="wine_class",
    ),
    SampleDataset(
        id="diabetes",
        name="Diabetes",
        description="442 diabetes patients described by age, sex, BMI, blood pressure and "
        "six blood serum measurements; predict disease progression after one year.",
        filename="diabetes.csv",
        task_type="regression",
        target_column="disease_progression",
    ),
)


def get_sample(sample_id: str) -> SampleDataset | None:
    return next((s for s in SAMPLES if s.id == sample_id), None)
