# Machine Learning Surrogate Documentation

## 1. Overview

The machine-learning component of WETHAREPOT is designed to provide a faster alternative to repeatedly running the computationally expensive physics-based flood solver.

It uses a Convolutional Neural Network (CNN) with a U-Net architecture to predict the evolution of flood states over a two-dimensional geographic grid.

The model receives terrain information, urban features, and the current flood state as input. It predicts the next flood state, consisting of water depth and velocity components.

The current implementation is a preliminary ML surrogate prototype. It has been trained and tested, but further work is required to establish reliable generalization and physical accuracy.

## 2. Directory Structure

**Location:** `ml/`

```text
ml/
├── inference/
│   └── predict.py
├── losses/
│   └── physics_loss.py
├── models/
│   └── unet.py
├── training/
│   ├── dataset.py
│   ├── dataset_generator.py
│   └── train.py
└── weights/
    └── unet_flood.pth
```

| File | Responsibility |
|---|---|
| `models/unet.py` | Defines the U-Net architecture |
| `training/dataset.py` | Loads and normalizes training samples |
| `training/dataset_generator.py` | Generates flood simulation training data |
| `training/train.py` | Trains the neural network |
| `losses/physics_loss.py` | Implements the training loss |
| `inference/predict.py` | Performs flood prediction |
| `weights/unet_flood.pth` | Stores the trained model checkpoint |

## 3. Dataset Generation

**File:** `training/dataset_generator.py`

The machine-learning model requires examples of flood conditions and their corresponding future states.

The dataset generator creates these samples using the project's simulation workflow.

### 3.1 Geographic Regions

The dataset uses four regions for training and validation:

- Bellandur
- HSR Layout
- Mahadevapura
- Whitefield

Koramangala is held out for testing.

This separation allows the model to be evaluated on a geographic region that was not included in its training data.

### 3.2 Rainfall Scenarios

The dataset includes four rainfall intensities:

| Rainfall intensity |
|---:|
| 30 mm/hr |
| 60 mm/hr |
| 95 mm/hr |
| 130 mm/hr |

The simulation duration is 1,800 seconds, with outputs saved at 60-second intervals.

The standard grid size is 256 × 256.

### 3.3 Dataset Split

The completed dataset generation run produced:

| Dataset | Samples |
|---|---:|
| Training | 450 |
| Validation | 30 |
| Testing (Koramangala) | 120 |
| **Total** | **600** |

The generated dataset is stored separately from the source code and is not committed to the Git repository.

## 4. Input and Output Representation

The model works with two-dimensional grid data.

Each training sample contains an input tensor and a target tensor.

### 4.1 Input Tensor

The input tensor has seven channels:

\[
X \in \mathbb{R}^{7 \times H \times W}
\]

| Channel | Description |
|---:|---|
| 0 | Digital Elevation Model |
| 1 | Building mask |
| 2 | Surface roughness |
| 3 | Current water depth |
| 4 | X-direction velocity |
| 5 | Y-direction velocity |
| 6 | Rainfall |

### 4.2 Target Tensor

The target tensor has three channels:

\[
Y \in \mathbb{R}^{3 \times H \times W}
\]

| Channel | Description |
|---:|---|
| 0 | Next water depth |
| 1 | Next X-direction velocity |
| 2 | Next Y-direction velocity |

For the standard grid:

\[
H = W = 256
\]

Therefore, each input has the shape:

```text
(7, 256, 256)
```

Each target has the shape:

```text
(3, 256, 256)
```

The dataset samples are stored in NumPy NPZ files with the keys `x`, `y`, `region`, and `rain_mmhr`.

## 5. U-Net Architecture

**File:** `models/unet.py`

The model uses a U-Net architecture.

U-Net is an encoder-decoder convolutional neural network that uses skip connections to preserve spatial information.

This is useful for flood prediction because the model needs to capture both large-scale spatial patterns and local variations across the terrain grid.

### 5.1 Encoder

The encoder progressively extracts spatial features from the input.

It uses convolutional blocks containing:

- Convolutional layers.
- Group Normalization.
- ReLU activation.

As the encoder progresses, spatial dimensions are reduced while the number of feature channels increases.

This allows the network to learn increasingly abstract representations.

### 5.2 Decoder

The decoder progressively reconstructs the spatial representation.

It increases spatial resolution and combines the reconstructed features with corresponding encoder features.

### 5.3 Skip Connections

Skip connections transfer feature information from the encoder to the decoder.

They help preserve spatial details that may otherwise be lost during downsampling.

### 5.4 Model Configuration

The current implementation uses:

| Parameter | Value |
|---|---:|
| Input channels | 7 |
| Output channels | 3 |
| Base feature channels | 16 |
| Normalization | GroupNorm |
| Activation | ReLU |

The model is implemented using PyTorch.

## 6. Data Normalization

**File:** `training/dataset.py`

The dataset loader calculates channel-wise mean and standard deviation values.

The input and target data are normalized before being passed to the model.

Normalization helps keep features with different numerical scales within more manageable ranges during training.

The normalization statistics are also used during inference to convert model predictions back into physical units.

## 7. Training Process

**File:** `training/train.py`

The training script loads the generated dataset, initializes the U-Net, and optimizes its parameters.

### 7.1 Training Configuration

The completed training run used:

| Parameter | Value |
|---|---:|
| Epochs | 20 |
| Batch size | 4 |
| Optimizer | AdamW |
| Device | Apple MPS |
| Base feature channels | 16 |

The training script supports available accelerator devices and can fall back to CPU.

### 7.2 Optimizer

The model uses AdamW to update its parameters during training.

AdamW is an adaptive optimization algorithm that includes decoupled weight decay.

### 7.3 Checkpoint Saving

The training process tracks validation loss and saves the best-performing validation checkpoint.

