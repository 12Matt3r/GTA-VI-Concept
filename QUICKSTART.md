👑 CHRØMASHIFT: FINAL QUICK REFERENCE GUIDE
This guide summarizes the core functionality, the narrative structure, and the critical multimodal sequence for the final game build.
1. Project Concept & Goal
 * Game Type: Hyper-Surreal Urban Dream Simulator.
 * Narrative Goal: Successfully navigate a fragmented reality to claim the Chroma Award, which represents the final validation of the dreamer's consciousness.
 * Aesthetic: Hyper-Realism Meets Surrealism; uses high-brightness, 8K photorealistic panoramas.
 * Starting Point: The player wakes up in their Living Room with a glitching CRT Television as the portal.
2. Critical Game Sequence (The 4-Step Loop)
Every player action triggers this fixed, multimodal sequence:
| Phase | Component & Action | Constraint Enforced |
|---|---|---|
| Phase 3 (Start) | CRT/Glitch Transition & Countdown: Music (journey to the interweb.mp3) starts immediately. Screen displays crtv.png and rgb.gif. | Enforces Slowing Countdown (20 to 0) and keeps the visual on-screen for the full TTS duration + buffer. TTS MUST READ NARRATIVE OVER THIS VISUAL. |
| Phase 4 (Image) | New Panoramic Scene Generation: AI generates a new 360° image based on the story. | Image prompt uses tags for equirectangular, hyper-surrealism, 8K quality. |
| Phase 4 (Audio) | TTS Playback: Text-to-Speech (TTS) service reads the new Narrative Description and Goal Segway text. | STRICT RULE: TTS must read ONLY the narrative text and the audio must seamlessly transition from the CRT screen to the new scene. |
| Phase 5 (UX) | Choice Placement: Dynamic placement of the four choices. | CRITICAL: Choices are semi-transparent and dynamically mapped to contextually relevant objects in the 360° environment. |
3. Launch Sequence & Goal Setting
| Element | Action | Purpose |
|---|---|---|
| Prolog Text | "The dream's REALITY COHERENCE is failing rapidly... The anomaly has triggered a 20-SECOND PROTOCOL FAILURE." | IMMEDIATE CONFLICT: Forces player attention during the CRT countdown. |
| Narrative Segway | "The quest for the Chroma Award has commenced... To escape the mundane and pursue the beautiful, you must utilize the only power you retain: the power of non-linear choice." | GOAL SETTING: Establishes the core mission and the mechanic. |
| Minimum Time | Scene must remain stable for a minimum of 20 seconds. | Ensures the player has time to read and absorb the generated scene. |
4. Credits & Core Technology
| Role/Category | Name/Source |
|---|---|
| Concept & Design | 12Matt3r |
| Master Prompt Engineer | Gemini Prompt Engineering Master Toolkit |
| Sound Design/Music | Sofa King Sad Boi |
| Technology | Websim AI, Three.js, WebGL |
| Reasoning Framework | ReAct Logic (Reasoning and Acting) |
| Start Location | Charlotte, North Carolina |