import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// TODO: Replace with your Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyAJ62tkrMXUUXkV4LRN2GejhIrbOaOugwc",
  authDomain: "aiextractor-aa809.firebaseapp.com",
  projectId: "aiextractor-aa809",
  storageBucket: "aiextractor-aa809.firebasestorage.app",
  messagingSenderId: "966710872260",
  appId: "1:966710872260:web:8c1bfc59fe18d1eae9e191",
  measurementId: "G-LCJ64PVMZ8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('extract-form');
    const urlInput = document.getElementById('url-input');
    const submitBtn = document.getElementById('submit-btn');
    const errorMessage = document.getElementById('error-message');
    const statusMessage = document.getElementById('status-message');
    const resultsSection = document.getElementById('results-section');
    const tableCount = document.getElementById('table-count');
    const tablesContainer = document.getElementById('tables-container');
    const textContainer = document.getElementById('text-container');
    const copyTextBtn = document.getElementById('copy-text-btn');
    const textResultsSection = document.getElementById('text-results-section');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const url = urlInput.value.trim();
        if (!url) return;

        // Reset state
        hideError();
        hideStatus();
        setLoading(true);
        resultsSection.classList.add('hidden');
        tablesContainer.innerHTML = '';
        if (textContainer) textContainer.textContent = '';
        if (textResultsSection) textResultsSection.classList.add('hidden');

        try {
            // 1. Create a document in Firestore 'requests' collection
            const docRef = await addDoc(collection(db, "requests"), {
                url: url,
                status: 'pending',
                createdAt: serverTimestamp()
            });

            showStatus('요청이 접수되었습니다. 봇이 데이터를 추출하는 중입니다... (최대 5분 소요)');

            // 2. Listen for real-time updates on this document
            const unsubscribe = onSnapshot(doc(db, "requests", docRef.id), (documentSnapshot) => {
                const data = documentSnapshot.data();
                
                if (data.status === 'completed') {
                    unsubscribe(); // Stop listening
                    setLoading(false);
                    hideStatus();
                    
                    if (data.count === 0 && !data.conversation_text) {
                        showError('해당 링크에서 표나 대화 내용을 찾을 수 없습니다.');
                        return;
                    }

                    if (data.count > 0) {
                        renderTables(data.tables);
                        tableCount.textContent = data.count;
                    } else {
                        tableCount.textContent = '0';
                    }
                    
                    if (data.conversation_text && data.conversation_text.trim()) {
                        textContainer.textContent = data.conversation_text.trim();
                        textResultsSection.classList.remove('hidden');
                        
                        if (copyTextBtn) {
                            copyTextBtn.onclick = () => copyPlainTextToClipboard(data.conversation_text.trim(), copyTextBtn);
                        }
                    } else {
                        textResultsSection.classList.add('hidden');
                    }

                    resultsSection.classList.remove('hidden');

                    // Scroll to results smoothly
                    setTimeout(() => {
                        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                    
                } else if (data.status === 'error') {
                    unsubscribe(); // Stop listening
                    setLoading(false);
                    hideStatus();
                    showError(data.errorMessage || '추출 중 오류가 발생했습니다.');
                }
            });

        } catch (err) {
            setLoading(false);
            if (err.code === 'permission-denied') {
                showError('Firebase 권한 오류: 데이터베이스 설정 및 규칙을 확인하세요.');
            } else {
                showError('오류: ' + err.message);
            }
        }
    });

    function renderTables(tables) {
        tables.forEach((tableHtml, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'table-wrapper';
            
            const header = document.createElement('div');
            header.className = 'table-actions';
            
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn';
            copyBtn.innerHTML = '엑셀/PPT용 복사';
            copyBtn.onclick = () => copyTableToClipboard(tableHtml, copyBtn);
            
            header.appendChild(copyBtn);
            
            const scrollArea = document.createElement('div');
            scrollArea.className = 'table-scroll';
            scrollArea.innerHTML = tableHtml;
            
            wrapper.appendChild(header);
            wrapper.appendChild(scrollArea);
            
            tablesContainer.appendChild(wrapper);
        });
    }

    async function copyTableToClipboard(htmlString, btnElement) {
        try {
            const styledHtml = `
                <html>
                    <body>
                        <style>
                            table { border-collapse: collapse; width: 100%; font-family: 'Malgun Gothic', -apple-system, sans-serif; }
                            th, td { border: 1px solid #cccccc; padding: 8px; text-align: left; }
                            th { background-color: #f2f2f2; font-weight: bold; }
                        </style>
                        ${htmlString}
                    </body>
                </html>
            `;
            
            const blobHtml = new Blob([styledHtml], { type: 'text/html' });
            
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlString;
            const textContent = tempDiv.innerText;
            const blobText = new Blob([textContent], { type: 'text/plain' });
            
            const data = [new ClipboardItem({ 
                'text/html': blobHtml, 
                'text/plain': blobText 
            })];
            
            await navigator.clipboard.write(data);
            
            const originalText = btnElement.innerHTML;
            btnElement.innerHTML = '✓ 복사됨!';
            btnElement.classList.add('success');
            
            setTimeout(() => {
                btnElement.innerHTML = originalText;
                btnElement.classList.remove('success');
            }, 2000);
            
        } catch (err) {
            console.error('Failed to copy text: ', err);
            try {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = htmlString;
                tempDiv.style.position = 'absolute';
                tempDiv.style.left = '-9999px';
                document.body.appendChild(tempDiv);
                
                const range = document.createRange();
                range.selectNodeContents(tempDiv);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
                
                document.execCommand('copy');
                document.body.removeChild(tempDiv);
                
                const originalText = btnElement.innerHTML;
                btnElement.innerHTML = '✓ 복사됨! (대체 방법)';
                btnElement.classList.add('success');
                setTimeout(() => {
                    btnElement.innerHTML = originalText;
                    btnElement.classList.remove('success');
                }, 2000);
                
            } catch (fallbackErr) {
                alert('클립보드 복사에 실패했습니다.');
            }
        }
    }

    async function copyPlainTextToClipboard(text, btnElement) {
        try {
            await navigator.clipboard.writeText(text);
            const originalText = btnElement.innerHTML;
            btnElement.innerHTML = '✓ 복사됨!';
            btnElement.classList.add('success');
            setTimeout(() => {
                btnElement.innerHTML = originalText;
                btnElement.classList.remove('success');
            }, 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
            try {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                
                const originalText = btnElement.innerHTML;
                btnElement.innerHTML = '✓ 복사됨! (대체 방법)';
                btnElement.classList.add('success');
                setTimeout(() => {
                    btnElement.innerHTML = originalText;
                    btnElement.classList.remove('success');
                }, 2000);
            } catch (fallbackErr) {
                alert('텍스트 복사에 실패했습니다.');
            }
        }
    }

    function setLoading(isLoading) {
        if (isLoading) {
            submitBtn.classList.add('loading');
            submitBtn.disabled = true;
            urlInput.disabled = true;
        } else {
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
            urlInput.disabled = false;
        }
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.remove('hidden');
    }

    function hideError() {
        errorMessage.classList.add('hidden');
    }

    function showStatus(message) {
        statusMessage.textContent = message;
        statusMessage.classList.remove('hidden');
    }

    function hideStatus() {
        statusMessage.classList.add('hidden');
    }
});
