from playwright.sync_api import sync_playwright

def run_dump():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto('https://gemini.google.com/share/78a5a9be74ab', wait_until='domcontentloaded', timeout=40000)
        
        # Auto-scroll page to trigger lazy loading of tables
        page.evaluate("""
            async () => {
                await new Promise((resolve) => {
                    let totalHeight = 0;
                    const distance = 800; // scroll distance
                    const timer = setInterval(() => {
                        const scrollHeight = document.body.scrollHeight;
                        window.scrollBy(0, distance);
                        totalHeight += distance;

                        if(totalHeight >= scrollHeight || totalHeight > 30000) {
                            clearInterval(timer);
                            resolve();
                        }
                    }, 200);
                });
            }
        """)
        page.wait_for_timeout(3000)
        with open('dump.html', 'w', encoding='utf-8') as f:
            f.write(page.content())
        browser.close()
        print('Done')

if __name__ == '__main__':
    run_dump()
