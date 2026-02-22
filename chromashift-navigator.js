// Entry point orchestrator for ChromaShift navigation.
// This file delegates to the modular engine, state/UI, and audio logic.

import { initialize } from './chromashift-engine.js';

// Start the experience once the DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initialize();
    });
} else {
    initialize();
}

