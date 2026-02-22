// chromashift-engine.js

// ---------------------------------------------------------------------
// Helper utilities have been extracted into chromashift-engine-helpers.js
// to keep this file focused on high-level engine orchestration.
// ---------------------------------------------------------------------

import { initThreeJS, updatePanorama } from './threeScene.js';
import {
    gameState,
    showLoading,
    hideLoading,
    setInteractionEnabled,
    showSceneLockFeedback,
    updateStats,
    createChoiceBubbles,
    revealChoiceBubbles,
    showToast
} from './chromashift-state-ui.js';
import { startNarrator, initMusicPlayer, startDreamAudio } from './chromashift-audio.js';
import {
    safeParseLLMScene,
    clampStat,
    pushToConversation,
    ensureWebsimAvailable
} from './chromashift-engine-helpers.js';
import {
    getPanoramaForPrompt,
    buildInitialScene
} from './chromashift-scenes.js';

 // NEW: track the initial CRT power button stages (off → on → UI)
let initialPowerStage = 0;
// NEW: track whether we've already told the player to use the power button
let overlayDismissHintShown = false;

const LOCAL_SAVE_KEY = 'leonida_save_v1';

// NEW: Save the current game state into localStorage
function saveGameToLocalStorage(silent = false) {
    try {
        const entries = Array.isArray(gameState.journalEntries) ? gameState.journalEntries : [];
        // Safety cap to prevent LocalStorage quota limits
        const safeEntries = entries.slice(-50); 

        const savePayload = {
            currentScene: gameState.currentScene,
            stats: gameState.stats,
            chromaKeys: gameState.chromaKeys,
            startTime: gameState.startTime,
            conversationHistory: gameState.conversationHistory,
            journalEntries: safeEntries
        };
        const json = JSON.stringify(savePayload);
        window.localStorage.setItem(LOCAL_SAVE_KEY, json);
        
        if (!silent) {
            showToast('Game saved to this browser.');
        } else {
            console.log('Game state auto-saved.');
        }
    } catch (err) {
        console.error('Failed to save game to localStorage:', err);
        if (!silent) showToast('Could not save game. Storage might be full.');
    }
}

// Load game state from a parsed save object
function loadGameFromObject(saveObj) {
    if (!saveObj || typeof saveObj !== 'object') {
        showToast('Save file could not be read.');
        return;
    }

    const scene = saveObj.currentScene;
    if (!scene || !scene.choices) {
        showToast('Save file is missing scene data.');
        return;
    }

    // Restore core state
    gameState.currentScene = scene;
    if (saveObj.stats) {
        gameState.stats = saveObj.stats;
    }
    if (typeof saveObj.chromaKeys === 'number') {
        gameState.chromaKeys = saveObj.chromaKeys;
    }
    if (Array.isArray(saveObj.conversationHistory)) {
        gameState.conversationHistory = saveObj.conversationHistory;
    }
    if (Array.isArray(saveObj.journalEntries)) {
        gameState.journalEntries = saveObj.journalEntries;
    }

    // Reflect the loaded scene in the UI and panorama
    updateScene(scene);
    createChoiceBubbles(scene.choices, handleChoiceClick, false);
    revealChoiceBubbles();
    gameState.hasStarted = true;
    gameState.lastSceneShownAt = Date.now();
    
    // Ensure processing lock is cleared
    gameState.isProcessing = false;
    setInteractionEnabled(true);

    showToast('Save game loaded.');
}

// NEW: Load game state from localStorage key
function loadGameFromLocalStorage() {
    try {
        const raw = window.localStorage.getItem(LOCAL_SAVE_KEY);
        if (!raw) {
            showToast('No save data found in this browser.');
            return;
        }
        const parsed = JSON.parse(raw);
        loadGameFromObject(parsed);
    } catch (err) {
        console.error('Failed to load game from localStorage:', err);
        showToast('Save data was corrupted or unreadable.');
    }
}

// NEW: Start a fresh game (clear save + reload)
function startNewGame() {
    try {
        window.localStorage.removeItem(LOCAL_SAVE_KEY);
    } catch (e) {
        console.warn('Could not clear local save key:', e);
    }
    window.location.reload();
}

