# -*- coding: utf-8 -*-
"""WAN2.2 LoRA — Sammy Startup Backgrounds

Adapted from the pc-guinea backgrounds notebook.
Trains two LoRA checkpoints (high noise + low noise) on startup/office
background images in Underscore Animation's style.

Drive folder layout expected:
  MyDrive/
    _sammyStartup/          ← training images + .txt captions go here
    _sammyStartupOutput/    ← checkpoints saved here after training
"""

!nvidia-smi

# ── Google Drive ─────────────────────────────────────────────────────────────
from google.colab import drive
drive.mount('/content/drive')

# ── HuggingFace auth ──────────────────────────────────────────────────────────
!hf auth login

# ── Clone musubi-tuner ────────────────────────────────────────────────────────
!git clone --recursive https://github.com/kohya-ss/musubi-tuner.git
%cd musubi-tuner

# ── Dependencies ──────────────────────────────────────────────────────────────
!pip install -e .
!pip install protobuf six
!pip install torch==2.7.0 torchvision==0.22.0 xformers==0.0.30 \
    --index-url https://download.pytorch.org/whl/cu128
!pip install torchvision==0.22.0 --index-url https://download.pytorch.org/whl/cu128

# ── Download model weights ────────────────────────────────────────────────────
# VAE (~254 MB)
!hf download Comfy-Org/Wan_2.1_ComfyUI_repackaged \
    split_files/vae/wan_2.1_vae.safetensors --local-dir models/vae

# DiT high noise (~28.6 GB)
!hf download Comfy-Org/Wan_2.2_ComfyUI_Repackaged \
    split_files/diffusion_models/wan2.2_t2v_high_noise_14B_fp16.safetensors \
    --local-dir models/diffusion_models

# DiT low noise (~28.6 GB)
!hf download Comfy-Org/Wan_2.2_ComfyUI_Repackaged \
    split_files/diffusion_models/wan2.2_t2v_low_noise_14B_fp16.safetensors \
    --local-dir models/diffusion_models

# T5 text encoder (~11.4 GB)
!hf download Wan-AI/Wan2.1-I2V-14B-720P \
    models_t5_umt5-xxl-enc-bf16.pth --local-dir models/text_encoders

