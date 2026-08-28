"""Render just the Performance section."""
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={'width': 393, 'height': 852}, device_scale_factor=2)
        page = await ctx.new_page()
        await page.goto(f'file:///home/ubuntu/trading-mastery/index.html?v={int(asyncio.get_event_loop().time())}')
        await page.wait_for_load_state('networkidle')
        await page.reload(wait_until='networkidle')
        await page.evaluate("document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'))")
        await page.wait_for_timeout(500)
        # Scroll to performance section
        await page.evaluate("document.getElementById('performance').scrollIntoView({block: 'start'})")
        await page.wait_for_timeout(500)
        await page.screenshot(path='/home/ubuntu/trading-mastery/preview_perf_mobile.png')

        # Desktop too
        await ctx.close()
        ctx = await browser.new_context(viewport={'width': 1280, 'height': 800})
        page = await ctx.new_page()
        await page.goto(f'file:///home/ubuntu/trading-mastery/index.html?v={int(asyncio.get_event_loop().time())+1}')
        await page.wait_for_load_state('networkidle')
        await page.reload(wait_until='networkidle')
        await page.evaluate("document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'))")
        await page.wait_for_timeout(500)
        await page.evaluate("document.getElementById('performance').scrollIntoView({block: 'start'})")
        await page.wait_for_timeout(500)
        await page.screenshot(path='/home/ubuntu/trading-mastery/preview_perf_desktop.png')

        await browser.close()
        print('✅ Performance previews saved')

asyncio.run(main())
