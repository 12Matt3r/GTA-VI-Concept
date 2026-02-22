// Core game state and shared UI utilities for ChromaShift.

import { setBubbleAnchors } from './threeScene.js';
// import { startDreamAudio } from './chromashift-audio.js';

// --- Global Game State ---
export const gameState = {
    currentScene: null,
    stats: {
        lucidity: 50,
        coherence: 30,
        perception: 75
    },
    chromaKeys: 0,
    startTime: Date.now(),
    conversationHistory: [],
    journalEntries: [],
    hasStarted: false,
    lastSceneShownAt: null,
    isProcessing: false,
    // Reduced minimum display time so manifest/choices feel more responsive
    minDisplayTimeMs: 10000
};

// --- NEW: Intro click gate setup ---
// Full-screen overlay using Chromashift.gif that must be clicked once;
// the click will also trigger the background music via startDreamAudio().
// export function initIntroClickGate() {
//     const gate = document.getElementById('intro-click-gate');
//     if (!gate) return;

//     const handleClick = () => {
//         // Hide the gate permanently
//         gate.classList.add('hidden');
//         gate.removeEventListener('click', handleClick);

//         // Directly start dream audio from this user gesture
//         startDreamAudio();
//     };

//     gate.addEventListener('click', handleClick);
// }

// --- Utility Helpers ---
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Simple global loading & interaction helpers
let loadingTextInterval = null;
const LOADING_PHRASES = [
    "MANIFESTING DREAM STATE...",
    "COLLAPSING WAVEFORMS...",
    "INJECTING SURREALISM...",
    "RENDERING IMPOSSIBILITIES...",
    "SYNCING CONSCIOUSNESS...",
    "DISSOLVING REALITY...",
    "LOADING CHROMA DATA..."
];

export function showLoading() {
    document.body.classList.add('loading');

    const loader = document.getElementById('global-loading');
    const textEl = document.getElementById('loading-text');

    if (loader) {
        loader.setAttribute('aria-hidden', 'false');
        loader.classList.add('visible');
    }

    if (textEl) {
        let phraseIndex = 0;
        textEl.textContent = LOADING_PHRASES[0];
        
        // Rotate phrases every 2 seconds to keep player engaged
        if (loadingTextInterval) clearInterval(loadingTextInterval);
        loadingTextInterval = setInterval(() => {
            phraseIndex = (phraseIndex + 1) % LOADING_PHRASES.length;
            textEl.textContent = LOADING_PHRASES[phraseIndex];
        }, 2000);
    }
}

export function hideLoading() {
    document.body.classList.remove('loading');

    const loader = document.getElementById('global-loading');
    if (loader) {
        loader.setAttribute('aria-hidden', 'true');
        loader.classList.remove('visible');
    }
    
    if (loadingTextInterval) {
        clearInterval(loadingTextInterval);
        loadingTextInterval = null;
    }
}

export function setInteractionEnabled(enabled) {
    const cmdInput = document.getElementById('command-input');
    const cmdButton = document.getElementById('command-submit');
    const musicControls = document.querySelectorAll('#music-controls button');
    const choiceContainer = document.getElementById('choice-bubbles');

    if (cmdInput) cmdInput.disabled = !enabled;
    if (cmdButton) cmdButton.disabled = !enabled;
    musicControls.forEach((btn) => { btn.disabled = !enabled; });

    if (choiceContainer) {
        choiceContainer.querySelectorAll('.choice-bubble').forEach((bubble) => {
            bubble.style.pointerEvents = enabled ? 'auto' : 'none';
            bubble.style.opacity = enabled ? '' : '0.4';
        });
    }
}

// Lightweight toast helper for quick UX feedback
export function showToast(message, duration = 2000) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('visible');
    // Clear any existing timeout stored on the element
    if (toast._hideTimeout) {
        clearTimeout(toast._hideTimeout);
    }
    toast._hideTimeout = setTimeout(() => {
        toast.classList.remove('visible');
    }, duration);
}

export function showSceneLockFeedback() {
    const container = document.getElementById('choice-bubbles');
    if (!container) return;
    container.querySelectorAll('.choice-bubble').forEach((bubble) => {
        bubble.classList.add('locked-feedback');
        setTimeout(() => bubble.classList.remove('locked-feedback'), 450);
    });
    // New: give the player a clear explanation when the scene is still stabilizing
    // Calculate and surface the remaining stabilization time for better UX feedback.
    const now = Date.now();
    const elapsed = gameState.lastSceneShownAt ? (now - gameState.lastSceneShownAt) : 0;
    const remainingMs = Math.max(0, (gameState.minDisplayTimeMs || 0) - elapsed);
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    if (remainingSeconds > 0) {
        showToast(`Reality is still stabilizing — try again in ~${remainingSeconds}s.`);
    } else {
        showToast('Reality is still stabilizing — wait a moment before manifesting again.');
    }
}

