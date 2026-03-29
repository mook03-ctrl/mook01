import asyncio
from playwright.sync_api import sync_playwright
import time

url = "https://chatgpt.com/share/69c92945-cd74-83a1-bb8b-c34265499b1e"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    page = context.new_page()
    page.goto(url, wait_until="domcontentloaded", timeout=40000)
    page.wait_for_timeout(8000)
    
    html_content = page.content()
    
    conversation_text = page.evaluate("""
        () => {
            const messages = document.querySelectorAll('[data-message-author-role]');
            if (messages.length > 0) {
                return Array.from(messages).map(m => {
                    const role = m.getAttribute('data-message-author-role');
                    const text = m.innerText.trim();
                    return `${role.toUpperCase()}:\\n${text}`;
                }).join('\\n\\n----------------------------------------\\n\\n');
            }
            return "NO MESSAGES FOUND";
        }
    """)
    
    with open('dump3.html', 'w', encoding='utf-8') as f:
        f.write(html_content)
        
    print("----- CONVERSATION TEXT -----")
    print(conversation_text)
    
    browser.close()
