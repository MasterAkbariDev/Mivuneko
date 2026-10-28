# Asset and dependency provenance

Luna's existing 2D sprite sheets remain in the project. The Miku, Kiko, Stella, Teto, Neru, Yuki, Sora, Aoi and Raven sprite sheets were generated for this project with the built-in image generation tool in October 2026. Miku, Teto and Neru are unofficial fan art depicting third-party characters; this project does not claim ownership or an endorsement. The project owner must assess the relevant character rights before distribution. Kiko, Stella, Yuki, Sora, Aoi and Raven are original generated designs.

The former Pixiv VRM sample is no longer bundled; its historical source and license metadata remain in `pixiv-expression-sample.json`. Previously imported user models are not deleted by the character migration.

The project's overall redistribution license has not been selected. Tauri, React and other dependencies retain their own licenses. No completed legal clearance is claimed.

Luna's `luna-emotions-v2.png` and `luna-actions-v2.png` were generated from the existing Luna art using the built-in image generation tool in October 2026 for this project's animated 2D prototype.

## Speech models and runtimes (downloaded on demand, not bundled)

- whisper.cpp and the OpenAI Whisper models (ggml conversions): MIT.
- Silero VAD (`ggml-silero-v5.1.2.bin`, via ggml-org/whisper-vad): MIT.
- sherpa-onnx runtime: Apache-2.0.
- NVIDIA Parakeet TDT 0.6B v2 (sherpa-onnx int8 export): CC-BY-4.0, attribution to NVIDIA required if redistributed.
- Kokoro-82M v1.0 (sherpa-onnx export): Apache-2.0. Individual voice styles carry the Kokoro project's terms.
- These are fetched by `npm run setup:voice` / `npm run setup:sherpa` into `.local/` (git-ignored). Verify each licence before redistributing a build that bundles them.


## Bundled VRoid character

Haru (display alias for AvatarSample_B v1.1) is an official VRoid Project character © pixiv Inc., sourced from pixiv/ChatVRM. Original VRM metadata and rights are preserved. See the Haru provenance file for the pinned source, checksum and redistribution conditions. The model retains its own license and must not be relicensed as CC0.
