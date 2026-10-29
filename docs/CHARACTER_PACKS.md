# Character Pack v1

A character is a versioned folder of declarative JSON, artwork or a VRM, and an explicit voice definition. Importing creates a new library entry with a device-generated ID. It never replaces a character with the same name or publisher ID.

## Choose your format

| Format | Artwork                                                 | Animation                                                               | What to prepare                                     |
| ------ | ------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------- |
| 2D     | Individual PNG/WebP/JPEG images, sprite sheets, or both | Timed pose frame lists                                                  | Transparent, consistently aligned full-body artwork |
| 2.5D   | The same frame system, with separate depth layers       | Pose animation plus bounded parallax and layer sway                     | Aligned transparent planes; not a Cubism file       |
| 3D     | A self-contained VRM                                    | Humanoid gestures, gaze, facial morphs, mouth movement and spring bones | A VRM humanoid with standard expression presets     |

Live2D `.moc3`, arbitrary scripts, remote asset URLs, FBX and external motion-file imports are not part of this version. A flat illustration does not acquire independently moving hair unless the pack supplies separate layers. Qwen voice cloning is planned; the pack format can store the reference now, but the app does not claim to clone it yet.

## Folder layout

```text
my-companion/
  character.json
  art/
    expressions.png
    walk-right.png
    idle-01.png
    idle-02.png
  voice/
    reference.wav
  model/
    companion.vrm
```

Only referenced assets are imported. A 2D pack does not need a model folder; a silent pack does not need a voice folder. Keep licenses and source files alongside the pack when distributing it.

Import the folder using **Characters → Your character packs → Import character folder**. If you receive a ZIP, unzip it first. Select one folder containing exactly one `character.json`. After validation, the pack appears in its format tab. A standalone `.vrm` can also be added through **3D → Import VRM character**; every file gets a new slot and starts silent.

## The manifest

```json
{
  "schemaVersion": 1,
  "id": "yourname.soft-companion",
  "name": "My companion",
  "author": "Your name",
  "license": "Your chosen usage terms",
  "format": "2d",
  "assets": {
    "atlas": {
      "type": "image",
      "path": "art/expressions.png",
      "grid": { "columns": 3, "rows": 2 }
    }
  },
  "frames": {
    "neutral": { "asset": "atlas", "cell": [0, 0], "anchor": [0.5, 0.95] },
    "smile": { "asset": "atlas", "cell": [1, 0], "anchor": [0.5, 0.95] }
  },
  "poses": {
    "idle": {
      "frames": [{ "frame": "neutral", "durationMs": 1200 }],
      "loop": true
    },
    "happy": {
      "frames": [{ "frame": "smile", "durationMs": 1200 }],
      "loop": true
    }
  },
  "fallbackPose": "idle",
  "voice": { "kind": "none" }
}
```

`schemaVersion` is required. `id` identifies the published design, while the app creates a separate installation ID for every import. `name`, `author` and `license` are required human-readable strings. Renaming a file does not change a character's identity or grant rights to redistribute it.

## Six-pose sprite sheets

A 1536 × 1024 image divided into three columns and two rows gives six 512 × 512 cells. Index cells from zero, starting at the top left:

| Cell   | Example pose | Cell          |
| ------ | ------------ | ------------- |
| [0, 0] | idle         | top left      |
| [1, 0] | happy        | top middle    |
| [2, 0] | surprised    | top right     |
| [0, 1] | angry        | bottom left   |
| [1, 1] | sleeping     | bottom middle |
| [2, 1] | speaking     | bottom right  |

This ordering is an example, not a requirement. Your JSON tells the app which cell means which pose. Do not assume every artist uses the same order. Keep eyes, hands, ears, hair and feet inside their cell, with at least 3–5% transparent padding. Never enlarge a low-resolution contact sheet and call it high-resolution artwork. Use at least 512 pixels per full-body pose for normal desktop sizes; larger companions need correspondingly larger source artwork.

For an irregular atlas, omit `grid` and use explicit pixel rectangles:

```json
"frames": {
  "wave-01": {"asset": "atlas", "rect": [12, 18, 488, 490], "anchor": [0.5, 0.96]}
}
```

