document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('extract-form');
    const urlInput = document.getElementById('url-input');
    const submitBtn = document.getElementById('submit-btn');
    const errorMessage = document.getElementById('error-message');
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
        setLoading(true);
        resultsSection.classList.add('hidden');
        tablesContainer.innerHTML = '';
        if (textContainer) textContainer.textContent = '';
        if (textResultsSection) textResultsSection.classList.add('hidden');

        try {
            const response = await fetch('/api/extract', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '알 수 없는 오류가 발생했습니다.');
            }

            if (data.count === 0 && !data.conversation_text) {
                showError('해당 링크에서 표를 찾을 수 없습니다.');
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

        } catch (err) {
            showError(err.message);
        } finally {
            setLoading(false);
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
            // Create a styled version of the HTML for better Excel/PPT pasting 
            // We wrap it in a div and add some basic inline CSS that Office applications respect
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
            
            // Fallback for plain text
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlString;
            const textContent = tempDiv.innerText;
            const blobText = new Blob([textContent], { type: 'text/plain' });
            
            const data = [new ClipboardItem({ 
                'text/html': blobHtml, 
                'text/plain': blobText 
            })];
            
            await navigator.clipboard.write(data);
            
            // Visual feedback
            const originalText = btnElement.innerHTML;
            btnElement.innerHTML = '✓ 복사됨!';
            btnElement.classList.add('success');
            
            setTimeout(() => {
                btnElement.innerHTML = originalText;
                btnElement.classList.remove('success');
            }, 2000);
            
        } catch (err) {
            console.error('Failed to copy text: ', err);
            
            // Fallback for older browsers
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
});

// Auth and Modal Logic
let isIdChecked = false;
let checkedId = '';

function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
    if (id === 'history-modal') {
        loadHistory();
    }
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

// Close modal when clicking outside
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        closeModal(e.target.id);
    }
});

// Hamburger menu logic
const menuIcon = document.querySelector('.menu-icon-wrapper');
const menuDropdown = document.getElementById('menu-dropdown');
if (menuIcon && menuDropdown) {
    menuIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        menuDropdown.classList.toggle('hidden');
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!menuIcon.contains(e.target)) {
            menuDropdown.classList.add('hidden');
        }
    });
}

async function checkSession() {
    try {
        const res = await fetch('/api/session');
        const data = await res.json();
        if (data.logged_in) {
            document.getElementById('nav-unauth').style.display = 'none';
            document.getElementById('nav-auth').style.display = 'flex';
            document.getElementById('welcome-container').style.display = 'block';
            document.getElementById('welcome-msg').textContent = `Welcome, ${data.username}`;
        } else {
            document.getElementById('nav-unauth').style.display = 'flex';
            document.getElementById('nav-auth').style.display = 'none';
            document.getElementById('welcome-container').style.display = 'none';
        }
    } catch (e) {
        console.error("Session check failed");
    }
}

async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    checkSession();
}

// History Logic
async function loadHistory() {
    const tbody = document.getElementById('history-tbody');
    const table = document.getElementById('history-table');
    const prompt = document.getElementById('history-login-prompt');
    
    tbody.innerHTML = '';
    table.classList.add('hidden');
    prompt.classList.add('hidden');

    try {
        const res = await fetch('/api/history');
        if (res.status === 401) {
            prompt.textContent = "로그인이 필요한 기능입니다.";
            prompt.classList.remove('hidden');
            return;
        }
        const data = await res.json();
        
        if (data.history && data.history.length > 0) {
            table.classList.remove('hidden');
            data.history.forEach(item => {
                const tr = document.createElement('tr');
                const tdDate = document.createElement('td');
                tdDate.textContent = item.date;
                const tdUrl = document.createElement('td');
                tdUrl.className = 'url-cell';
                tdUrl.textContent = item.url;
                tdUrl.onclick = () => {
                    closeModal('history-modal');
                    const urlInput = document.getElementById('url-input');
                    urlInput.value = item.url;
                    // Trigger submit manually
                    const submitEvent = new Event('submit', {
                        'bubbles': true,
                        'cancelable': true
                    });
                    document.getElementById('extract-form').dispatchEvent(submitEvent);
                };
                tr.appendChild(tdDate);
                tr.appendChild(tdUrl);
                tbody.appendChild(tr);
            });
        } else {
            prompt.textContent = "저장된 검색 히스토리가 없습니다.";
            prompt.classList.remove('hidden');
        }
    } catch (e) {
        console.error("History load failed");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    checkSession();

    // Signup ID Check
    const checkIdBtn = document.getElementById('check-id-btn');
    const signupIdInput = document.getElementById('signup-id');
    const idCheckMsg = document.getElementById('id-check-msg');
    const signupSubmitBtn = document.getElementById('signup-submit-btn');

    if (checkIdBtn) {
        checkIdBtn.onclick = async () => {
            const username = signupIdInput.value.trim();
            if (!username) {
                idCheckMsg.textContent = "아이디를 입력해주세요.";
                idCheckMsg.className = "check-msg error";
                return;
            }
            try {
                const res = await fetch('/api/check_id', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username })
                });
                const data = await res.json();
                if (data.exists) {
                    idCheckMsg.textContent = data.msg;
                    idCheckMsg.className = "check-msg error";
                    isIdChecked = false;
                    signupSubmitBtn.disabled = true;
                } else {
                    idCheckMsg.textContent = data.msg;
                    idCheckMsg.className = "check-msg success";
                    isIdChecked = true;
                    checkedId = username;
                    signupSubmitBtn.disabled = false;
                }
            } catch(e) {
                idCheckMsg.textContent = "확인 중 오류가 발생했습니다.";
                idCheckMsg.className = "check-msg error";
            }
        };
    }

    if (signupIdInput) {
        signupIdInput.addEventListener('input', () => {
            if (signupIdInput.value.trim() !== checkedId) {
                isIdChecked = false;
                signupSubmitBtn.disabled = true;
                idCheckMsg.textContent = "";
            }
        });
    }

    // Signup Form
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        signupForm.onsubmit = async (e) => {
            e.preventDefault();
            if (!isIdChecked) return;
            const username = signupIdInput.value.trim();
            const password = document.getElementById('signup-pw').value.trim();
            const errDiv = document.getElementById('signup-error');
            errDiv.classList.add('hidden');

            try {
                const res = await fetch('/api/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                if (res.ok) {
                    alert("회원가입이 완료되었습니다! 로그인 해주세요.");
                    closeModal('signup-modal');
                    e.target.reset();
                    idCheckMsg.textContent = "";
                    signupSubmitBtn.disabled = true;
                } else {
                    errDiv.textContent = data.error;
                    errDiv.classList.remove('hidden');
                }
            } catch(err) {
                errDiv.textContent = "오류가 발생했습니다.";
                errDiv.classList.remove('hidden');
            }
        };
    }

    // Login Form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.onsubmit = async (e) => {
            e.preventDefault();
            const username = document.getElementById('login-id').value.trim();
            const password = document.getElementById('login-pw').value.trim();
            const errDiv = document.getElementById('login-error');
            errDiv.classList.add('hidden');

            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                if (res.ok) {
                    closeModal('login-modal');
                    e.target.reset();
                    checkSession();
                } else {
                    errDiv.textContent = data.error;
                    errDiv.classList.remove('hidden');
                }
            } catch(err) {
                errDiv.textContent = "오류가 발생했습니다.";
                errDiv.classList.remove('hidden');
            }
        };
    }
});
