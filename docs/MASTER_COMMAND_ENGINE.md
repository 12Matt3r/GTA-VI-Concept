# 🧾 Command Processing & Interpretation Engine

## Command Pipeline

Conceptual steps:

1. Receive text input (location or action).
2. Validate (non-empty, within length limits).
3. Analyze (extract verbs, nouns, modifiers).
4. Classify (location shift vs. action; subtypes like touch, consume, speak, abstract).
5. Interpret (apply surrealist logic informed by dreamState and context).
6. Generate (scene description, stats changes, WTF moment, choices).
7. Update dreamState.
8. Render new scene and await input.

## Supported Command Types (Examples)

- Location shifts:
  - “Underwater cathedral”, “my childhood bedroom”, “the edge of the universe”.
- Simple actions:
  - “Touch the wall”, “eat the clock”, “whisper to the shadows”.
- Complex/chained:
  - “Run to the door; open it slowly”.
- Dialogue:
  - “Ask the businessman about the storm”.
- Environment manipulation:
  - “Make the ceiling melt”.
- Object creation:
  - “Create a ladder made of light”.
- Self-transformation:
  - “I become weightless”.
- Meta/abstract:
  - “Manifest justice”, “distill my fear into an object”.

## Power Words & Special Triggers

Define a small set of special tokens (e.g., RECURSION, VOID, WAKE, MIRROR, TRUTH, SYNESTHESIA):

- When detected, apply large systemic changes (tier shifts, recursion loops, void spaces, etc.).
- Use sparingly to keep them feeling significant.

## Failure & Glitch Handling

If a command cannot be sensibly realized even in dream logic:

- Respond with a glitch: visual distortion, repeated line, or “reality cannot parse that request.”
- Avoid hard failure; always give the player something to react to.

