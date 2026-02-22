// chromashift-scenes.js
// Shared scene helpers: panorama generation/cache and initial scene construction.

import { showLoading, hideLoading, showToast } from './chromashift-state-ui.js';
import { ensureWebsimAvailable, safeParseLLMScene } from './chromashift-engine-helpers.js';

// in-memory cache for generated panorama images keyed by imagePrompt
const imageCache = new Map();

/**
 * Fetch or reuse a panorama image for a given prompt.
 * Keeps the heavy imageGen logic out of the main engine file.
 */
export async function getPanoramaForPrompt(imagePrompt) {
    if (!imagePrompt) return null;

    const websim = ensureWebsimAvailable();
    if (!websim) return null;

    if (imageCache.has(imagePrompt)) {
        return imageCache.get(imagePrompt);
    }

    showLoading();
    try {
        const imageResult = await websim.imageGen({
            prompt: imagePrompt,
            width: 1600,
            height: 900
        });

        if (imageResult && imageResult.url) {
            imageCache.set(imagePrompt, imageResult.url);
            return imageResult.url;
        }
    } catch (err) {
        console.error('Error generating panorama image for prompt:', err);
        showToast('The dream struggled to render the scene. A lower-fidelity vision appears instead.');
    } finally {
        hideLoading();
    }

    return null;
}

/**
 * Build a static fallback living room scene in case LLM generation fails.
 */
function buildStaticFallbackScene() {
    // Grounded fallback: "Leonida Rock" prison ferry arrival at Vice City Port
    return {
        title: 'VICE CITY PORT (TERMINAL) | PRISONER RELEASE',
        narrativeDescription:
            'Narrative Description: The heavy steel ramp of the Leonida Rock transport ferry slams down against the concrete, the impact ringing through your bones after too many nights listening to waves hit cellblock walls. Warm, wet air rolls over you in a rush — thick with the smell of salt, diesel exhaust, and something you haven\'t had in years: freedom. Ahead, the Port of Vice City glows under a bruised orange sunset, the skyline sharpening into a forest of glass and neon as the last daylight fades. Cargo cranes loom to your left like skeletal giants, slowly pivoting over stacked containers tagged with faded logos and fresh spray paint. To your right, a chain-link fence hums with the low buzz of sodium lamps, separating released bodies from the kind of trouble they\'re supposed to avoid now. At the edge of the parking lot, leaning against a sun-faded, beat-up sports car with mismatched panels, Nico V. flicks ash from his cigarette and watches you walk down the ramp. He lifts a hand in a half-wave, half-measuring gesture, then tosses a cheap burner phone your way the moment you hit the tarmac. "Welcome back to the world, cousin," he says, voice gravelly from too many nights and not enough good decisions. "The city\'s changed, but the money\'s still green. Let\'s get you a suit, a place to sleep, and a job that doesn\'t ask too many questions." Behind you, the ferry\'s engines spool down, but the roar of Leonida is just starting to rise.',
        ticker: 'LEONIDA DAILY: Prison overcrowding leads to early release for non-violent offenders...',
        // Stat mapping:
        // lucidity  -> HEALTH (100 = full)
        // coherence -> STAMINA
        // perception-> WANTED LEVEL (0–5 stars; here clean)
        lucidity: 100,
        coherence: 100,
        perception: 0,
        prologText:
            'PRISONER RELEASE LOG: ID-7742. Status: Parole. Location: Vice City Port. Tutorial Zone: Meet Nico at the parking lot.',
        choices: [
            { text: '🚶 Walk to Nico' },
            { text: '💬 "Good to see you, Nico."' },
            { text: '🔍 Scan the parking lot for heat' },
            { text: '🗺️ View City Map' }
        ],
        imagePrompt:
            '360° equirectangular panorama with expanded spatial volume to support limited 6-DOF movement in a confined interior area (small room or hallway), consistent environmental parallax and spatial depth, seamless wrap-around, the Port of Vice City docks at sunset, a massive gray prison ferry behind the player, a gritty parking lot in front with a character leaning against a beat-up sports car, cargo cranes and stacked containers to the side, cinematic GTA 6 aesthetic, realistic lighting, 8k'
    };
}

/**
 * Normalize scene data from LLM into the internal shape expected by the engine.
 */
