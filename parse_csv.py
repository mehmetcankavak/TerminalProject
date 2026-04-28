import urllib.request
try:
    req = urllib.request.Request("https://companiesmarketcap.com/assets-by-market-cap/?download=csv", headers={'User-Agent': 'Mozilla/5.0'})
    html = urllib.request.urlopen(req).read().decode('utf-8')
    print("Downloaded:")
    print(html[:500])
except Exception as e:
    print(e)