export function updateStats(lucidity, coherence, perception, chromaKeys) {
    // Internal meanings (per Leonida mapping):
    // lucidity   -> HEALTH (0–100)
    // coherence  -> STAMINA (0–100)
    // perception -> WANTED LEVEL (0–5 stars)
    // chromaKeys -> CASH (numeric dollars)
    gameState.stats.lucidity = lucidity;
    gameState.stats.coherence = coherence;
    gameState.stats.perception = perception;
    gameState.chromaKeys = chromaKeys;

    const lucBar = document.getElementById('lucidity-bar');
    const lucVal = document.getElementById('lucidity-value');
    const cohBar = document.getElementById('coherence-bar');
    const cohVal = document.getElementById('coherence-value');
    const perBar = document.getElementById('perception-bar');
    const perVal = document.getElementById('perception-value');

    // HEALTH (0–100)
    const health = Math.max(0, Math.min(100, Number(lucidity) || 0));
    if (lucBar) lucBar.style.width = health + '%';
    if (lucVal) lucVal.textContent = `${health}%`;

    // STAMINA (0–100)
    const stamina = Math.max(0, Math.min(100, Number(coherence) || 0));
    if (cohBar) cohBar.style.width = stamina + '%';
    if (cohVal) cohVal.textContent = `${stamina}%`;

    // WANTED LEVEL (0–5 stars shown as ★/☆ and a 0–100% bar)
    const wantedLevel = Math.max(0, Math.min(5, Number(perception) || 0));
    const wantedPercent = (wantedLevel / 5) * 100;
    if (perBar) perBar.style.width = `${wantedPercent}%`;
    if (perVal) {
        const filled = '★'.repeat(wantedLevel);
        const empty = '☆'.repeat(5 - wantedLevel);
        perVal.textContent = `${filled}${empty}`;
    }

    // CASH ($ numeric) – bar is a soft indicator, capped at 100%
    const cash = Math.max(0, Number(chromaKeys) || 0);
    const chromaBar = document.getElementById('chroma-bar');
    const chromaValue = document.getElementById('chroma-value');
    if (chromaBar && chromaValue) {
        // Simple scaling: $0 = 0%, $10k+ ~= 100%
        const chromaPercent = Math.max(0, Math.min(100, (cash / 10000) * 100));
        chromaBar.style.width = `${chromaPercent}%`;
        chromaValue.textContent = `$${cash.toLocaleString()}`;
    }
}

export function updateDreamTime() {
    const elapsed = Math.floor((Date.now() - gameState.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    const dt = document.getElementById('dream-time');
    if (dt) {
        dt.textContent = `${minutes}:${seconds}`;
    }
}

// start dream-time updater
setInterval(updateDreamTime, 1000);

export function triggerRealityFlash() {
    const flash = document.getElementById('reality-flash');
    if (!flash) return;
    flash.classList.add('flash');
    setTimeout(() => flash.classList.remove('flash'), 100);
}

export function triggerEyeBlink() {
    const eye = document.getElementById('eye-blink');
    if (!eye) return;
    eye.classList.add('blink');
    setTimeout(() => eye.classList.remove('blink'), 600);
}

// Create Choice Bubbles (UI helper, engine provides click handler)
export function createChoiceBubbles(choices, onChoiceClick, hidden = false) {
    const container = document.getElementById('choice-bubbles');
    if (!container) return;

    container.innerHTML = '';

    // NEW: generate new 3D anchors for this set of choices so they are
    // randomly placed around the panorama with minimum separation.
    setBubbleAnchors(choices.length);

    choices.forEach((choice, index) => {
        const bubble = document.createElement('div');
        bubble.className = 'choice-bubble';
        if (hidden) {
            bubble.classList.add('choices-hidden');
        }
        bubble.textContent = choice.text;
        bubble.style.animationDelay = `${index * 0.2}s`;

        if (typeof onChoiceClick === 'function') {
            bubble.addEventListener('click', () => onChoiceClick(choice));
        }

        container.appendChild(bubble);
    });
}

export function revealChoiceBubbles() {
    const container = document.getElementById('choice-bubbles');
    if (!container) return;
    container.querySelectorAll('.choice-bubble').forEach((bubble) => {
        bubble.classList.remove('choices-hidden');
    });
}