# ── Copy dataset from Drive ───────────────────────────────────────────────────
# Expected: each image has a matching .txt caption file in the same folder
# e.g.  startup_office_01.png  +  startup_office_01.txt
!mkdir -p dataset
!cp -r /content/drive/MyDrive/_sammyStartup/* /content/musubi-tuner/dataset/

# ── Write caption files (run this block once if captions are missing) ─────────
# Caption format: trigger word + scene description
# Trigger word: sammy_startup_bg
# Uncomment and edit as needed, or write .txt files manually in Drive.

# import os, pathlib
# TRIGGER = "sammy_startup_bg"
# CAPTIONS = {
#     # filename (no ext) : scene description
#     "startup_office_01": f"{TRIGGER}, open plan startup office, exposed brick wall, macbook laptops on standing desks, pendant lights, whiteboard with sticky notes, flat colors, clean outlines, cartoon style background, no characters",
#     "startup_office_02": f"{TRIGGER}, modern co-working space, green plants on shelves, large windows, city view, warm lighting, colorful chairs, minimal flat illustration, no characters",
#     "startup_lounge_01": f"{TRIGGER}, casual startup lounge, bean bag chairs, foosball table, snack bar, neon sign on wall, soft lighting, cartoon style background, no characters",
#     "startup_kitchen_01": f"{TRIGGER}, office kitchen, espresso machine, open shelves with mugs, chalk menu board, bright overhead lights, flat design, no characters",
#     # add more as needed
# }
# for stem, caption in CAPTIONS.items():
#     txt = pathlib.Path(f"/content/musubi-tuner/dataset/{stem}.txt")
#     txt.write_text(caption)
# print("Caption files written.")

# ── Dataset config (TOML) ─────────────────────────────────────────────────────
import toml, os

data = {
    "general": {
        # Bucketing handles widescreen backgrounds (e.g. 832×480, 1280×720)
        # without cropping — set target resolution to your most common size.
        "resolution": [832, 480],
        "caption_extension": ".txt",
        "batch_size": 1,
        "enable_bucket": True,
        "bucket_no_upscale": False,
    },
    "datasets": [
        {
            "image_directory": "/content/musubi-tuner/dataset",
            "cache_directory": "/content/musubi-tuner/dataset/cache",
            "num_repeats": 3,   # bump repeats if dataset is small (<30 images)
        }
    ]
}

os.makedirs("/content/musubi-tuner/dataset", exist_ok=True)
path = "/content/musubi-tuner/dataset/dataset.toml"
with open(path, "w") as f:
    toml.dump(data, f)
print("dataset.toml written to:", path)

# ── Accelerate config (bf16, for cache steps) ─────────────────────────────────
# Answers: This machine / No distributed / No / No / No / all / No / bf16
!accelerate config

# ── Compute latent cache ──────────────────────────────────────────────────────
!python src/musubi_tuner/wan_cache_latents.py \
    --dataset_config /content/musubi-tuner/dataset/dataset.toml \
    --vae /content/musubi-tuner/models/vae/split_files/vae/wan_2.1_vae.safetensors

# ── Compute T5 text encoder cache ────────────────────────────────────────────
!python src/musubi_tuner/wan_cache_text_encoder_outputs.py \
    --dataset_config /content/musubi-tuner/dataset/dataset.toml \
    --t5 /content/musubi-tuner/models/text_encoders/models_t5_umt5-xxl-enc-bf16.pth

# ── Accelerate config (fp32, for training steps) ──────────────────────────────
# Answers: This machine / No distributed / No / No / No / all / No / no
!accelerate config

# ── Check cache size ──────────────────────────────────────────────────────────
!du -sh /content/musubi-tuner/dataset/cache

# ── Training — HIGH NOISE ─────────────────────────────────────────────────────
!accelerate launch --num_cpu_threads_per_process 1 \
src/musubi_tuner/wan_train_network.py \
    --task t2v-A14B \
    --dit /content/musubi-tuner/models/diffusion_models/split_files/diffusion_models/wan2.2_t2v_high_noise_14B_fp16.safetensors \
    --vae /content/musubi-tuner/models/vae/split_files/vae/wan_2.1_vae.safetensors \
    --t5 /content/musubi-tuner/models/text_encoders/models_t5_umt5-xxl-enc-bf16.pth \
    --dataset_config /content/musubi-tuner/dataset/dataset.toml \
    --xformers \
    --mixed_precision fp16 \
    --fp8_base \
    --optimizer_type adamw \
    --learning_rate 3e-4 \
    --gradient_checkpointing \
    --gradient_accumulation_steps 1 \
    --max_data_loader_n_workers 2 \
    --network_module networks.lora_wan \
    --network_dim 32 \
    --network_alpha 32 \
    --timestep_sampling shift \
    --discrete_flow_shift 1.0 \
    --max_train_epochs 150 \
    --save_every_n_epochs 50 \
    --seed 42 \
    --optimizer_args weight_decay=0.1 \
    --max_grad_norm 0 \
    --lr_scheduler polynomial \
    --lr_scheduler_power 8 \
    --lr_scheduler_min_lr_ratio "5e-5" \
    --output_dir /content/musubi-tuner/output \
    --output_name WAN2.2-HighNoise_sammy-startup-bg \
    --metadata_title WAN2.2-HighNoise_sammy-startup-bg \
    --metadata_author underscore_animation \
    --preserve_distribution_shape \
    --min_timestep 875 \
    --max_timestep 1000

# ── Training — LOW NOISE ──────────────────────────────────────────────────────
!accelerate launch --num_cpu_threads_per_process 1 \
src/musubi_tuner/wan_train_network.py \
    --task t2v-A14B \
    --dit /content/musubi-tuner/models/diffusion_models/split_files/diffusion_models/wan2.2_t2v_low_noise_14B_fp16.safetensors \
    --vae /content/musubi-tuner/models/vae/split_files/vae/wan_2.1_vae.safetensors \
    --t5 /content/musubi-tuner/models/text_encoders/models_t5_umt5-xxl-enc-bf16.pth \
    --dataset_config /content/musubi-tuner/dataset/dataset.toml \
    --xformers \
    --mixed_precision fp16 \
    --fp8_base \
    --optimizer_type adamw \
    --learning_rate 3e-4 \
    --gradient_checkpointing \
    --gradient_accumulation_steps 1 \
    --max_data_loader_n_workers 2 \
    --network_module networks.lora_wan \
    --network_dim 32 \
    --network_alpha 32 \
    --timestep_sampling shift \
    --discrete_flow_shift 1.0 \
    --max_train_epochs 150 \
    --save_every_n_epochs 50 \
    --seed 42 \
    --optimizer_args weight_decay=0.1 \
    --max_grad_norm 0 \
    --lr_scheduler polynomial \
    --lr_scheduler_power 8 \
    --lr_scheduler_min_lr_ratio "5e-5" \
    --output_dir /content/musubi-tuner/output \
    --output_name WAN2.2-LowNoise_sammy-startup-bg \
    --metadata_title WAN2.2-LowNoise_sammy-startup-bg \
    --metadata_author underscore_animation \
    --preserve_distribution_shape \
    --min_timestep 0 \
    --max_timestep 875

# ── Save checkpoints to Drive ─────────────────────────────────────────────────
!mkdir -p /content/drive/MyDrive/_sammyStartupOutput/output
!cp -r /content/musubi-tuner/output/* /content/drive/MyDrive/_sammyStartupOutput/output/
print("Checkpoints saved to Drive.")

# ── Inference — smoke test ────────────────────────────────────────────────────
# Run 3-4 prompts to validate style before committing to Human Eval batch.
# All use the trigger word: sammy_startup_bg

PROMPTS = [
    "sammy_startup_bg, open plan startup office, exposed brick wall, macbook laptops on standing desks, pendant lights, flat colors, clean outlines, cartoon style background, no characters",
    "sammy_startup_bg, modern co-working space, large windows, city view, colorful chairs, green plants on shelves, warm lighting, flat illustration, no characters",
    "sammy_startup_bg, casual startup lounge, bean bag chairs, foosball table, snack bar, neon sign on wall, cartoon style background, no characters",
    "sammy_startup_bg, office kitchen, espresso machine, chalk menu board, open shelves with mugs, bright overhead lights, flat design, no characters",
]

import subprocess, shlex

for i, prompt in enumerate(PROMPTS):
    cmd = f"""python src/musubi_tuner/wan_generate_video.py \
  --fp8 \
  --task t2v-A14B \
  --infer_steps 20 \
  --prompt "{prompt}" \
  --output_type images \
  --dit /content/musubi-tuner/models/diffusion_models/split_files/diffusion_models/wan2.2_t2v_low_noise_14B_fp16.safetensors \
  --dit_high_noise /content/musubi-tuner/models/diffusion_models/split_files/diffusion_models/wan2.2_t2v_high_noise_14B_fp16.safetensors \
  --vae /content/musubi-tuner/models/vae/split_files/vae/wan_2.1_vae.safetensors \
  --t5 /content/musubi-tuner/models/text_encoders/models_t5_umt5-xxl-enc-bf16.pth \
  --lora_weight /content/musubi-tuner/output/WAN2.2-LowNoise_sammy-startup-bg.safetensors \
  --lora_weight_high_noise /content/musubi-tuner/output/WAN2.2-HighNoise_sammy-startup-bg.safetensors \
  --attn_mode xformers \
  --video_size 480 832 \
  --video_length 1 \
  --save_path /content/smoke_test_{i:02d}.png"""
    print(f"\n── Smoke test {i+1}/4 ──")
    os.system(cmd)

# Copy smoke test images to Drive for review
!mkdir -p /content/drive/MyDrive/_sammyStartupOutput/smoke_test
!cp /content/smoke_test_*.png /content/drive/MyDrive/_sammyStartupOutput/smoke_test/
print("Smoke test images saved to Drive.")

# ── Next step: upload smoke test images to R2 and run Human Eval ──────────────
# 1. Upload /content/drive/MyDrive/_sammyStartupOutput/smoke_test/ images to R2
# 2. In image_metadata, set:
#    style_name = 'sammy_startup_bg'
#    style_description_keyword = 'startup office background'
# 3. Run Human Eval style_faithfulness eval on the batch
