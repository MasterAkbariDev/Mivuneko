// Resident Kokoro TTS worker for Mivuneko (sherpa-onnx C API).
// Loads the model once, then serves requests on stdin/stdout:
// Usage: luna-tts <kokoro-dir> <threads> [voices.bin]
//   in : "GEN <speaker-id> <speed> <text-bytes>\n" followed by that many bytes of UTF-8 text
//   out: "OK <wav-bytes>\n" followed by a 16-bit mono WAV, or "ERR <message>\n"
// Startup prints "READY <sample-rate>\n" once the model is loaded.
// Build: see scripts/build-luna-tts.sh (standalone). The app also compiles this file with
// LUNA_TTS_EMBEDDED (build.rs): it then loads the installed sherpa-onnx library at runtime,
// so app-installed users get the resident worker with no compiler and no extra binary.
//   embedded: <app> --luna-tts <sherpa-onnx-c-api library> <kokoro-dir> <threads> [voices.bin]
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "sherpa-onnx/c-api/c-api.h"
#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif

#ifdef LUNA_TTS_EMBEDDED
#ifdef _WIN32
#include <windows.h>
#else
#include <dlfcn.h>
#endif
typedef const SherpaOnnxOfflineTts *(*CreateFn)(const SherpaOnnxOfflineTtsConfig *);
typedef void (*DestroyFn)(const SherpaOnnxOfflineTts *);
typedef int32_t (*SampleRateFn)(const SherpaOnnxOfflineTts *);
typedef const SherpaOnnxGeneratedAudio *(*GenerateFn)(const SherpaOnnxOfflineTts *, const char *,
                                                      int32_t, float);
typedef void (*FreeAudioFn)(const SherpaOnnxGeneratedAudio *);
static CreateFn create_tts;
static DestroyFn destroy_tts;
static SampleRateFn sample_rate;
static GenerateFn generate;
static FreeAudioFn free_audio;

static void *symbol(void *lib, const char *name) {
#ifdef _WIN32
  return (void *)GetProcAddress((HMODULE)lib, name);
#else
  return dlsym(lib, name);
#endif
}
static int load_sherpa(const char *path) {
#ifdef _WIN32
  wchar_t wide[4096];
  if (!MultiByteToWideChar(CP_UTF8, 0, path, -1, wide, 4096)) return 0;
  // Altered search path finds onnxruntime.dll next to the sherpa library.
  void *lib = (void *)LoadLibraryExW(wide, NULL, LOAD_WITH_ALTERED_SEARCH_PATH);
#else
  void *lib = dlopen(path, RTLD_NOW | RTLD_LOCAL);
#endif
  if (!lib) return 0;
  create_tts = (CreateFn)symbol(lib, "SherpaOnnxCreateOfflineTts");
  destroy_tts = (DestroyFn)symbol(lib, "SherpaOnnxDestroyOfflineTts");
  sample_rate = (SampleRateFn)symbol(lib, "SherpaOnnxOfflineTtsSampleRate");
  generate = (GenerateFn)symbol(lib, "SherpaOnnxOfflineTtsGenerate");
  free_audio = (FreeAudioFn)symbol(lib, "SherpaOnnxDestroyOfflineTtsGeneratedAudio");
  return create_tts && destroy_tts && sample_rate && generate && free_audio;
}
#define SherpaOnnxCreateOfflineTts create_tts
#define SherpaOnnxDestroyOfflineTts destroy_tts
#define SherpaOnnxOfflineTtsSampleRate sample_rate
#define SherpaOnnxOfflineTtsGenerate generate
#define SherpaOnnxDestroyOfflineTtsGeneratedAudio free_audio
#endif

static void put32(uint8_t *p, uint32_t v) {
  p[0] = v; p[1] = v >> 8; p[2] = v >> 16; p[3] = v >> 24;
}
static void put16(uint8_t *p, uint16_t v) { p[0] = v; p[1] = v >> 8; }