// Update Scene UI (now only core scene data; choices managed around transitions)
function updateScene(sceneData) {
    const titleEl = document.getElementById('scene-title');
    const tickerEl = document.getElementById('wtf-ticker');

    const safeTitle = sceneData.title || 'UNLABELED ANOMALY [UNKNOWN SPACE]';
    const safeTicker = sceneData.ticker || 'SUBCONSCIOUS STATIC: NO CLEAR SIGNAL';

    if (titleEl) titleEl.textContent = safeTitle;
    if (tickerEl) tickerEl.textContent = safeTicker;

    const nextLucidity = clampStat(
        sceneData.lucidity ?? gameState.stats.lucidity
    );
    const nextCoherence = clampStat(
        sceneData.coherence ?? gameState.stats.coherence
    );
    const nextPerception = clampStat(
        sceneData.perception ?? gameState.stats.perception
    );
    const nextChromaKeys =
        typeof sceneData.chromaKeys === 'number'
            ? sceneData.chromaKeys
            : gameState.chromaKeys;

    updateStats(nextLucidity, nextCoherence, nextPerception, nextChromaKeys);

    updatePanorama(sceneData.panoramaUrl); 

    gameState.currentScene = sceneData;
}

// --- PHASE 3: Critical Transition Sequence (The Core Loop) ---
async function executeTransitionSequence(sceneData, isInitial = false) {
    // REMOVE PER-SCENE LOCK HERE; NOW MANAGED CENTRALLY IN processPlayerAction
    // if (gameState.isProcessing) return;
    // gameState.isProcessing = true;

    const overlay = document.getElementById('crt-overlay');
    const prologTextEl = document.getElementById('prolog-text');
    const screenOffEl = document.getElementById('crt-screen-off');
    const glitchEl = document.getElementById('glitch-effect');
    const introVideoEl = document.getElementById('crt-intro-video');
    const loadingTextEl = document.getElementById('crt-loading-text');

    updateScene(sceneData);

    createChoiceBubbles(sceneData.choices, handleChoiceClick, true);

    if (overlay) {
        overlay.classList.add('active');
    }

    const prologContent = `
            <div class="crt-title">${sceneData.title || ''}</div>
            ${sceneData.prologText ? `<div class="crt-prolog">${sceneData.prologText}</div>` : ''}
            <div class="crt-narrative">${sceneData.narrativeDescription || ''}</div>
        `;

    if (prologTextEl) {
        if (!isInitial) {
            // For non-initial screens, we may augment this content below.
            prologTextEl.innerHTML = prologContent;
        } else {
            prologTextEl.innerHTML = '';
        }
    }

    if (isInitial) {
        const powerBtn = document.getElementById('crt-power-button');
        const skipBtn = document.getElementById('crt-skip-intro');

        // Ensure glitch and blackout cover are hidden while the intro video runs
        if (glitchEl) {
            glitchEl.style.display = 'none';
        }
        if (screenOffEl) {
            screenOffEl.style.display = 'none';
        }

        // Handle the intro guitar video on the CRT before the first scene text appears
        let introDone = !introVideoEl;
        const finishIntro = () => {
            if (introDone) return;
            introDone = true;

            if (introVideoEl) {
                introVideoEl.pause();
                introVideoEl.currentTime = 0;
                introVideoEl.style.display = 'none';
            }

            // Hide the skip button once the intro has been cleared
            if (skipBtn) {
                skipBtn.style.display = 'none';
            }

            // After the video, bring in the CRT glitch and first prologue/narrative text
            if (glitchEl) {
                glitchEl.style.display = 'block';
            }
            if (screenOffEl) {
                screenOffEl.style.display = 'none';
            }
            if (prologTextEl) {
                prologTextEl.innerHTML = prologContent;
            }
        };

        if (introVideoEl) {
            // Make sure the intro video is visible and configured for audio playback
            introVideoEl.style.display = 'block';
            introVideoEl.currentTime = 0;
            introVideoEl.muted = false;
            introVideoEl.volume = 1.0;

            introVideoEl.play().catch((e) => {
                console.warn('Intro video playback was blocked, skipping to prologue:', e);
                finishIntro();
            });

            introVideoEl.onended = () => {
                finishIntro();
            };
            introVideoEl.onerror = () => {
                console.warn('Intro video failed to load, skipping to prologue.');
                finishIntro();
            };
        }

        // Allow the player to skip the intro video at any time
        if (skipBtn) {
            skipBtn.disabled = false;
            skipBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                finishIntro();
            });
        }

        if (powerBtn) {
            initialPowerStage = 0;

            powerBtn.addEventListener('click', async (event) => {
                event.stopPropagation();

                // If the player presses the power button before the intro has actually played with audio,
                // use this user gesture to start the video (so browsers allow sound), and wait for it to end.
                if (!introDone && introVideoEl) {
                    try {
                        const playPromise = introVideoEl.play();
                        if (playPromise && typeof playPromise.then === 'function') {
                            await playPromise;
                        }
                        // Let the video play; finishIntro() will run on onended.
                        return;
                    } catch (e) {
                        console.warn('Intro video could not start on power click, skipping to prologue:', e);
                        finishIntro();
                        return;
                    }
                }

                if (initialPowerStage === 0) {
                    initialPowerStage = 1;
                    powerBtn.disabled = true;

                    try {
                        startDreamAudio();
                    } catch (e) {
                        console.warn('Failed to start music on power click:', e);
                    }

                    if (screenOffEl) {
                        screenOffEl.style.display = 'none';
                    }
                    if (glitchEl) {
                        glitchEl.style.display = 'block';
                    }
                    if (prologTextEl && !prologTextEl.innerHTML.trim()) {
                        prologTextEl.innerHTML = prologContent;
                    }

                    await startNarrator(sceneData.narrativeDescription || '');

                    powerBtn.disabled = false;
                    initialPowerStage = 1;
                    return;
                }

                if (initialPowerStage === 1) {
                    initialPowerStage = 2;
                    powerBtn.disabled = true;

                    if (overlay) {
                        overlay.classList.remove('active');
                    }
                    revealChoiceBubbles();
                    setInteractionEnabled(true);

                    gameState.lastSceneShownAt = Date.now();
                    // gameState.isProcessing is now reset in processPlayerAction.finally
                }
            });
        }

        return;
    }

    // NON-INITIAL SEQUENCE:
    // From the second narrative screen onward, the overlay will stay
    // visible until the player presses the power button again.
    const powerBtn = document.getElementById('crt-power-button');

    if (prologTextEl) {
        let augmentedContent = prologContent;
        if (!overlayDismissHintShown) {
            overlayDismissHintShown = true;
            augmentedContent += `
                <div class="crt-prolog" style="margin-top:12px; color: var(--dream-gold);">
                    The narrative stream will not clear itself. When you are ready to return to the Chroma-Dream, press the power button again.
                </div>
            `;
        }
        prologTextEl.innerHTML = augmentedContent;
    }

    let waitingForDismiss = true;
    const onPowerClickToDismiss = (event) => {
        if (!waitingForDismiss) return;
        waitingForDismiss = false;
        if (event) {
            event.stopPropagation();
        }

        if (overlay) {
            overlay.classList.remove('active');
        }
        revealChoiceBubbles();
        gameState.lastSceneShownAt = Date.now();
        // gameState.isProcessing is now reset in processPlayerAction.finally

        if (powerBtn) {
            powerBtn.removeEventListener('click', onPowerClickToDismiss);
        }
    };

    if (powerBtn) {
        powerBtn.addEventListener('click', onPowerClickToDismiss);
    }

    await startNarrator(sceneData.narrativeDescription || '');

    // IMPORTANT: Do NOT auto-dismiss the overlay here.
    // The overlay will remain until the player presses the power button.
}

