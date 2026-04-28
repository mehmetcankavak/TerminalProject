import urllib.request
from bs4 import BeautifulSoup
import re

req = urllib.request.Request("https://companiesmarketcap.com/assets-by-market-cap/", headers={'User-Agent': 'Mozilla/5.0'})
html = urllib.request.urlopen(req).read()
soup = BeautifulSoup(html, "html.parser")
rows = soup.select("table tbody tr")
print(f"Found {len(rows)} rows.")
for row in rows[:5]:
    cols = row.select("td")
    if len(cols) > 0:
        rank = cols[0].text.strip()
        name_col = cols[1]
        name_div = name_col.select_one("div.company-name")
        name = name_div.text.strip() if name_div else ""
        ticker_div = name_col.select_one("div.company-code")
        ticker = ticker_div.text.strip() if ticker_div else ""
        icon = name_col.select_one("img")["src"] if name_col.select_one("img") else ""
        
        market_cap = cols[2].text.strip()
        price = cols[3].text.strip()
        today = cols[4].text.strip()
        print(f"{rank} - {name} ({ticker}) - {market_cap} - {price} - {today} - {icon}")

