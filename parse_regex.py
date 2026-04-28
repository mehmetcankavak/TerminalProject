import urllib.request
import re

req = urllib.request.Request("https://companiesmarketcap.com/assets-by-market-cap/", headers={'User-Agent': 'Mozilla/5.0'})
html = urllib.request.urlopen(req).read().decode('utf-8')

# A very basic regex to find rows.
pattern = re.compile(
    r'<td class="rank-td td-right"[^>]*>.*?(\d+).*?</td>\s*'
    r'<td class="name-td">.*?<img.*?src="([^"]+)".*?<div class="company-name"[^>]*>(.*?)</div>.*?<div class="company-code"[^>]*>(.*?)</div>.*?</td>\s*'
    r'<td class="td-right"[^>]*>.*?([^<]+).*?</td>\s*'
    r'<td class="td-right".*?>([^<]+)</td>\s*'
    r'<td class="td-right"[^>]*>.*?([^<]+).*?</td>',
    re.DOTALL
)

matches = pattern.findall(html)
print(f"Found {len(matches)} matches")
for m in matches[:5]:
    try:
        rank, icon, name, code, market_cap, price, change = m
        print(f"{rank}. {name.strip()} ({code.strip()}) - {market_cap.strip()} - {price.strip()} - {change.strip()} []")
    except Exception as e:
        print(e)
