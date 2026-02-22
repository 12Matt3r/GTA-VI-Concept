// --- PHASE 3: Critical Transition Sequence (The Core Loop) ---
async function executeTransitionSequence(sceneData, isInitial = false) {
    if (gameState.isProcessing) return;
    gameState.isProcessing = true;

    const overlay = document.getElementById('crt-overlay');
    const prologTextEl = document.getElementById('prolog-text');

    updateScene(sceneData);
// ... existing code ...
    if (prologTextEl) {
        prologTextEl.innerHTML = `
            <div class="crt-title">${sceneData.title || ''}</div>
            ${sceneData.prologText ? `<div class="crt-prolog">${sceneData.prologText}</div>` : ''}
            <div class="crt-narrative">${sceneData.narrativeDescription || ''}</div>
            ${isInitial ? '<button id="wake-up-button">WAKE UP</button>' : ''}
        `;
    }
// ... existing code ...

export async function playTTS(text) {
    if (!text) return;
    try {
        const result = await websim.textToSpeech({
            text,
            voice: 'en-female'
        });

        const audio = new Audio(result.url);

        let finalResolve;
        const sequencePromise = new Promise((resolve) => {
            finalResolve = resolve;
        });

        let nextStepTimeout = null;

        function stepEffects() {
            // Keep the flash and blink rhythm without showing any countdown UI
            triggerRealityFlash();

            // Use a simple rhythmic blink during narration
            nextStepTimeout = setTimeout(stepEffects, 1500);
        }

        const handleAudioEnd = () => {
            if (nextStepTimeout) clearTimeout(nextStepTimeout);
            setTimeout(() => {
                finalResolve();
            }, 2500);
        };

        audio.onended = handleAudioEnd;
        audio.onerror = handleAudioEnd;

        audio.addEventListener('loadeddata', () => {
            audio.play().catch(() => console.warn('Audio playback prevented by browser.'));
            stepEffects();
        });

        audio.src = result.url;
        audio.load();

        await sequencePromise;
    } catch (error) {
        console.error('TTS execution failed (check API/service):', error);
        await sleep(5000);
    }
}

