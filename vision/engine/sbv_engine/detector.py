"""Detector de PERSONAS con YOLOX (Apache-2.0) exportado a ONNX.

Solo devuelve cajas de la clase "persona" (COCO 0). No identifica a nadie.
"""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np
import onnxruntime as ort


@dataclass
class Detections:
    boxes: np.ndarray  # (N, 4) x1, y1, x2, y2 en píxeles del cuadro original
    scores: np.ndarray  # (N,)


class YoloxPersonDetector:
    def __init__(self, model_path: str, input_size: int = 416, conf: float = 0.35, nms: float = 0.45, threads: int = 2):
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = threads
        opts.inter_op_num_threads = 1
        self.session = ort.InferenceSession(model_path, sess_options=opts, providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name
        self.size = input_size
        self.conf = conf
        self.nms = nms
        self._grids, self._strides = self._make_grids(input_size)

    @staticmethod
    def _make_grids(size: int):
        grids, strides = [], []
        for stride in (8, 16, 32):
            h = w = size // stride
            xv, yv = np.meshgrid(np.arange(w), np.arange(h))
            grids.append(np.stack((xv, yv), 2).reshape(-1, 2))
            strides.append(np.full((h * w, 1), stride))
        return np.concatenate(grids, 0).astype(np.float32), np.concatenate(strides, 0).astype(np.float32)

    def _preprocess(self, frame: np.ndarray) -> tuple[np.ndarray, float]:
        h, w = frame.shape[:2]
        r = min(self.size / h, self.size / w)
        resized = cv2.resize(frame, (int(w * r), int(h * r)), interpolation=cv2.INTER_LINEAR)
        padded = np.full((self.size, self.size, 3), 114, dtype=np.uint8)
        padded[: resized.shape[0], : resized.shape[1]] = resized
        blob = padded.transpose(2, 0, 1)[None].astype(np.float32)  # BGR, sin normalizar (YOLOX >= 0.1.1)
        return blob, r

    def detect(self, frame: np.ndarray) -> Detections:
        blob, r = self._preprocess(frame)
        out = self.session.run(None, {self.input_name: blob})[0][0]  # (N, 85)
        xy = (out[:, :2] + self._grids) * self._strides
        wh = np.exp(out[:, 2:4]) * self._strides
        scores = out[:, 4] * out[:, 5]  # objectness × clase persona
        keep = scores >= self.conf
        if not np.any(keep):
            return Detections(np.zeros((0, 4), np.float32), np.zeros((0,), np.float32))
        xy, wh, scores = xy[keep], wh[keep], scores[keep]
        boxes = np.concatenate([xy - wh / 2, xy + wh / 2], 1) / r
        idx = cv2.dnn.NMSBoxes(
            [[float(b[0]), float(b[1]), float(b[2] - b[0]), float(b[3] - b[1])] for b in boxes],
            scores.tolist(), self.conf, self.nms,
        )
        idx = np.array(idx).reshape(-1) if len(idx) else np.zeros((0,), int)
        h, w = frame.shape[:2]
        boxes = boxes[idx]
        boxes[:, [0, 2]] = boxes[:, [0, 2]].clip(0, w)
        boxes[:, [1, 3]] = boxes[:, [1, 3]].clip(0, h)
        return Detections(boxes.astype(np.float32), scores[idx].astype(np.float32))