// Handle Choice Click
async function handleChoiceClick(choice) {
    await processPlayerAction(choice.text);
}

// Process Player Action (Choice or Command)
export async function processPlayerAction(action, options = {}) {
    const now = Date.now();
    const { bypassMinDisplayGate = false } = options;

    // UPDATED: Remove hard locking so manifests and choices can always trigger new scenes.
    // Previously:
    // if (gameState.isProcessing && !bypassMinDisplayGate) {
    //     showSceneLockFeedback();
    //     return;
    // }
    //
    // if (
    //     !bypassMinDisplayGate &&
    //     (!gameState.lastSceneShownAt ||
    //         (now - gameState.lastSceneShownAt) < gameState.minDisplayTimeMs)
    // ) {
    //     showSceneLockFeedback();
    //     return;
    // }

    const websim = ensureWebsimAvailable();
    if (!websim) {
        return;
    }

    showLoading();
    setInteractionEnabled(false);
    // NEW: centralize the processing lock here so it always gets cleared
    gameState.isProcessing = true;

    try {
        pushToConversation('user', action);

        const completion = await websim.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: `
MASTER PROMPT: VICE CITY – THE "LEONIDA ROCK" ARRIVAL
Role: You are the Leonida System Architect (LSA). You run a persistent, 360° panoramic RPG. You are strictly forbidden from using dream logic or "Chroma" terminology. Every session begins with the "Prison Release" narrative protocol.

Player COMMAND (Intent): "${action}"

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
Always respond with a single JSON object. For reference, here is the expected structure (adapt it to the current save state and location when the player acts):

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
                ...gameState.conversationHistory.slice(-6)
            ]
        });

        let nextScene;
        try {
            nextScene = safeParseLLMScene(completion.content ?? completion); 

            // NORMALIZE Vice City 360 JSON into the internal scene shape
            if (nextScene && !nextScene.error) {
                // Map new Leonida stats object to top-level numeric fields (Chroma HUD remap)
                if (nextScene.stats && typeof nextScene.stats === 'object') {
                    const s = nextScene.stats;

                    // HEALTH (0–100) → lucidity bar
                    if (typeof s.health === 'number') {
                        nextScene.lucidity = s.health;
                    }

                    // STAMINA (0–100) → coherence bar
                    if (typeof s.stamina === 'number') {
                        nextScene.coherence = s.stamina;
                    }

                    // WANTED LEVEL (0–5 stars or "★★☆☆☆") → perception bar
                    if (typeof s.wantedLevel === 'number') {
                        nextScene.perception = Math.max(0, Math.min(5, s.wantedLevel));
                    } else if (typeof s.wantedLevel === 'string') {
                        const starCount = (s.wantedLevel.match(/★/g) || []).length;
                        nextScene.perception = Math.max(0, Math.min(5, starCount));
                    } else if (typeof s.wantedStars === 'number') {
                        // Backward compatibility if model still uses wantedStars
                        nextScene.perception = Math.max(0, Math.min(5, s.wantedStars));
                    }

                    // CASH is kept on stats but also mirrored to chromaKeys for the HUD cash bar
                    if (typeof s.cash === 'number') {
                        nextScene.chromaKeys = s.cash;
                    } else if (typeof s.cash === 'string') {
                        const numericCash = parseInt(s.cash.replace(/[^0-9]/g, ''), 10);
                        if (!Number.isNaN(numericCash)) {
                            nextScene.chromaKeys = numericCash;
                        }
                    }
                }

                // Map any pre-existing "Chroma-style" stats if present (backward compatibility)
                if (nextScene.stats && typeof nextScene.stats === 'object') {
                    const s = nextScene.stats;
                    if (typeof s.lucidity === 'number' && nextScene.lucidity === undefined) {
                        nextScene.lucidity = s.lucidity;
                    }
                    if (typeof s.coherence === 'number' && nextScene.coherence === undefined) {
                        nextScene.coherence = s.coherence;
                    }
                    if (typeof s.perception === 'number' && nextScene.perception === undefined) {
                        nextScene.perception = s.perception;
                    }
                }

                // Map prologueText / crtIntro → prologText used by the CRT layer
                if (!nextScene.prologText && typeof nextScene.prologueText === 'string') {
                    nextScene.prologText = nextScene.prologueText;
                }
                if (!nextScene.prologText && typeof nextScene.crtIntro === 'string') {
                    nextScene.prologText = nextScene.crtIntro;
                }

                // Convert plain-string choices into { text } objects for the UI layer
                if (Array.isArray(nextScene.choices) && nextScene.choices.length) {
                    nextScene.choices = nextScene.choices.map((c) =>
                        typeof c === 'string' ? { text: c } : c
                    );
                }

                // If no choices field but Leonida-style quickActions exist, map them into choices
                if ((!nextScene.choices || !nextScene.choices.length) && Array.isArray(nextScene.quickActions)) {
                    nextScene.choices = nextScene.quickActions.map((qa) =>
                        typeof qa === 'string' ? { text: qa } : qa
                    );
                }

                // Normalize Leonida mapLocation/header + narrative fields into internal scene shape
                if (nextScene.mapLocation && typeof nextScene.mapLocation === 'object') {
                    const district = nextScene.mapLocation.district || 'UNKNOWN DISTRICT';
                    const status = nextScene.mapLocation.status || 'No current intel.';
                    nextScene.title = nextScene.title || `${district} | ${status}`;
                } else if (nextScene.header && typeof nextScene.header === 'object') {
                    const loc = nextScene.header.location || 'UNKNOWN DISTRICT';
                    const mission = nextScene.header.currentMission || 'Free Roam';
                    nextScene.title = nextScene.title || `${loc} | ${mission}`;
                }

                if (!nextScene.narrativeDescription && typeof nextScene.narrative === 'string') {
                    nextScene.narrativeDescription = nextScene.narrative;
                }
            }

            if (nextScene.error) {
                throw new Error(nextScene.narrativeDescription);
            }
        } catch (parseError) {
            console.error('Failed to process scene JSON from LLM (falling back to glitch scene).');
            showToast('Reality coherence failure: the dream glitched. Try that action again.');
            // Previously we returned here, which skipped the finally{} block and left
            // the input/buttons disabled; instead, rethrow so the outer catch runs
            // and the finally{} block restores interactivity.
            throw parseError;
        }

        pushToConversation(
            'assistant',
            typeof nextScene === 'string' ? nextScene : JSON.stringify(nextScene)
        );

        if (!nextScene.imagePrompt) {
            console.warn('Next scene did not include an imagePrompt; using a generic grounded Leonida fallback.');
            nextScene.imagePrompt = 'Humid Florida streetscape in Vice City at golden hour, neon shopfronts, palm trees, parked cars, wet asphalt';
        }

        // Apply the Refined Optimized Instruction for spatial depth and locomotion
        if (nextScene.imagePrompt && !nextScene.imagePrompt.includes('360° equirectangular')) {
             nextScene.imagePrompt += ', 360° equirectangular panorama with expanded spatial volume to support limited 6-DOF movement in a confined interior area (small room or hallway), consistent environmental parallax and spatial depth, seamless wrap-around, hyper-realistic GTA 6 Vice City aesthetic, 8k, cinematic';
        }

        // UPDATED: use cached or newly generated panorama image for this prompt
        let panoUrl = await getPanoramaForPrompt(nextScene.imagePrompt);
        if (!panoUrl) {
            showToast('The vision failed to fully manifest, but the dream continues.');
            // Fallback to a static glitch image if generation fails so the journal has something
            panoUrl = '/IMG_9642.png'; // crt_static_intrusion
        }
        nextScene.panoramaUrl = panoUrl || '';

        // Journal: record this step in the player's journey *after* the panorama URL is known
        try {
            if (!Array.isArray(gameState.journalEntries)) {
                gameState.journalEntries = [];
            }
            gameState.journalEntries.push({
                sceneTitle: nextScene.title || '',
                action,
                narrative: nextScene.narrativeDescription || nextScene.narrative || '',
                imageUrl: nextScene.panoramaUrl || '',
                timestamp: Date.now()
            });
            // Auto-save the game state after a successful turn to prevent journal data loss
            saveGameToLocalStorage(true);
        } catch (e) {
            console.warn('Could not append to journal:', e);
        }

        await executeTransitionSequence(nextScene);
    } catch (error) {
        console.error('Error processing action:', error);
        showToast('Reality coherence failure. The dream couldn’t process that — try again.');
    } finally {
        hideLoading();
        setInteractionEnabled(true);
        // ALWAYS clear processing lock so you can manifest again
        gameState.isProcessing = false;
    }
}

// --- Initialization ---
export async function initialize() {
    initThreeJS();
    initMusicPlayer();

    const cmdInput = document.getElementById('command-input');
    const cmdButton = document.getElementById('command-submit');

    function showInputError() {
        if (!cmdInput) return;
        const originalPlaceholder = cmdInput.getAttribute('placeholder') || '';
        cmdInput.classList.add('input-error');
        cmdInput.placeholder = 'THE DREAM NEEDS A COMMAND...';
        setTimeout(() => {
            cmdInput.classList.remove('input-error');
            cmdInput.placeholder = originalPlaceholder || 'TYPE YOUR IMPOSSIBLE ACTION...';
        }, 1200);
    }

    if (cmdButton) {
        cmdButton.addEventListener('click', () => {
            const value = cmdInput ? cmdInput.value.trim() : '';
            if (!value) {
                showInputError();
                return;
            }
            // EXPLICITLY FLAG MANIFEST AS BYPASSING THE MIN DISPLAY GATE
            processPlayerAction(value, { bypassMinDisplayGate: true });
            if (cmdInput) cmdInput.value = '';
        });
    }
    if (cmdInput) {
        cmdInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const value = cmdInput.value.trim();
                if (!value) {
                    showInputError();
                    return;
                }
                // EXPLICITLY FLAG MANIFEST AS BYPASSING THE MIN DISPLAY GATE
                processPlayerAction(value, { bypassMinDisplayGate: true });
                cmdInput.value = '';
            }
        });
    }

    const creditsButton = document.getElementById('credits-button');
    const creditsModal = document.getElementById('credits-modal');
    const creditsBackdrop = document.getElementById('credits-backdrop');
    const creditsClose = document.getElementById('credits-close');
    const saveGameButton = document.getElementById('save-game-button');
    const loadGameButton = document.getElementById('load-game-button');
    const newGameButton = document.getElementById('new-game-button');
    const creditsPagesContainer = document.getElementById('credits-pages');
    const creditsPrev = document.getElementById('credits-prev');
    const creditsNext = document.getElementById('credits-next');
    const creditsPageIndicator = document.getElementById('credits-page-indicator');

    const journalButton = document.getElementById('journal-button');
    const journalModal = document.getElementById('journal-modal');
    const journalBackdrop = document.getElementById('journal-backdrop');
    const journalClose = document.getElementById('journal-close');
    const journalEntriesContainer = document.getElementById('journal-entries-container');

    // Initialize credits UI in separate module
    import('./chromashift-credits.js')
        .then(({ initCreditsUI }) => {
            initCreditsUI({
                creditsButton,
                creditsModal,
                creditsBackdrop,
                creditsClose,
                creditsPagesContainer,
                creditsPrev,
                creditsNext,
                creditsPageIndicator
            });
        })
        .catch((err) => {
            console.error('Failed to initialize credits UI:', err);
        });

    // --- Game Description Modal wiring ---
    const descModal = document.getElementById('game-description-modal');
    const descBackdrop = document.getElementById('game-description-backdrop');
    const descClose = document.getElementById('game-description-close');
    const descCopy = document.getElementById('game-description-copy');
    const descTextarea = document.getElementById('game-description-textarea');

    function openDescriptionModal() {
        if (!descModal) return;
        descModal.classList.add('open');
        descModal.setAttribute('aria-hidden', 'false');
    }

    function closeDescriptionModal() {
        if (!descModal) return;
        descModal.classList.remove('open');
        descModal.setAttribute('aria-hidden', 'true');
    }

    if (descBackdrop) {
        descBackdrop.addEventListener('click', closeDescriptionModal);
    }
    if (descClose) {
        descClose.addEventListener('click', closeDescriptionModal);
    }

    if (descCopy && descTextarea) {
        descCopy.addEventListener('click', async () => {
            const text = descTextarea.value || '';
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(text);
                } else {
                    // Fallback: create a temporary selection
                    descTextarea.focus();
                    descTextarea.select();
                    document.execCommand('copy');
                }
                showToast('Game description copied to clipboard.', 2200);
            } catch (err) {
                console.error('Failed to copy description:', err);
                showToast('Could not copy text automatically — you can select it manually.', 2600);
            }
        });
    }

    // Wire up Save Game button on CRT overlay (exports JSON save file)
    if (saveGameButton) {
        saveGameButton.addEventListener('click', (e) => {
            e.stopPropagation();
            saveGameToLocalStorage();
        });
    }

    if (loadGameButton) {
        loadGameButton.addEventListener('click', (e) => {
            e.stopPropagation();
            loadGameFromLocalStorage();
        });
    }

    if (newGameButton) {
        newGameButton.addEventListener('click', (e) => {
            e.stopPropagation();
            startNewGame();
        });
    }

    // Description modal is now only opened manually via UI (no auto-open on start)

    // --- Player Journal wiring ---
    function renderJournalEntries() {
        if (!journalEntriesContainer) return;
        journalEntriesContainer.innerHTML = '';

        const entries = Array.isArray(gameState.journalEntries)
            ? [...gameState.journalEntries]
            : [];

        // Show most recent first
        entries.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        if (!entries.length) {
            const empty = document.createElement('p');
            empty.textContent = 'No entries yet. Make a choice or manifest a command to start your journey.';
            empty.style.fontSize = '12px';
            empty.style.textAlign = 'center';
            empty.style.opacity = '0.8';
            journalEntriesContainer.appendChild(empty);
            return;
        }

        entries.forEach((entry, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'journal-entry';

            const headerRow = document.createElement('div');
            headerRow.style.display = 'flex';
            headerRow.style.justifyContent = 'space-between';
            headerRow.style.marginBottom = '6px';

            const title = document.createElement('h3');
            title.style.margin = '0';
            const indexLabel = entries.length - index;
            title.textContent = `#${indexLabel} — ${entry.sceneTitle || 'Untitled Scene'}`;
            
            const time = document.createElement('span');
            time.style.fontSize = '10px';
            time.style.opacity = '0.6';
            if (entry.timestamp) {
                time.textContent = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }

            headerRow.appendChild(title);
            headerRow.appendChild(time);
            wrapper.appendChild(headerRow);

            if (entry.action) {
                const action = document.createElement('div');
                action.className = 'journal-action';
                action.textContent = `>>> ${entry.action}`;
                wrapper.appendChild(action);
            }

            if (entry.narrative) {
                const narrative = document.createElement('div');
                narrative.className = 'journal-narrative';
                narrative.textContent = entry.narrative;
                wrapper.appendChild(narrative);
            }

            if (entry.imageUrl) {
                const img = document.createElement('img');
                img.src = entry.imageUrl;
                img.alt = entry.sceneTitle || 'Scene panorama';
                // Add error handler in case the image URL has expired or is invalid
                img.onerror = () => {
                    img.style.display = 'none';
                    const errorMsg = document.createElement('div');
                    errorMsg.textContent = '[VISUAL DATA CORRUPTED]';
                    errorMsg.style.fontSize = '10px';
                    errorMsg.style.color = 'var(--reality-red)';
                    errorMsg.style.textAlign = 'center';
                    errorMsg.style.padding = '10px';
                    errorMsg.style.border = '1px dashed var(--reality-red)';
                    wrapper.appendChild(errorMsg);
                };
                wrapper.appendChild(img);
            }

            journalEntriesContainer.appendChild(wrapper);
        });
    }

    function openJournalModal() {
        if (!journalModal) return;
        renderJournalEntries();
        journalModal.classList.add('open');
        journalModal.setAttribute('aria-hidden', 'false');
    }

    function closeJournalModal() {
        if (!journalModal) return;
        journalModal.classList.remove('open');
        journalModal.setAttribute('aria-hidden', 'true');
    }

    if (journalButton) {
        journalButton.addEventListener('click', openJournalModal);
    }

    if (journalBackdrop) {
        journalBackdrop.addEventListener('click', closeJournalModal);
    }

    if (journalClose) {
        journalClose.addEventListener('click', closeJournalModal);
    }

    showLoading();
    setInteractionEnabled(false);
    try {
        const websim = ensureWebsimAvailable();
        if (!websim) {
            throw new Error('websim API not available during initialization.');
        }

        const initialScene = await buildInitialScene(websim, getPanoramaForPrompt);

        // Seed the journal with the opening scene
        try {
            if (!Array.isArray(gameState.journalEntries)) {
                gameState.journalEntries = [];
            }
            // Only seed if empty (prevent duplicates on re-init without reload)
            if (gameState.journalEntries.length === 0) {
                gameState.journalEntries.push({
                    sceneTitle: initialScene.title || 'Opening Scene',
                    action: 'Game Start',
                    narrative: initialScene.narrativeDescription || initialScene.narrative || '',
                    imageUrl: initialScene.panoramaUrl || '/IMG_9642.png',
                    timestamp: Date.now()
                });
            }
        } catch (e) {
            console.warn('Could not seed journal with initial scene:', e);
        }

        await executeTransitionSequence(initialScene, true);
        gameState.hasStarted = true;
    } catch (error) {
        console.error('Error during initial scene setup:', error);
        showToast('The opening vision flickered. The dream will use a simpler backdrop.');
    } finally {
        hideLoading();
    }
}
