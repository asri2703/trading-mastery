"""Render mobile preview to test carousel."""
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        # iPhone 14 Pro viewport
        ctx = await browser.new_context(
            viewport={'width': 393, 'height': 852},
            device_scale_factor=3,
            user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
        )
        page = await ctx.new_page()
        await page.goto(f'file:///home/ubuntu/trading-mastery/index.html?v={int(asyncio.get_event_loop().time())}')
        await page.wait_for_load_state('networkidle')
        await page.reload(wait_until='networkidle')

        # Trigger reveal animations
        await page.evaluate("document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'))")
        await page.wait_for_timeout(800)

        # Scroll to reviews section
        await page.evaluate("document.getElementById('reviews').scrollIntoView({block: 'start'})")
        await page.wait_for_timeout(1000)

        # Screenshot
        await page.screenshot(path='/home/ubuntu/trading-mastery/preview_mobile_reviews.png')

        # Desktop preview also
        await ctx.close()
        ctx = await browser.new_context(viewport={'width': 1280, 'height': 800})
        page = await ctx.new_page()
        await page.goto(f'file:///home/ubuntu/trading-mastery/index.html?v={int(asyncio.get_event_loop().time())+1}')
        await page.wait_for_load_state('networkidle')
        await page.reload(wait_until='networkidle')
        await page.evaluate("document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'))")
        await page.wait_for_timeout(800)
        await page.evaluate("document.getElementById('reviews').scrollIntoView({block: 'start'})")
        await page.wait_for_timeout(1000)
        await page.screenshot(path='/home/ubuntu/trading-mastery/preview_desktop_reviews.png')

        await browser.close()
        print('✅ Mobile + desktop previews saved')

asyncio.run(main())