The trained model is stored at:

```text
ml/weights/unet_flood.pth
```

The checkpoint is approximately 1.9 MB.

## 8. Physics-Informed Loss

**File:** `losses/physics_loss.py`

The current loss function combines a data-fitting term with a penalty for physically invalid negative water-depth predictions.

Its structure is:

\[
L = L_{\text{data}} + 0.1L_{\text{negative depth}}
\]

### 8.1 Data Loss

The data-fitting component uses Smooth L1 loss to compare the model's predictions with the target simulation states.

It measures the difference between predicted and actual values.

### 8.2 Negative Depth Penalty

Water depth cannot be physically negative.

The implementation therefore adds a penalty when predicted water depth falls below zero.

The depth predictions are converted back from normalized values before this physical constraint is evaluated.

### 8.3 Important Limitation

Although the project uses a physics-informed surrogate approach, the current loss function does not contain a complete shallow-water-equation residual.

It does not yet explicitly enforce:

- Mass conservation.
- Momentum conservation.
- Full shallow-water PDE constraints.

Therefore, the current implementation should be described as a preliminary physics-informed ML prototype, not a fully physics-constrained neural network.

## 9. Inference

**File:** `inference/predict.py`

The inference module loads the trained checkpoint and generates future flood predictions.

The model is used autoregressively: a predicted flood state becomes part of the input for the next prediction step.

The current implementation:

1. Loads the trained model checkpoint.
2. Normalizes the input data.
3. Performs a forward pass through the U-Net.
4. Converts the predictions back to physical units.
5. Clamps predicted water depth to non-negative values.
6. Sets predicted depth to zero in building cells.
7. Uses the predicted state for subsequent rollout steps.

The default macro simulation step is 60 seconds.

### 9.1 Backend Integration

The inference module exposes the following function:

```python
rollout_surrogate(
    dem=...,
    building_mask=...,
    roughness=...,
    rain_mmhr=...,
    duration_min=...,
    weights_path=...
)
```

The backend's surrogate runner calls this function to obtain predicted water-depth frames.

### 9.2 Initial State

The current inference interface initializes water depth and both velocity components to zero.

This is an implementation assumption of the current prototype and should be considered when interpreting predictions.

## 10. Training Results

The completed training run produced the following results:

| Metric | Value |
|---|---:|
| Epoch 1 training loss | 0.109290 |
| Epoch 20 training loss | 0.047962 |
| Best validation loss | 0.0012734 |
| Best checkpoint epoch | 4 |

The best validation checkpoint was saved at epoch 4.

Training loss continued to decrease after that point, but the lowest recorded validation loss occurred earlier.

## 11. Held-Out Evaluation

The model was evaluated using the held-out Koramangala dataset.

The one-step evaluation produced:

| Metric | Result |
|---|---:|
| Mean Absolute Error (MAE) | 0.116595 m |
| Root Mean Squared Error (RMSE) | 0.545832 m |
| Mean actual depth | 0.024619 m |
| Mean predicted depth | 0.124956 m |
| Maximum absolute error | 18.39981 m |

These results indicate that the model tends to overpredict water depth on the held-out test data.

### 11.1 Comparison Against a Zero-Depth Baseline

A baseline that predicts zero water depth provides an important reference because many grid cells have little or no flooding.

The evaluation excluding building cells produced:

| Metric | U-Net prediction | Zero-depth baseline |
|---|---:|---:|
| MAE | 0.129142 m | 0.033284 m |
| RMSE | 0.627092 m | 0.195837 m |

The current model performs worse than the zero-depth baseline on these reported metrics.

This indicates that the surrogate is not yet sufficiently accurate for reliable flood forecasting.

### 11.2 Interpretation

The evaluation highlights several areas that require improvement:

- The model overestimates average water depth.
- Prediction errors increase under higher rainfall conditions.
- The model does not yet outperform a simple zero-depth baseline.
- The maximum absolute error indicates that some predictions have substantial local errors.

The current results should be treated as preliminary experimental findings, not evidence of successful generalization.

## 12. Current Limitations

The current ML prototype has several limitations:

1. The training dataset is generated from a limited set of geographic regions.
2. The held-out evaluation indicates poor generalization to Koramangala.
3. The current loss does not enforce the full shallow-water equations.
4. The model tends to overpredict water depth.
5. Initial water depth and velocity are currently assumed to be zero during inference.
6. Further validation is required across different rainfall scenarios.
7. The model's prediction accuracy must improve before it can be considered a reliable replacement for the physics solver.

## 13. Future Improvements

Potential improvements include:

- Adding shallow-water PDE residual terms to the training objective.
- Introducing explicit mass-conservation constraints.
- Improving the balance between flooded and non-flooded training cells.
- Expanding the geographic training dataset.
- Improving performance on unseen regions.
- Investigating normalization and loss weighting.
- Evaluating predictions at multiple rollout steps.
- Comparing inference speed against the C++ solver.
- Testing different network architectures and model sizes.
- Validating predictions against independent flood observations where available.

## 14. Reproducibility

The main ML workflow consists of three stages:

### Stage 1: Generate the dataset

```bash
PYTHONPATH=. python3 ml/training/dataset_generator.py
```

### Stage 2: Train the model

```bash
PYTHONPATH=. python3 ml/training/train.py
```

### Stage 3: Run inference

The inference module is called through the backend surrogate runner or directly through its Python interface.

The trained checkpoint is stored in:

```text
ml/weights/unet_flood.pth
```

The generated dataset is stored separately and is not included in the Git repository.

---

**Project:** WETHAREPOT  
**Document:** Machine Learning Surrogate Documentation  
**Purpose:** Describe dataset generation, U-Net architecture, training, physics-informed loss, inference, and evaluation.