#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p vendor/ort models
cp node_modules/paddleocr/dist/index.mjs vendor/paddleocr.mjs
cp node_modules/onnxruntime-web/dist/ort.wasm.min.mjs \
   node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs \
   node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm vendor/ort/

# PP-OCRv5 mobile ONNX from RapidOCR (Apache-2.0, see licenses/).
MS=https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/master
get() { [ -s "$2" ] || curl -fL --retry 3 -o "$2" "$1"; }
get "$MS/onnx/PP-OCRv5/det/ch_PP-OCRv5_det_mobile.onnx" models/det.onnx
get "$MS/onnx/PP-OCRv5/rec/ch_PP-OCRv5_rec_mobile.onnx" models/rec.onnx
get "$MS/paddle/PP-OCRv5/rec/ch_PP-OCRv5_rec_mobile/ppocrv5_dict.txt" models/dict.txt
get "$MS/onnx/PP-OCRv5/rec/korean_PP-OCRv5_rec_mobile.onnx" models/korean_rec.onnx
get "$MS/paddle/PP-OCRv5/rec/korean_PP-OCRv5_rec_mobile/ppocrv5_korean_dict.txt" models/korean_dict.txt
