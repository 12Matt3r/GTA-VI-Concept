// Shared helper utilities for the ChromaShift engine logic.

import { gameState, showToast } from './chromashift-state-ui.js';

// ---------------------------------------------------------------------
// [FIX A]: ROBUST JSON PARSING HELPER
// This function handles the model returning an object, a pure JSON string,
// or a JSON string wrapped in extraneous text, preventing runtime SyntaxErrors.
export function safeParseLLMScene(content) {
    // If the content is already a parsed object, return it.
    if (typeof content === 'object' && content !== null) {
        // If it's an array (some LLMs return [scene]), use the first element.
        if (Array.isArray(content)) {
            return content[0] ?? {
                error: true,
                title: "REALITY GLITCH [EMPTY ARRAY]",
                narrativeDescription: "The dream responded with an empty vision. Try another action.",
                ticker: "NO SCENE DATA",
                lucidity: 0,
                coherence: 0,
                perception: 0,
                imagePrompt: "empty void, static noise, error scene",
                choices: [
                    { "text": "Restart the dream" },
                    { "text": "Wait it out" },
                    { "text": "Ignore the glitch" },
                    { "text": "Scream into the static" }
                ],
                prologText: ""
            };
        }
        return content;
    }

    if (typeof content === 'string') {
        // 1) First, try a direct JSON.parse — this covers most well-behaved cases.
        try {
            const direct = JSON.parse(content);
            if (Array.isArray(direct)) {
                // If we got an array, assume the first element is the scene object.
                return direct[0] ?? {
                    error: true,
                    title: "REALITY GLITCH [EMPTY ARRAY]",
                    narrativeDescription: "The dream responded with an empty vision. Try another action.",
                    ticker: "NO SCENE DATA",
                    lucidity: 0,
                    coherence: 0,
                    perception: 0,
                    imagePrompt: "empty void, static noise, error scene",
                    choices: [
                        { "text": "Restart the dream" },
                        { "text": "Wait it out" },
                        { "text": "Ignore the glitch" },
                        { "text": "Scream into the static" }
                    ],
                    prologText: ""
                };
            }
            return direct;
        } catch (e) {
            // 2) If that fails, attempt to extract the first JSON object from the string.
            // This avoids hard failures when the model wraps JSON in additional text.
            const match = content.match(/(\{[\s\S]*\})/);
            if (match) {
                try {
                    return JSON.parse(match[0]);
                } catch (e2) {
                    // Swallow low-level SyntaxErrors to avoid noisy console logs,
                    // and fall back to a safe error scene instead.
                }
            }
            // If we reach here, we couldn't find parseable JSON at all.
        }
    }

    // Return a default error object on catastrophic failure
    return { 
        error: true, 
        title: "REALITY GLITCH [ERROR]",
        narrativeDescription: "Dream logic failed due to a critical parsing error. The reality is unstable. Try a simpler action.",
        ticker: "SYSTEM CORRUPTION DETECTED",
        lucidity: 0,
        coherence: 0,
        perception: 0,
        imagePrompt: "Error scene, critical failure, static corruption, red and black, hyper-surrealism",
        choices: [
            { "text": "Restart the dream" },
            { "text": "Wait it out" },
            { "text": "Ignore the glitch" },
            { "text": "Scream into the static" }
        ],
        prologText: ""
    };
}
// ---------------------------------------------------------------------
// NEW: small helpers for cleaner, safer engine code
export function clampStat(value, min = 0, max = 100) {
    const num = Number.isFinite(value) ? value : 0;
    return Math.min(max, Math.max(min, num));
}

export function pushToConversation(role, content) {
    // Ensure we only store primitive message shapes and keep length bounded
    if (!gameState || !gameState.conversationHistory) return;
    gameState.conversationHistory.push({ role, content });
    if (gameState.conversationHistory.length > 20) {
        gameState.conversationHistory = gameState.conversationHistory.slice(-20);
    }
}

export function ensureWebsimAvailable() {
    if (typeof window === 'undefined' || typeof window.websim === 'undefined') {
        console.error('websim API is not available. The dream engine cannot manifest scenes.');
        if (typeof showToast === 'function') {
            showToast('The dream engine is offline. Refresh or try again later.');
        }
        return null;
    }
    return window.websim;
}