"""Render landing page preview as PNG."""
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={'width': 1280, 'height': 800}, device_scale_factor=1)
        page = await ctx.new_page()

        html_path = '/home/ubuntu/trading-mastery/index.html'
        await page.goto(f'file://{html_path}')
        await page.wait_for_load_state('networkidle')

        # Trigger reveal animations
        await page.evaluate("document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'))")
        await page.wait_for_timeout(800)

        # Full page screenshot
        await page.screenshot(path='/home/ubuntu/trading-mastery/preview_full.png', full_page=True)
        # Above-the-fold
        await page.screenshot(path='/home/ubuntu/trading-mastery/preview_hero.png', full_page=False)

        await browser.close()
        print('✅ Previews saved')

asyncio.run(main())
