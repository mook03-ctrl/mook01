from flask import Flask, request, jsonify, render_template
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
from bs4 import BeautifulSoup
import traceback
import urllib.request

app = Flask(__name__)

def resolve_redirects(url):
    try:
        req = urllib.request.Request(url, method='HEAD', headers={'User-Agent': 'Mozilla/5.0'})
        res = urllib.request.urlopen(req, timeout=5)
        return res.url
    except Exception:
        return url

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/extract', methods=['POST'])
def extract():
    data = request.json
    url = data.get('url')
    
    if not url:
        return jsonify({"error": "URL이 누락되었습니다."}), 400
        
    url = resolve_redirects(url)
        
    try:
        html_content = ""
        with sync_playwright() as p:
            # Launch chromium in headless mode
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page = context.new_page()
            
            # Go to Gemini URL and wait for javascript rendering
            page.goto(url, wait_until="domcontentloaded", timeout=40000)
            
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
            
            # Hard wait for 8 seconds to ensure Gemini framework finishes painting DOM
            page.wait_for_timeout(8000)
            
            # Wait specifically for a table element to appear dynamically, up to 5 seconds
            try:
                page.wait_for_selector('table', state='attached', timeout=5000)
            except PlaywrightTimeoutError:
                # Proceed anyway, might be no table or already loaded
                pass
                
            html_content = page.content()
            page_text = page.evaluate("document.body.innerText")
            
            # Get main content text (preferably inside main or article to avoid nav headers)
            conversation_text = page.evaluate("""
                () => {
                    const main = document.querySelector('main') || document.querySelector('article') || document.body;
                    return main.innerText;
                }
            """)
            
            browser.close()
            
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # Find all tables
        tables = soup.find_all('table')
        
        if not tables and not conversation_text.strip():
            # Provide debug context to the user so we know what rendering issue occurred
            preview_txt = page_text[:500].replace('\n', ' ') if page_text else "빈 화면"
            return jsonify({
                "error": f"내용을 찾을 수 없습니다. 현재 화면 텍스트: {preview_txt}..."
            }), 404

        extracted_tables = []
        for table in tables:
            # We want to extract just the HTML of the table itself
            table_str = str(table)
            extracted_tables.append(table_str)
            
        return jsonify({
            "success": True,
            "tables": extracted_tables,
            "count": len(extracted_tables),
            "conversation_text": conversation_text
        })
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"표 추출 중 오류가 발생했습니다: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
