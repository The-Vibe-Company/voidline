from pathlib import Path

import onnx
import pytest

from voidline_rl.export_onnx import export_onnx


def test_export_onnx_smoke(tmp_path: Path):
    output = tmp_path / "learned-human.onnx"

    export_onnx("learned-human", None, output)

    assert output.exists()
    model = onnx.load(output)
    assert model.graph.input[0].name == "observation"
    assert model.graph.output[0].name == "action_logits"


def test_export_onnx_rejects_missing_checkpoint(tmp_path: Path):
    with pytest.raises(FileNotFoundError):
        export_onnx("learned-human", tmp_path / "missing.zip", tmp_path / "out.onnx")
