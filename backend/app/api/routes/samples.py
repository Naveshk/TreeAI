"""Bundled sample datasets: list and load (through the normal ingestion pipeline)."""

from fastapi import APIRouter, status

from app.api.deps import DatasetServiceDep
from app.samples.registry import SAMPLES
from app.schemas.dataset import DatasetDetail, SampleInfo

router = APIRouter(prefix="/samples", tags=["samples"])


@router.get("", response_model=list[SampleInfo])
def list_samples() -> list[SampleInfo]:
    return [
        SampleInfo(
            id=s.id,
            name=s.name,
            description=s.description,
            task_type=s.task_type,  # type: ignore[arg-type]
            target_column=s.target_column,
        )
        for s in SAMPLES
    ]


@router.post("/{sample_id}/load", response_model=DatasetDetail, status_code=status.HTTP_201_CREATED)
def load_sample(sample_id: str, service: DatasetServiceDep) -> DatasetDetail:
    return service.create_from_sample(sample_id)
