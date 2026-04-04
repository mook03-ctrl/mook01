from flask import Flask, request, jsonify, render_template, session
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
from bs4 import BeautifulSoup
from werkzeug.security import generate_password_hash, check_password_hash
import traceback
import urllib.request
import sqlite3
import os
import datetime

app = Flask(__name__)
app.secret_key = os.urandom(24)

DATABASE = 'ext_app.db'

def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with app.app_context():
        db = get_db()
        db.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL
            )
        ''')
        db.execute('''
            CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                url TEXT NOT NULL,
                search_date DATETIME NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        ''')
        db.commit()

init_db()

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

    if 'user_id' in session:
        try:
            db = get_db()
            db.execute('INSERT INTO history (user_id, url, search_date) VALUES (?, ?, ?)',
                       (session['user_id'], url, datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
            db.commit()
            db.close()
        except Exception as e:
            print("History Error:", e)
    
    url = resolve_redirects(url)
        
    try:
        html_content = ""
        
        # 1. Start Native Browser with Remote Debugging to completely bypass anti-bot detections
        import subprocess
        import requests
        import time
        import os
        
        debugger_url = "http://127.0.0.1:9222"
        try:
            requests.get(f"{debugger_url}/json/version", timeout=1)
        except:
            browser_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
            if not os.path.exists(browser_path):
                browser_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
            
            subprocess.Popen([
                browser_path,
                "--remote-debugging-port=9222",
                "--no-first-run",
                "--no-default-browser-check",
                "--user-data-dir=C:\\temp_extractor_bot_profile"
            ])
            time.sleep(3)

        with sync_playwright() as p:
            # Connect to the actively running real browser over CDP
            browser = p.chromium.connect_over_cdp(debugger_url)
            context = browser.contexts[0] if browser.contexts else browser.new_context()
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
            # Add specific parsing logic for ChatGPT to extract clean dialogue
            conversation_text = page.evaluate("""
                () => {
                    const url = window.location.href;
                    if (url.includes('chatgpt.com') || url.includes('chat.openai.com')) {
                        const messages = document.querySelectorAll('[data-message-author-role]');
                        if (messages.length > 0) {
                            return Array.from(messages).map(m => {
                                const role = m.getAttribute('data-message-author-role');
                                const text = m.innerText.trim();
                                return `${role.toUpperCase()}:\n${text}`;
                            }).join('\\n\\n----------------------------------------\\n\\n');
                        }
                    }
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

@app.route('/api/check_id', methods=['POST'])
def check_id():
    username = request.json.get('username', '').strip()
    if not username:
        return jsonify({'error': '아이디를 입력하세요'}), 400
    db = get_db()
    user = db.execute('SELECT id FROM users WHERE username = ?', (username,)).fetchone()
    db.close()
    if user:
        return jsonify({'exists': True, 'msg': '이미 사용중인 아이디입니다.'})
    return jsonify({'exists': False, 'msg': '사용 가능한 아이디입니다.'})

@app.route('/api/signup', methods=['POST'])
def signup():
    username = request.json.get('username', '').strip()
    password = request.json.get('password', '').strip()
    
    if not username or not password:
        return jsonify({'error': '아이디와 비밀번호를 입력하세요.'}), 400
    if len(password) != 4 or not password.isdigit():
        return jsonify({'error': '비밀번호는 4자리 숫자여야 합니다.'}), 400
        
    db = get_db()
    hashed_pw = generate_password_hash(password)
    try:
        db.execute('INSERT INTO users (username, password) VALUES (?, ?)', (username, hashed_pw))
        db.commit()
    except sqlite3.IntegrityError:
        db.close()
        return jsonify({'error': '이미 가입된 아이디입니다.'}), 400
    db.close()
    return jsonify({'success': True, 'msg': '회원가입이 완료되었습니다!'})

@app.route('/api/login', methods=['POST'])
def login():
    username = request.json.get('username', '').strip()
    password = request.json.get('password', '').strip()
    
    db = get_db()
    user = db.execute('SELECT id, username, password FROM users WHERE username = ?', (username,)).fetchone()
    db.close()
    
    if user and check_password_hash(user['password'], password):
        session['user_id'] = user['id']
        session['username'] = user['username']
        return jsonify({'success': True, 'username': user['username']})
    else:
        return jsonify({'error': '아이디 또는 비밀번호가 잘못되었습니다.'}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})

@app.route('/api/session', methods=['GET'])
def get_session():
    if 'user_id' in session:
        return jsonify({'logged_in': True, 'username': session['username']})
    return jsonify({'logged_in': False})

@app.route('/api/history', methods=['GET'])
def history():
    if 'user_id' not in session:
        return jsonify({'error': '로그인이 필요합니다.'}), 401
        
    db = get_db()
    rows = db.execute('SELECT url, search_date FROM history WHERE user_id = ? ORDER BY search_date DESC', (session['user_id'],)).fetchall()
    db.close()
    
    history_list = [{'url': row['url'], 'date': row['search_date']} for row in rows]
    return jsonify({'history': history_list})

@app.route('/api/open_insta_login', methods=['POST'])
def open_insta_login():
    import subprocess
    import os
    browser_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
    if not os.path.exists(browser_path):
        browser_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

    subprocess.Popen([
        browser_path,
        "--remote-debugging-port=9222",
        "--no-first-run",
        "--no-default-browser-check",
        "--user-data-dir=C:\\temp_extractor_bot_profile",
        "https://www.instagram.com/accounts/login/"
    ])
    return jsonify({'success': True})

@app.route('/api/extract_insta', methods=['POST'])
def extract_insta():
    target_id = request.json.get('target_id', '').strip().replace('@', '')
    if not target_id:
        return jsonify({'error': '인스타그램 아이디를 입력하세요.'}), 400

    import subprocess
    import requests
    import time
    import os
    from playwright.sync_api import sync_playwright
    
    # 1. Ensure MS Edge is running with remote debugging port
    debugger_url = "http://127.0.0.1:9222"
    try:
        requests.get(f"{debugger_url}/json/version", timeout=1)
    except:
        browser_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
        if not os.path.exists(browser_path):
            browser_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
        
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = 0 # SW_HIDE

        subprocess.Popen([
            browser_path,
            "--remote-debugging-port=9222",
            "--no-first-run",
            "--no-default-browser-check",
            "--user-data-dir=C:\\temp_extractor_bot_profile"
        ], startupinfo=startupinfo, creationflags=subprocess.CREATE_NO_WINDOW)
        time.sleep(4) # Give browser time to boot

    try:
        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp(debugger_url)
            context = browser.contexts[0] if browser.contexts else browser.new_context()
            page = context.new_page()
            
            # Load Instagram Story target URL
            target_url = f"https://www.instagram.com/stories/{target_id}/"
            page.goto(target_url, wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(3000)

            curr_url = page.url
            if "login" in curr_url:
                page.close()
                return jsonify({'error': '팝업된 엣지 브라우저에서 인스타그램 로그인이 필요합니다! 로그인 후 다시 시도해주세요.'}), 401
            
            if f"/{target_id}/" in curr_url and "stories" not in curr_url:
                page.close()
                return jsonify({'error': '추출 실패'}), 404

            media_urls = []
            seen_srcs = set()

            # Keyboard interaction loop to scrape stories
            for _ in range(50): # Max 50 stories safety limit
                page.wait_for_timeout(1000) # wait for media load
                
                video_locators = page.locator("video").element_handles()
                found_media = False
                
                # Look for video src first
                for v in video_locators:
                    src = v.get_attribute("src")
                    if src and "blob:" not in src and src not in seen_srcs:
                        media_urls.append({'url': src, 'is_video': True, 'type': 'story'})
                        seen_srcs.add(src)
                        found_media = True
                        break
                
                if not found_media:
                    # Look for main story image
                    img_locators = page.locator("img").element_handles()
                    for img in img_locators:
                        src = img.get_attribute("src")
                        if src and "s150x150" not in src and "s100x100" not in src and src not in seen_srcs:
                            rect = img.bounding_box()
                            if rect and rect['width'] > 200 and rect['height'] > 300:
                                media_urls.append({'url': src, 'is_video': False, 'type': 'story'})
                                seen_srcs.add(src)
                                break
                
                # Press right arrow to go to the next story
                page.keyboard.press("ArrowRight")
                page.wait_for_timeout(1500) # Transition delay
                
                # If URL changed to something that is not this user's story, we've reached the end
                if "stories" not in page.url or target_id not in page.url:
                    break

            page.close()
            browser.close()
            return jsonify({'success': True, 'media_urls': media_urls})

    except Exception as e:
        return jsonify({'error': f'스토리 추출 실패 (새 창 브라우저를 닫으셨거나 알 수 없는 에러입니다): {str(e)}'}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
