// chromashift-credits.js
// Encapsulated multi-page credits UI logic.

export function initCreditsUI({
    creditsButton,
    creditsModal,
    creditsBackdrop,
    creditsClose,
    creditsPagesContainer,
    creditsPrev,
    creditsNext,
    creditsPageIndicator
}) {
    if (!creditsModal || !creditsPagesContainer) {
        // Nothing to wire up if modal shell isn’t present
        return;
    }

    let creditsPages = [];
    let currentCreditsPage = 0;

    function showCreditsPage(index) {
        if (!creditsPages.length) return;
        const maxIndex = creditsPages.length - 1;
        currentCreditsPage = Math.max(0, Math.min(index, maxIndex));

        creditsPages.forEach((pageEl, i) => {
            pageEl.classList.toggle('active', i === currentCreditsPage);
        });

        if (creditsPrev) {
            creditsPrev.disabled = currentCreditsPage === 0;
        }
        if (creditsNext) {
            creditsNext.disabled = currentCreditsPage === maxIndex;
        }
        if (creditsPageIndicator) {
            creditsPageIndicator.textContent = `Page ${currentCreditsPage + 1} / ${maxIndex + 1}`;
        }
    }

    function initCreditsPages() {
        creditsPages = Array.from(creditsPagesContainer.querySelectorAll('.credits-page'));
        if (!creditsPages.length) return;
        currentCreditsPage = 0;
        showCreditsPage(currentCreditsPage);
    }

    if (creditsButton) {
        creditsButton.addEventListener('click', () => {
            creditsModal.classList.add('open');
            creditsModal.setAttribute('aria-hidden', 'false');
            initCreditsPages();
        });
    }

    if (creditsBackdrop) {
        creditsBackdrop.addEventListener('click', () => {
            creditsModal.classList.remove('open');
            creditsModal.setAttribute('aria-hidden', 'true');
        });
    }

    if (creditsClose) {
        creditsClose.addEventListener('click', () => {
            creditsModal.classList.remove('open');
            creditsModal.setAttribute('aria-hidden', 'true');
        });
    }

    if (creditsPrev) {
        creditsPrev.addEventListener('click', () => {
            showCreditsPage(currentCreditsPage - 1);
        });
    }

    if (creditsNext) {
        creditsNext.addEventListener('click', () => {
            showCreditsPage(currentCreditsPage + 1);
        });
    }
}