Rectangles are `[x, y, width, height]` in source pixels. Choose either `cell` or `rect`, not both. The importer rejects rectangles outside the image. A grid must divide the image into whole-pixel cells. The app's built-in legacy atlas correction is not a substitute for publishing accurate pack rectangles.

## Multiple images for one pose

One pose can contain many frames from different files or atlases. Every frame has its own duration:

```json
"assets": {
  "idle1": {"type": "image", "path": "art/idle-01.png"},
  "idle2": {"type": "image", "path": "art/idle-02.png"}
},
"frames": {
  "idle-open": {"asset": "idle1", "anchor": [0.5, 0.97]},
  "idle-blink": {"asset": "idle2", "anchor": [0.5, 0.97]}
},
"poses": {
  "idle": {
    "frames": [
      {"frame": "idle-open", "durationMs": 2400},
      {"frame": "idle-blink", "durationMs": 100},
      {"frame": "idle-open", "durationMs": 200}
    ],
    "loop": true
  }
}
```

Repeated frames within an animation can express a hold or a returning step. That differs from assigning the same drawing to every emotion. Publish distinct emotions where you advertise them. Missing poses fall back to `fallbackPose`, usually `idle`; the imported-card pose menu shows only poses actually provided.

## Alignment and anchors

An anchor is a normalized point inside the cropped frame: `[0, 0]` is its top left, `[1, 1]` its bottom right. Put the anchor at the same anatomical point in every frame, usually the ground between the feet. `[0.5, 0.95]` leaves space below the feet. The renderer keeps that point on the same baseline and preserves aspect ratio.

Do not independently crop every animation frame tightly around a moving body without updating its anchor. That makes the character jump. Preserve a shared canvas or author each anchor deliberately. Include contact shadows only inside the artwork; the desktop remains transparent outside the model. The caption, microphone indicator and dock use stable UI anchors and should not be baked into character images.

## Walking, running and direction

Use these pose names for illustrated locomotion:

```text
walk-front  walk-back  walk-left  walk-right
run-front   run-back   run-left   run-right
sit
```

Each sequence should alternate legs and arms with a shared baseline. Three or more frames per cycle work better than shifting one standing picture. Running needs airborne/extended strides of its own. Supply both sides when hair, clothing or accessories are asymmetric. Imported packs do not silently mirror an asymmetric character; make a deliberate left-facing sequence. Diagonal movement selects the nearest cardinal facing.

Pose priority for imported illustrations is movement/posture when a matching sequence exists, then the chosen expression or speaking pose, then the fallback. The app's general movement controller can move a static image, but a pack without locomotion drawings does not have a walking animation. Reduced motion holds the first frame and disables depth movement.

## 2.5D depth layers

Set `format` to `2.5d`. Provide the same `assets`, `frames` and `poses` as a 2D pack. Optional layers reference additional frame definitions:

```json
"layers": [
  {"id": "back-hair", "frame": "hair-back", "depth": -0.4, "origin": [0.5, 0.2]},
  {"id": "front-ribbon", "frame": "ribbon", "depth": 0.6, "origin": [0.5, 0.3]}
]
```

Negative depth draws behind the current pose; nonnegative depth draws in front. Layers retain declaration order within those groups. Depth ranges from -1 to 1. Origin sets the rotation pivot within that layer's drawn rectangle. Keep layer canvases and anchors aligned with the body so their offsets are intentional. Pointer parallax and gentle sway are bounded and turn off with reduced motion. This format is an illustrated depth system, not a Live2D/Cubism importer or a general skeletal rig.

## Create and import a 3D character

Create a humanoid in a VRM-capable editor such as VRoid Studio and export a self-contained `.vrm` with embedded textures. Import through the 3D gallery, or wrap it in a pack:

```json
{
  "schemaVersion": 1,
  "id": "yourname.original-avatar",
  "name": "My avatar",
  "author": "Your name",
  "license": "Your model's actual usage terms",
  "format": "3d",
  "assets": { "avatar": { "type": "vrm", "path": "model/companion.vrm" } },
  "model": "avatar",
  "voice": { "kind": "none" }
}
```

Standard humanoid bones, gaze, spring bones and facial presets make the model more expressive. Include `happy`, `sad`, `angry`, `surprised`, `relaxed`, `blink`, `blinkLeft`, `blinkRight` and mouth preset `aa` where supported. A model without a morph cannot display that morph just through a label in JSON.

