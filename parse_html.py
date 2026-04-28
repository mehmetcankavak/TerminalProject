import urllib.request
from html.parser import HTMLParser

class AssetParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_tr = False
        self.in_td = False
        self.current_td_class = ""
        self.current_assets = []
        self.current_asset = {}
        self.td_count = 0
        self.text_buffer = ""
        self.in_img = False

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag == "tr":
            self.in_tr = True
            self.current_asset = {}
            self.td_count = 0
        elif tag == "td" and self.in_tr:
            self.in_td = True
            self.current_td_class = attrs_dict.get("class", "")
            self.td_count += 1
            self.text_buffer = ""
        elif tag == "img" and self.in_td and self.td_count == 2:
            self.current_asset["icon"] = attrs_dict.get("src", "")
        # capture sparkline
        elif tag == "img" and self.in_td and "sparkline" in attrs_dict.get("class", ""):
            self.current_asset["sparkline"] = attrs_dict.get("src", "")
        elif tag == "img" and self.in_td and "flag" in attrs_dict.get("class", ""):
            self.current_asset["flag"] = attrs_dict.get("src", "")

    def handle_endtag(self, tag):
        if tag == "td" and self.in_tr:
            self.in_td = False
            text = self.text_buffer.strip()
            if self.td_count == 1:
                self.current_asset["rank"] = text
            elif self.td_count == 2:
                # name and code are inside inner divs, but text buffer aggregates them
                parts = [p.strip() for p in text.split('\n') if p.strip()]
                if parts:
                    self.current_asset["name"] = parts[0]
                    self.current_asset["code"] = parts[-1] if len(parts) > 1 else parts[0]
            elif self.td_count == 3:
                self.current_asset["market_cap"] = text
            elif self.td_count == 4:
                self.current_asset["price"] = text
            elif self.td_count == 5:
                self.current_asset["today"] = text
            elif self.td_count == 7:
                self.current_asset["country"] = text

        elif tag == "tr":
            self.in_tr = False
            if "rank" in self.current_asset and self.current_asset["rank"].isdigit():
                self.current_assets.append(self.current_asset)

    def handle_data(self, data):
        if self.in_td:
            self.text_buffer += data + "\n"

req = urllib.request.Request("https://companiesmarketcap.com/assets-by-market-cap/", headers={'User-Agent': 'Mozilla/5.0'})
html = urllib.request.urlopen(req).read().decode('utf-8')
parser = AssetParser()
parser.feed(html)
print(f"Parsed {len(parser.current_assets)} assets")
for a in parser.current_assets[:5]:
    print(a)
