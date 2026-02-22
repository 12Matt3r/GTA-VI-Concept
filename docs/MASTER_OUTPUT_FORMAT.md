# 🧾 Output Structure & Scene Template

## Required Fields for Each Generated Scene

When generating a scene (e.g., via LLM), ensure the output includes:

- title: Scene name + high-level descriptor.
- narrativeDescription: 200–300 words of vivid, surreal description.
- ticker: A brief WTF moment or subconscious whisper.
- lucidity, coherence, perception: Updated numeric stats (0–100 or clamped).
- imagePrompt: Equirectangular 360° panoramic prompt matching the narrative.
- choices: Four textual options for the player’s next action.
- prologText: Optional short conflict/urgency text (can be empty).

Example JSON schema:

```json
{
  "title": "SCENE TITLE [LOCATION TYPE]",
  "narrativeDescription": "200–300 words of detailed, surreal description...",
  "ticker": "Brief WTF moment or whisper",
  "lucidity": 47,
  "coherence": 23,
  "perception": 75,
  "imagePrompt": "360° panoramic prompt...",
  "choices": [
    {"text": "Choice 1"},
    {"text": "Choice 2"},
    {"text": "Choice 3"},
    {"text": "Choice 4"}
  ],
  "prologText": "Short conflict text or \"\""
}