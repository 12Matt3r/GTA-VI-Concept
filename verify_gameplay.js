const { chromium } = require('playwright');

async function debugVerification() {
    let browser;
    try {
        browser = await chromium.launch();
        const context = await browser.newContext();
        const page = await context.newPage();

        console.log('Navigating to http://localhost:8000 for debugging...');
        await page.goto('http://localhost:8000', { waitUntil: 'networkidle' });

        console.log('Page loaded. Capturing screenshot...');
        await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });
        console.log('Debug screenshot saved as debug-screenshot.png');

    } catch (error) {
        console.error('An error occurred during the debug verification:', error);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

debugVerification();
