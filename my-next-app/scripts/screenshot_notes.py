from playwright.sync_api import sync_playwright
import os

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    
    # 访问笔记页面
    page.goto('http://localhost:3000/notes')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2000)  # 等待渲染
    
    # 截图保存
    screenshot_path = r'C:\Users\Administrator\.gemini\antigravity\brain\2fd0fc13-a972-4a19-9f57-e04ac6996a84\notes_page.png'
    page.screenshot(path=screenshot_path, full_page=True)
    print(f'Screenshot saved to {screenshot_path}')
    
    browser.close()