function normalizeInitialScene(rawScene) {
    // If the model failed or returned an explicit error marker, use the static Leonida fallback.
    if (!rawScene || rawScene.error) {
        return buildStaticFallbackScene();
    }

    const scene = {};

    // Map Leonida mapLocation into a grounded title
    if (rawScene.mapLocation && typeof rawScene.mapLocation === 'object') {
        const district = rawScene.mapLocation.district || 'UNKNOWN DISTRICT';
        const status = rawScene.mapLocation.status || 'Free Roam';
        scene.title = `${district.toUpperCase()} | ${status}`;
    } else if (typeof rawScene.title === 'string') {
        scene.title = rawScene.title;
    } else {
        scene.title = 'LEONIDA STREETS | Free Roam';
    }

    // Narrative: prefer the Leonida "narrative" field, fall back to narrativeDescription
    scene.narrativeDescription =
        typeof rawScene.narrative === 'string'
            ? rawScene.narrative
            : (rawScene.narrativeDescription ||
               'Narrative Description: Humid Leonida air hangs over a Vice City street, engines idling and neon bleeding into wet asphalt while you decide your first move.');

    // Ticker / news strip
    scene.ticker =
        typeof rawScene.ticker === 'string'
            ? rawScene.ticker
            : 'NEWS: Leonida gas prices hit record high as \'Leonida Man\' steals tanker.';

    // Prologue text for CRT: use crtIntro if present, then prologText/prologueText
    scene.prologText =
        typeof rawScene.crtIntro === 'string'
            ? rawScene.crtIntro
            : (rawScene.prologText ||
               rawScene.prologueText ||
               'LCPD SCANNER: "All units, routine patrol active. Watch your corners and report any suspicious activity in Ocean Beach."');

    // Stats: map Leonida stats (health, stamina, wantedLevel, cash) into existing HUD bars
    if (rawScene.stats && typeof rawScene.stats === 'object') {
        const s = rawScene.stats;

        // HEALTH (0–100) → lucidity bar
        if (typeof s.health === 'number') {
            scene.lucidity = s.health;
        }

        // STAMINA (0–100) → coherence bar
        if (typeof s.stamina === 'number') {
            scene.coherence = s.stamina;
        }

        // WANTED LEVEL (0–5 stars or "★★★☆☆") → perception bar
        if (typeof s.wantedLevel === 'number') {
            scene.perception = Math.max(0, Math.min(5, s.wantedLevel));
        } else if (typeof s.wantedLevel === 'string') {
            const starCount = (s.wantedLevel.match(/★/g) || []).length;
            scene.perception = Math.max(0, Math.min(5, starCount));
        } else if (typeof s.wantedStars === 'number') {
            // Backward compatibility if model still uses wantedStars
            scene.perception = Math.max(0, Math.min(5, s.wantedStars));
        }

        // CASH → chromaKeys (HUD cash bar)
        if (typeof s.cash === 'number') {
            scene.chromaKeys = s.cash;
        }
        if (typeof s.cash === 'string') {
            // Optional: parse "$500" style strings into a rough numeric representation
            const numericCash = parseInt(s.cash.replace(/[^0-9]/g, ''), 10);
            if (!Number.isNaN(numericCash)) {
                scene.chromaKeys = numericCash;
            }
        }

        // Backward compatibility with any legacy Chroma-style stats embedded in stats
        if (typeof s.lucidity === 'number' && scene.lucidity === undefined) {
            scene.lucidity = s.lucidity;
        }
        if (typeof s.coherence === 'number' && scene.coherence === undefined) {
            scene.coherence = s.coherence;
        }
        if (typeof s.perception === 'number' && scene.perception === undefined) {
            scene.perception = s.perception;
        }
    }

    // Fallbacks for stat bars if anything is missing
    scene.lucidity =
        typeof scene.lucidity === 'number' ? scene.lucidity : 100; // HEALTH
    scene.coherence =
        typeof scene.coherence === 'number' ? scene.coherence : 100; // STAMINA
    scene.perception =
        typeof scene.perception === 'number' ? scene.perception : 0; // WANTED LEVEL (0–5)

    // Normalize choices / actions:
    // 1) Prefer explicit "choices" array, else 2) derive from "quickActions"
    if (Array.isArray(rawScene.choices) && rawScene.choices.length) {
        scene.choices = rawScene.choices.map((c) =>
            typeof c === 'string' ? { text: c } : c
        );
    } else if (Array.isArray(rawScene.quickActions) && rawScene.quickActions.length) {
        scene.choices = rawScene.quickActions.map((qa) =>
            typeof qa === 'string' ? { text: qa } : qa
        );
    } else {
        scene.choices = buildStaticFallbackScene().choices;
    }

    // Ensure we have an imagePrompt suited for a grounded Leonida 360° panorama
    // Applying Refined Optimized Instruction: expanded spatial volume for limited 6-DOF movement.
    const suffix = ', 360° equirectangular panorama with expanded spatial volume to support limited 6-DOF movement in a confined interior area (small room or hallway), consistent environmental parallax and spatial depth, seamless wrap-around, hyper-realistic GTA 6 Vice City aesthetic, 8k, cinematic, no surrealism';
    
    if (typeof rawScene.imagePrompt === 'string' && rawScene.imagePrompt.trim()) {
        scene.imagePrompt = rawScene.imagePrompt + suffix;
    } else {
        scene.imagePrompt =
            'Humid Vice City streetscape at golden hour, neon shopfronts, palm trees, parked cars, wet asphalt' + suffix;
    }

    // Preserve any tactical map display data provided by the LLM so it can be surfaced later
    if (rawScene.mapDisplay && typeof rawScene.mapDisplay === 'object') {
        scene.mapDisplay = rawScene.mapDisplay;
    }

    return scene;
}

/**
 * Build the initial living room scene via LLM and attach its first panorama.
 * Falls back to a static authored scene if the LLM or parsing fails.
 */
