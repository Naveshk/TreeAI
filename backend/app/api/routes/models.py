"""Model endpoints: train, read, evaluate, predict, inspect trees, explain."""

from typing import Annotated

from fastapi import APIRouter, Path, Query, Response, status

from app.api.deps import InferenceServiceDep, ModelServiceDep
from app.schemas.model import (
    EvaluationResponse,
    ExplainResponse,
    InputSchemaResponse,
    ModelDetail,
    ModelSummary,
    PredictRequest,
    PredictResponse,
    TrainRequest,
    TreeListResponse,
    TreeStructure,
)

router = APIRouter(prefix="/models", tags=["models"])


@router.post("", response_model=ModelDetail, status_code=status.HTTP_201_CREATED)
def train_model(request: TrainRequest, service: ModelServiceDep) -> ModelDetail:
    return service.train(request)


@router.get("", response_model=list[ModelSummary])
def list_models(
    service: ModelServiceDep, dataset_id: Annotated[str | None, Query()] = None
) -> list[ModelSummary]:
    return service.list_models(dataset_id)


@router.get("/{model_id}", response_model=ModelDetail)
def get_model(model_id: str, service: ModelServiceDep) -> ModelDetail:
    return service.get_model(model_id)


@router.get("/{model_id}/evaluation", response_model=EvaluationResponse)
def get_evaluation(model_id: str, service: ModelServiceDep) -> EvaluationResponse:
    return service.get_evaluation(model_id)


@router.get("/{model_id}/input-schema", response_model=InputSchemaResponse)
def get_input_schema(model_id: str, service: ModelServiceDep) -> InputSchemaResponse:
    return service.get_input_schema(model_id)


@router.delete("/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_model(model_id: str, service: ModelServiceDep) -> Response:
    service.delete_model(model_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{model_id}/predict", response_model=PredictResponse)
def predict(
    model_id: str, request: PredictRequest, service: InferenceServiceDep
) -> PredictResponse:
    return service.predict(model_id, request.inputs)


@router.get("/{model_id}/trees", response_model=TreeListResponse)
def list_trees(model_id: str, service: InferenceServiceDep) -> TreeListResponse:
    return service.list_trees(model_id)


@router.get("/{model_id}/trees/{tree_index}", response_model=TreeStructure)
def get_tree(
    model_id: str, tree_index: Annotated[int, Path(ge=0)], service: InferenceServiceDep
) -> TreeStructure:
    return service.get_tree(model_id, tree_index)


@router.post("/{model_id}/explain", response_model=ExplainResponse)
def explain(
    model_id: str, request: PredictRequest, service: InferenceServiceDep
) -> ExplainResponse:
    return service.explain(model_id, request.inputs)
