"""Dataset endpoints: upload, list, detail, preview, profile, delete."""

from typing import Annotated

from fastapi import APIRouter, File, Query, Response, UploadFile, status

from app.api.deps import DatasetServiceDep
from app.schemas.dataset import DatasetDetail, DatasetPreview, DatasetProfile, DatasetSummary

router = APIRouter(prefix="/datasets", tags=["datasets"])

PREVIEW_DEFAULT_LIMIT = 50
PREVIEW_MAX_LIMIT = 100


@router.post("", response_model=DatasetDetail, status_code=status.HTTP_201_CREATED)
def upload_dataset(
    service: DatasetServiceDep,
    file: Annotated[UploadFile, File(description="CSV file to upload")],
) -> DatasetDetail:
    return service.create_from_upload(file.file, file.filename)


@router.get("", response_model=list[DatasetSummary])
def list_datasets(service: DatasetServiceDep) -> list[DatasetSummary]:
    return service.list_datasets()


@router.get("/{dataset_id}", response_model=DatasetDetail)
def get_dataset(dataset_id: str, service: DatasetServiceDep) -> DatasetDetail:
    return service.get_dataset(dataset_id)


@router.get("/{dataset_id}/preview", response_model=DatasetPreview)
def preview_dataset(
    dataset_id: str,
    service: DatasetServiceDep,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=PREVIEW_MAX_LIMIT)] = PREVIEW_DEFAULT_LIMIT,
) -> DatasetPreview:
    return service.get_preview(dataset_id, offset, limit)


@router.get("/{dataset_id}/profile", response_model=DatasetProfile)
def profile_dataset(dataset_id: str, service: DatasetServiceDep) -> DatasetProfile:
    return service.get_profile(dataset_id)


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(dataset_id: str, service: DatasetServiceDep) -> Response:
    service.delete_dataset(dataset_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
