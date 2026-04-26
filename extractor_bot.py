import os
import json
import firebase_admin
from firebase_admin import credentials, firestore
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
from bs4 import BeautifulSoup
import urllib.request
import traceback

def resolve_redirects(url):
    try:
        req = urllib.request.Request(url, method='HEAD', headers={'User-Agent': 'Mozilla/5.0'})
        res = urllib.request.urlopen(req, timeout=5)
        return res.url
    except Exception:
        return url

def extract_content(url):
    html_content = ""
    conversation_text = ""
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()
        
        try:
            page.goto(url, wait_until="networkidle", timeout=60000)
            
            # Auto-scroll page to trigger lazy loading of tables
            page.evaluate("""
                async () => {
                    await new Promise((resolve) => {
                        let totalHeight = 0;
                        const distance = 800;
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
            
            # Hard wait for 5 seconds to ensure Gemini framework finishes painting DOM
            page.wait_for_timeout(5000)
            
            try:
                page.wait_for_selector('table', state='attached', timeout=5000)
            except PlaywrightTimeoutError:
                pass
                
            html_content = page.content()
            
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
        finally:
            browser.close()
            
    soup = BeautifulSoup(html_content, 'html.parser')
    tables = soup.find_all('table')
    
    extracted_tables = [str(table) for table in tables]
    
    return {
        "tables": extracted_tables,
        "count": len(extracted_tables),
        "conversation_text": conversation_text
    }

def main():
    # 1. Initialize Firebase Admin
    firebase_cred_json = os.environ.get('FIREBASE_CREDENTIALS')
    if not firebase_cred_json:
        print("FIREBASE_CREDENTIALS environment variable is not set. Exiting.")
        return
        
    cred_dict = json.loads(firebase_cred_json)
    cred = credentials.Certificate(cred_dict)
    firebase_admin.initialize_app(cred)
    
    db = firestore.client()
    
    # 2. Get pending requests
    print("Fetching pending requests...")
    requests_ref = db.collection('requests')
    query = requests_ref.where('status', '==', 'pending').limit(10)
    docs = query.stream()
    
    for doc in docs:
        data = doc.to_dict()
        url = data.get('url')
        print(f"Processing document {doc.id} with URL: {url}")
        
        try:
            resolved_url = resolve_redirects(url)
            print(f"Resolved URL: {resolved_url}")
            
            extracted_data = extract_content(resolved_url)
            
            # Update Firestore with completed data
            doc_ref = requests_ref.document(doc.id)
            doc_ref.update({
                'status': 'completed',
                'tables': extracted_data['tables'],
                'count': extracted_data['count'],
                'conversation_text': extracted_data['conversation_text']
            })
            print(f"Successfully processed and updated document {doc.id}")
            
        except Exception as e:
            traceback.print_exc()
            error_message = str(e)
            doc_ref = requests_ref.document(doc.id)
            doc_ref.update({
                'status': 'error',
                'errorMessage': error_message
            })
            print(f"Error processing document {doc.id}: {error_message}")

if __name__ == "__main__":
    main()
