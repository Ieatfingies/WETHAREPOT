# WETHAREPOT - ML Surrogate Prototype

## Architecture
U-Net convolutional encoder-decoder.

Input: 7 channels
- Digital Elevation Model
- Building mask
- Manning roughness
- Water depth
- X velocity
- Y velocity
- Rainfall rate

Output: 3 channels
- Next water depth
- Next X velocity
- Next Y velocity

## Dataset
600 simulation-generated samples:
- 450 training
- 30 validation
- 120 held-out Koramangala test samples

Dataset files are generated locally and are not included in Git
because of their size.

## Training
- 20 epochs
- Batch size: 4
- Device: Apple MPS
- Best validation loss: 0.0012734

## Preliminary Koramangala evaluation
- Depth MAE: 0.1291 m
- Depth RMSE: 0.6271 m
- Zero-depth baseline MAE: 0.0333 m

The current model does not outperform the zero-depth baseline.
Cross-region generalization and physical consistency require
further investigation.

## Inference
Entry point: ml/inference/predict.py
Function: rollout_surrogate()
Checkpoint: ml/weights/unet_flood.pth
