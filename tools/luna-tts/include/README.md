`sherpa-onnx/c-api/c-api.h` is copied unmodified from the sherpa-onnx **v2.0.1** release
(https://github.com/k2-fsa/sherpa-onnx, Apache-2.0, Copyright Xiaomi Corporation).
It must match the runtime version the app installs (`voice_install.rs`), because the
embedded worker passes `SherpaOnnxOfflineTtsConfig` to that library by layout.
