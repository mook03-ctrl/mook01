import sys
from playwright.sync_api import sync_playwright

url = "https://chatgpt.com/share/69c92637-2704-8320-b52c-abe76c4fa26f"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto(url, wait_until="domcontentloaded", timeout=40000)
    page.wait_for_timeout(8000)
    
    # Check messages
    messages = page.evaluate("""
        () => {
            const elements = document.querySelectorAll('[data-message-author-role]');
            return Array.from(elements).map(e => ({
                role: e.getAttribute('data-message-author-role'),
                text: e.innerText
            }));
        }
    """)
    
    html = page.content()
    with open('dump.html', 'w', encoding='utf-8') as f:
        f.write(html)
        
    print("Found messages:", len(messages))
    for m in messages:
        print(f"{m['role']}: {m['text'][:50]}...")
    
    browser.close()
