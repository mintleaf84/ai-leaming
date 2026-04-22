"""测试 AI 生成知识卡片功能"""
from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    
    # 1. 导航到知识卡片页面
    print("1. 导航到 /knowledge 页面...")
    page.goto('http://localhost:3000/knowledge')
    page.wait_for_load_state('networkidle')
    time.sleep(1)
    
    # 截图查看页面状态
    page.screenshot(path='C:/tmp/knowledge_page.png', full_page=True)
    print("   截图已保存: C:/tmp/knowledge_page.png")
    
    # 2. 查找 AI 生成按钮
    print("2. 查找 AI 生成按钮...")
    ai_button = page.locator('button:has-text("AI 生成")')
    if ai_button.count() > 0:
        print("   找到 AI 生成按钮!")
        ai_button.first.click()
        time.sleep(0.5)
        
        # 截图查看弹窗
        page.screenshot(path='C:/tmp/ai_modal.png', full_page=True)
        print("   弹窗截图已保存: C:/tmp/ai_modal.png")
        
        # 3. 输入测试文本
        print("3. 输入测试知识点...")
        textarea = page.locator('textarea')
        if textarea.count() > 0:
            textarea.first.fill("皮亚杰认知发展理论将儿童认知发展分为四个阶段：感知运动阶段、前运算阶段、具体运算阶段、形式运算阶段")
            time.sleep(0.5)
            
            # 4. 点击生成按钮
            print("4. 点击 AI 生成按钮...")
            generate_btn = page.locator('button:has-text("AI 生成")').last
            generate_btn.click()
            
            # 等待 AI 响应
            print("5. 等待 AI 生成结果...")
            page.wait_for_timeout(10000)  # 等待 10 秒
            
            # 截图查看结果
            page.screenshot(path='C:/tmp/ai_result.png', full_page=True)
            print("   结果截图已保存: C:/tmp/ai_result.png")
        else:
            print("   未找到文本输入框!")
    else:
        print("   未找到 AI 生成按钮!")
        # 打印所有按钮
        buttons = page.locator('button').all_text_contents()
        print(f"   页面上的按钮: {buttons}")
    
    browser.close()
    print("\n测试完成!")
