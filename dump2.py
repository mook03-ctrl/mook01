import urllib.request
import sys

url = "https://chatgpt.com/share/69c92637-2704-8320-b52c-abe76c4fa26f"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'})
try:
    with urllib.request.urlopen(req) as response:
        html = response.read().decode('utf-8')
        with open('dump2.html', 'w', encoding='utf-8') as f:
            f.write(html)
        print("Success, written to dump2.html")
except Exception as e:
    print("Error:", e)
