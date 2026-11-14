# WETHAREPOT — ML Learning Progress Record

- **Project:** WETHAREPOT (Physics-Informed Neural Surrogate for Real-Time Urban Flood Forecasting)
- **Learner Status:** Resumed at Lesson 3

---

## 1. Completed Lessons
- **Lesson 1: Physics Foundations**
  - Shallow Water Equations (2D depth $h$, velocities $u, v$, gravity, bathymetry, Manning friction).
  - Mass conservation and momentum conservation.
  - Surrogate objective: neural approximation of numerical Riemann solver.
- **Lesson 2: U-Net Architecture**
  - Convolution fundamentals, receptive fields, feature maps.
  - Encoder downsampling, bottleneck, decoder transposed convolutions, skip connections.
  - Channel conversion: $[B, 7, 256, 256] \to [B, 3, 256, 256]$ (484,051 parameters).

---

## 2. Current Lesson & Topic
- **Lesson 3: How the Model Learns**
  - **Module A: Dataset Preparation**
    - *Topic 1: How simulation data becomes training samples (Input-Target pairing & temporal alignment).*

---

## 3. Concepts Mastered & Under Review
- **Mastered:** 2D SWE principles, U-Net encoder-decoder flow, skip-connection dimension matching.
- **Currently Learning:** Solver raw frame generation, temporal pairing $(t \to t+1)$, Markovian assumption in ML surrogates.

---

## 4. Topics Not Yet Covered
- B. Normalisation (Z-score, channel-wise, depth scale inflation risk, denormalisation).
- C. Training Mechanics (Forward pass, loss computation, backprop, AdamW, learning rate schedules).
- D. Physics-Informed Training (Composite loss, mass continuity, 2D momentum, wet/dry & boundary penalties).
- E. Inference and Forecasting (Autoregressive rollout, error accumulation, scheduled sampling).
- F. Experimental Architectures (ResUNet, Multiscale dilated bottleneck).
- G. Evaluation and Benchmarking (MAE/RMSE, Flood IoU/Precision/Recall/F1, Volume drift, speedup).

---

## 5. Important Source Files Inspected
- `ml/training/dataset_generator.py`
- `ml/training/dataset.py`
- `ml/training/build_experimental_split.py`
- `simulation/core/main_cli.cpp` / `simulation/core/main_experimental_cli.cpp`

---

## 6. Exact Next Teaching Step
- Explain how continuous time numerical solver output frames become discrete input-target training pairs $(X_t \to Y_{t+1})$.