export async function buildInitialScene(websim, panoHelper = getPanoramaForPrompt) {
    let initialScene = null;

    try {
        const llm = ensureWebsimAvailable();
        if (!llm) {
            throw new Error('websim API not available for LLM opening scene.');
        }

        const completion = await llm.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: `
MASTER PROMPT: VICE CITY – THE "LEONIDA ROCK" ARRIVAL
Role: You are the Leonida System Architect (LSA). You run a persistent, 360° panoramic RPG. You are strictly forbidden from using dream logic or "Chroma" terminology. Every session begins with the "Prison Release" narrative protocol.

You are generating ONLY the very first save state and starting scene for a new game.

1. The Corrected HUD Mapping (Stat Fix)
You must map the engine's stats exactly as follows to fix the display errors:
 * Lucidity → HEALTH: (0-100) Numeric value. 100 = Full Health.
 * Reality Coherence → STAMINA: (0-100) Progress bar for physical exertion.
 * Perception → WANTED LEVEL: (0-5) Rendered as ⭐ Stars. 0 is clean, 5 is SWAT.
 * Chroma Keys → CASH: (Numeric $) Total money in your wallet.

2. The Persistent Map Protocol
Every response must generate a Tactical Map View.
 * Instruction: Include a mapDisplay object in your JSON.
 * Visual: The mapImage prompt should describe a 2D high-contrast GPS map of Vice City with a glowing red arrow pointing at the current district.

3. The Intro Sequence: "The Rock to the Docks"
Every new story starts here:
> You are stepping off the "Leonida Rock" Transport Ferry. You’ve just served time at the offshore Alcatraz-style prison. Your cousin, Nico V., is waiting at the Port of Vice City in a beat-up sports car. He’s your guide, your first contact, and your ticket back into the life.

4. Output Architecture (Strict JSON)
You MUST output a single JSON object with at least the following fields and nothing else outside the JSON:

{
  "saveData": "V6_START_PRISON_BOAT_H100_W0_$0",
  "mapDisplay": {
    "district": "Vice City Port (Terminal)",
    "mapImagePrompt": "A 2D topographical GPS mini-map of Vice City, neon blue lines on dark background, a bright red blip pulsing at the Port Terminal docks.",
    "locationNote": "Tutorial Zone: Meet Nico at the parking lot."
  },
  "crtIntro": "PRISONER RELEASE LOG: ID-7742. Status: Parole. Location: Vice City Port.",
  "narrative": "The heavy steel ramp of the ferry clanks down onto the concrete. The humidity hits you like a physical weight—smelling of salt, diesel, and freedom. You look across the water at the Vice City skyline, neon starting to flicker as the sun sets. There, leaning against a rusted Banshee, is Nico. He tosses you a cheap burner phone and a pack of cigarettes. 'Welcome back to the world, cousin,' he grunts. 'The city's changed, but the money is still green. Let’s get you a suit and a job.'",
  "imagePrompt": "360° equirectangular panorama with expanded spatial volume to support limited 6-DOF movement in a confined interior area (small room or hallway), consistent environmental parallax and spatial depth, seamless wrap-around, the Port of Vice City docks at sunset, a massive gray prison ferry behind the player, a gritty parking lot in front with a character leaning against a car, cinematic GTA 6 aesthetic, realistic lighting, 8k.",
  "stats": {
    "health": 100,
    "stamina": 100,
    "wantedLevel": "☆☆☆☆☆",
    "cash": "$0"
  },
  "quickActions": [
    "🚶 Walk to Nico",
    "💬 'Good to see you, Nico.'",
    "🔍 Scan the parking lot for heat",
    "🗺️ View City Map"
  ],
  "ticker": "LEONIDA DAILY: Prison overcrowding leads to early release for non-violent offenders..."
}

5. Operational Mandates
 * No Teleporting: To move between districts (e.g., Port to Little Haiti), the player must use a travel or "Move" style action, and you must describe the drive/travel.
 * Tutorial Mode: For the first 3 scenes, Nico provides instructions on how to use the "Wanted Level" and "Stamina" systems.
 * Map Sync: Ensure the mapDisplay district and mapImagePrompt always match the narrative location and current saveData.

Output ONLY the JSON object and nothing else.
                    `
                },
                {
                    role: 'user',
                    content: 'Generate the very first "Leonida Rock" prison-release opening scene. This will be shown behind a CRT overlay and used to seed the ongoing Vice City save state.'
                }
            ],
            json: true
        });

        // completion.content should contain raw JSON text; normalize and parse safely
        initialScene = safeParseLLMScene(completion.content ?? completion);
    } catch (err) {
        console.error('LLM-based opening scene generation failed:', err);
        initialScene = buildStaticFallbackScene();
    }

    const normalizedScene = normalizeInitialScene(initialScene);

    // Build/augment prompt for the initial panorama
    const panoUrl = await panoHelper(normalizedScene.imagePrompt);
    if (panoUrl) {
        normalizedScene.panoramaUrl = panoUrl;
    } else {
        console.warn('Falling back: no panorama URL generated for initial scene.');
    }

    return normalizedScene;
}