An optional `expressions` map can blend model presets for each app mood:

```json
"expressions": {
  "crying": {"sad": 0.9, "blinkLeft": 0.35, "blinkRight": 0.35},
  "love": {"happy": 0.65, "relaxed": 0.3}
}
```

Weights must be between zero and one. Mivuneko authors the body gestures; separate animation clips shown on a model's website are not automatically embedded in its VRM or downloaded by this importer. Check seated legs, elbow direction, hand gestures, feet, gaze and spring behavior on the actual model. Poses and camera framing vary with proportions and clothing.

## Voice identity: explicit or silent

Voice is independent of model format. If `voice` is absent or `kind` is `none`, the character has no voice and stays silent. It never borrows Luna's voice or the system voice. Bundled characters have separately registered local voice recipes.

### A local cloning reference

```json
"assets": {
  "reference": {"type": "audio", "path": "voice/reference.wav"}
},
"voice": {
  "kind": "reference",
  "asset": "reference",
  "transcript": "The exact words spoken in this recording.",
  "language": "en"
}
```

Use a clean 3–30 second WAV, mono or stereo, below 8 MB. Avoid music, effects, clipping and overlapping speakers. Preserve the exact transcript and language. Store only a voice you have permission to use. The app validates and stores the reference locally. Qwen-based cloning is a future engine; until a compatible engine exists, reference-only characters remain silent. A reference is not automatically sent to a server.

### A server-generation prompt

```json
"voice": {
  "kind": "prompt",
  "prompt": "A soft, light, warm adult voice with clear diction, gentle enthusiasm and natural pauses. Keep the same identity across emotions.",
  "language": "en"
}
```

Gemini character speech uses this direction together with the configured server voice. Selecting a local engine does not invent a substitute voice; use Gemini for a prompt-defined voice. Prompts guide delivery rather than guaranteeing an exact voice clone. The character's reply text and voice direction are sent only when server speech is selected and playback is requested.

## Validation, limits and recovery

| Item              | Limit / behavior                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| Manifest          | One `character.json`, at most 256 KB, schemaVersion 1                                                       |
| Referenced assets | 1–256; total compressed file size at most 128 MB                                                            |
| Images            | PNG/WebP/JPEG; at most 32 MB each; at most 8192 px per side; 32 million decoded pixels across the pack      |
| VRM               | At most 50 MB; self-contained resources; invalid files rejected                                             |
| Voice reference   | WAV, 3–30 seconds, mono/stereo, at most 8 MB                                                                |
| Frames            | At most 2048 named frames; every reference must exist                                                       |
| Poses             | At most 128, with 1–240 timed frames each                                                                   |
| Timing            | 16–10000 ms per frame; at most ten minutes per pose                                                         |
| Depth layers      | At most 16; unique IDs; depth -1 to 1                                                                       |
| Paths             | Relative, case-consistent, no URLs, absolute paths, backslashes, `..` traversal, query strings or fragments |
| Duplicate imports | Create separate slots; no overwrite by name or publisher ID                                                 |
| Import failure    | Validate before saving; transaction failure preserves existing entries                                      |
| Removing a pack   | Removes that entry; selecting it falls back to a bundled character                                          |
| Missing poses     | Fall back to the declared idle pose; no fabricated extra drawings                                           |
| Missing voice     | Silent                                                                                                      |

The importer rejects missing files, bad rectangles, invalid audio and unknown format/version values. Unknown extra metadata is ignored; misspelled required fields fail validation. Imported JSON is data, never executable code. Storage belongs to the current app profile and is not automatically synced to other devices. Keep a copy of your source folder; removing app data removes local imports.

## Test before sharing

1. Import twice and verify two independent entries remain after restart.
2. Preview every declared pose; inspect all cells, transparency and aspect ratios.
3. Test each direction, running and sitting with a consistent foot baseline.
4. Test normal and enlarged sizes, reduced motion, screen edges and the taskbar.
5. Verify only the silhouette takes model clicks; captions and dock remain usable.
6. For VRM, inspect actual face deformation and seated feet rather than head icons alone.
7. Check silent, prompt-defined and reference-only voice states separately.
8. Test a missing image, invalid rectangle and interrupted/failed import; existing characters must survive.
9. Verify authorship and redistribution terms for every model, outfit, image and voice before publishing your pack.
