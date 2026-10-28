# Mivuneko design system · v0.3
Source palette from the blueprint is implemented in packages/ui/tokens.css: background #0B1020, surface #151B30, elevated #202944, primary #A78BFA, accent #5EEAD4, text #F4F6FF, muted #A8B2CC, danger #FB7185, warning #FBBF24, success #34D399.

Typography: Inter / Segoe UI / Noto Sans / system sans, without downloaded font binaries. Core scale 12/14/16/20/24/32; spacing 4/8/12/16/24/32; radii 8/12/16/24. Lavender primary buttons, elevated secondary controls, selected navigation, visible mint focus outlines, textual status alongside color. Reduced-motion settings respect the OS preference.

Primary surface is a compact transparent pet window with a single pill menu handle and conditional speech bubble. The glassy menu opens inline Chat, pet options, the utility window, pin and sleep actions. The pet has no frame or permanent button row; native window shadow is disabled. Native optional click-through is reversible from menu bar or settings. Browser preview has a dark radial matte so transparent geometry remains legible; this matte is not used in the native window.

Main utility uses a sidebar plus a single-column conversation surface, composer, app picker, activity and settings. At narrow widths navigation compresses and smaller browser screens use horizontal navigation. Native minimum utility window is 800×650. Settings contain reasoning/history, character/movement, Gemini keys/proxy and voice-provider controls, volume, check-in/quiet-hour and accessibility controls. Imported file/voice setup requirements are disclosed.

Approval modal names target and affected data, displays a bundle location when available, defaults focus to Deny and supports Tab/Shift+Tab and Escape. Background is inert during dialogs. App picker requests approval rather than executing from its list. Chat text is rendered as text, not arbitrary HTML. Record has a visible active label; voice is off by default.

Luna and Mooncat are original engineering placeholders. The older generated AURA concept is historical direction, not an accepted pixel-perfect v0.3 design. Production screenshots in docs/screenshots are actual browser renders. Light theme, full localization and screen-reader/hardware QA remain open.

The inline composer is 322px wide with a bounded scrolling transcript, one input, microphone/Stop/Send actions and an inline one-time launch approval. It shares conversation/activity with the utility app. The menu uses lavender icon slots, secondary descriptions, subtle dividers and 19px corners. Emotion markers are original canvas sprites anchored to the humanoid head; anger uses a pink cross-vein mark, sadness a blue drop, surprise an exclamation and celebration a sparkle. No effect requires altering the licensed model.
