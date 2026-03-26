document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('extract-form');
    const urlInput = document.getElementById('url-input');
    const submitBtn = document.getElementById('submit-btn');
    const errorMessage = document.getElementById('error-message');
    const resultsSection = document.getElementById('results-section');
    const tableCount = document.getElementById('table-count');
    const tablesContainer = document.getElementById('tables-container');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const url = urlInput.value.trim();
        if (!url) return;

        // Reset state
        hideError();
        setLoading(true);
        resultsSection.classList.add('hidden');
        tablesContainer.innerHTML = '';

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

            if (data.count === 0) {
                showError('해당 링크에서 표를 찾을 수 없습니다.');
                return;
            }

            renderTables(data.tables);
            tableCount.textContent = data.count;
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