static int run(int argc, char **argv) {
#ifdef _WIN32
  _setmode(_fileno(stdin), _O_BINARY);
  _setmode(_fileno(stdout), _O_BINARY);
#endif
  if (argc != 3 && argc != 4) {
    fprintf(stderr, "usage: luna-tts <kokoro-dir> <threads> [voices.bin]\n");
    return 2;
  }
  char model[1024], voices[1024], tokens[1024], lexicon[2048];
  snprintf(model, sizeof model, "%s/model.onnx", argv[1]);
  // Optional character voice table (blended moods); defaults to the stock voices.
  snprintf(voices, sizeof voices, "%s", argc == 4 ? argv[3] : "");
  if (argc != 4) snprintf(voices, sizeof voices, "%s/voices.bin", argv[1]);
  snprintf(tokens, sizeof tokens, "%s/tokens.txt", argv[1]);
  snprintf(lexicon, sizeof lexicon, "%s/lexicon-us-en.txt,%s/lexicon-zh.txt", argv[1], argv[1]);
  char data_dir[1024], dict_dir[1024];
  snprintf(data_dir, sizeof data_dir, "%s/espeak-ng-data", argv[1]);
  snprintf(dict_dir, sizeof dict_dir, "%s/dict", argv[1]);

  SherpaOnnxOfflineTtsConfig config;
  memset(&config, 0, sizeof config);
  config.model.kokoro.model = model;
  config.model.kokoro.voices = voices;
  config.model.kokoro.tokens = tokens;
  config.model.kokoro.data_dir = data_dir;
  config.model.kokoro.dict_dir = dict_dir;
  config.model.kokoro.lexicon = lexicon;
  config.model.kokoro.length_scale = 1.0f;
  config.model.num_threads = atoi(argv[2]) > 0 ? atoi(argv[2]) : 4;
  config.model.provider = "cpu";
  config.max_num_sentences = 1;
  config.silence_scale = 0.2f;

  const SherpaOnnxOfflineTts *tts = SherpaOnnxCreateOfflineTts(&config);
  if (!tts) {
    printf("ERR cannot load the Kokoro model\n");
    return 1;
  }
  printf("READY %d\n", SherpaOnnxOfflineTtsSampleRate(tts));
  fflush(stdout);

  char header[128];
  while (fgets(header, sizeof header, stdin)) {
    int sid = 0, bytes = 0;
    float speed = 1.0f;
    if (sscanf(header, "GEN %d %f %d", &sid, &speed, &bytes) != 3 || bytes <= 0 || bytes > 8000) {
      printf("ERR bad request\n");
      fflush(stdout);
      continue;
    }
    char *text = malloc(bytes + 1);
    if (!text || fread(text, 1, bytes, stdin) != (size_t)bytes) { free(text); break; }
    text[bytes] = 0;
    if (speed < 0.5f) speed = 0.5f;
    if (speed > 2.0f) speed = 2.0f;
    const SherpaOnnxGeneratedAudio *audio = SherpaOnnxOfflineTtsGenerate(tts, text, sid, speed);
    free(text);
    if (!audio || audio->n <= 0) {
      printf("ERR no audio\n");
      fflush(stdout);
      if (audio) SherpaOnnxDestroyOfflineTtsGeneratedAudio(audio);
      continue;
    }
    uint32_t data = (uint32_t)audio->n * 2, total = 44 + data;
    uint8_t *wav = malloc(total);
    memcpy(wav, "RIFF", 4); put32(wav + 4, 36 + data); memcpy(wav + 8, "WAVEfmt ", 8);
    put32(wav + 16, 16); put16(wav + 20, 1); put16(wav + 22, 1);
    put32(wav + 24, audio->sample_rate); put32(wav + 28, audio->sample_rate * 2);
    put16(wav + 32, 2); put16(wav + 34, 16); memcpy(wav + 36, "data", 4); put32(wav + 40, data);
    for (int32_t i = 0; i < audio->n; i++) {
      float s = audio->samples[i];
      if (s > 1.0f) s = 1.0f;
      if (s < -1.0f) s = -1.0f;
      put16(wav + 44 + 2 * i, (uint16_t)(int16_t)(s * 32767.0f));
    }
    SherpaOnnxDestroyOfflineTtsGeneratedAudio(audio);
    printf("OK %u\n", total);
    fwrite(wav, 1, total, stdout);
    fflush(stdout);
    free(wav);
  }
  SherpaOnnxDestroyOfflineTts(tts);
  return 0;
}

#ifdef LUNA_TTS_EMBEDDED
int luna_tts_main(int argc, char **argv) {
  if (argc < 2 || !load_sherpa(argv[1])) {
    printf("ERR cannot load the sherpa-onnx library\n");
    fflush(stdout);
    return 1;
  }
  argv[1] = argv[0];
  return run(argc - 1, argv + 1);
}
#else
int main(int argc, char **argv) { return run(argc, argv); }
#endif
