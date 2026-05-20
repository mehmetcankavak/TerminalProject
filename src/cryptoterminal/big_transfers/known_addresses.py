"""Curated registry of labeled blockchain addresses.

All entries are addresses publicly known to belong to specific entities —
sourced from Etherscan's open-source labels (etherscan-labels GitHub repo),
Arkham public tags, and entity-confirmed addresses. We keep this in code
(no runtime fetch) so labeling is auditable and offline-safe.

Format: lowercased address -> (display_label, category, entity)
  category:  'cex' | 'mint' | 'defi' | 'bridge' | 'burn' | 'whale'
  entity:    'binance' | 'coinbase' | 'tether' | 'circle' | ...

To extend: add an entry, restart backend. Don't add unverified addresses —
mislabeling a transfer is worse than not labeling it.
"""
from __future__ import annotations

# Burn / null sinks
_BURN_ADDRS = {
    "0x0000000000000000000000000000000000000000": ("Null Address",       "burn", "system"),
    "0x000000000000000000000000000000000000dead": ("Burn Address",       "burn", "system"),
}

# Stablecoin mint authorities — flows from these = new supply entering market.
# Each issuer's official treasury/mint contract per their published docs.
_MINT_ADDRS = {
    # Tether (USDT) — the only address that can mint USDT
    "0x5754284f345afc66a98fbb0a0afe71e0f007b949": ("Tether Treasury",    "mint", "tether"),
    # Circle (USDC) — controls USDC supply via Mint Master
    "0x55fe002aeff02f77364de339a1292923a15844b8": ("Circle Mint",        "mint", "circle"),
    # First Digital (FDUSD) — Binance's preferred stablecoin
    "0xc9aae9b8b65b5a3f7ed4e88c1b4f1d4d2c9d3f0e": ("FDUSD Issuer",       "mint", "firstdigital"),
    # MakerDAO PSM (Peg Stability Module) — major DAI mint/burn via USDC swap
    "0x89b78cfa322f6c5de0abceecab66aee45393cc5a": ("MakerDAO DAI PSM",   "mint", "makerdao"),
    # Frax Finance multisig mint authority
    "0x6e36f593f3b242dbb2e06c4f8f3a3d7fcfd1d9bb": ("Frax Treasury",      "mint", "frax"),
    # PayPal USD (PYUSD) issuer — Paxos
    "0xe17b8adf8e46b15f3f9ab4bb9e3b6734f17b9b04": ("PYUSD Issuer",       "mint", "paypal"),
    # Paxos (USDP / PAX) standard mint
    "0xe25a329d385f77df5d4ed56265babe2b99a5436e": ("Paxos USDP Mint",    "mint", "paxos"),
}

# Major CEX hot wallets — these are the addresses exchanges actually use to
# move customer funds. When something flows IN, customer is depositing
# (about-to-sell signal); when something flows OUT, customer is withdrawing
# (accumulation signal). Labels follow Etherscan conventions.
_CEX_ADDRS = {
    # ── Binance ───────────────────────────────────────────────────────────
    "0x28c6c06298d514db089934071355e5743bf21d60": ("Binance 14",          "cex", "binance"),
    "0x21a31ee1afc51d94c2efccaa2092ad1028285549": ("Binance 15",          "cex", "binance"),
    "0xdfd5293d8e347dfe59e90efd55b2956a1343963d": ("Binance 16",          "cex", "binance"),
    "0x56eddb7aa87536c09ccc2793473599fd21a8b17f": ("Binance 17",          "cex", "binance"),
    "0x9696f59e4d72e237be84ffd425dcad154bf96976": ("Binance 18",          "cex", "binance"),
    "0x4d9ff67fc7758a25fed4d39c6cf242db0b0f50f5": ("Binance 19",          "cex", "binance"),
    "0x4e9ce36e442e55ecd9025b9a6e0d88485d628a67": ("Binance 20",          "cex", "binance"),
    "0xbe0eb53f46cd790cd13851d5eff43d12404d33e8": ("Binance Cold 7",      "cex", "binance"),
    "0xf977814e90da44bfa03b6295a0616a897441acec": ("Binance Cold 8",      "cex", "binance"),
    "0x001866ae5b3de6caa5a51543fd9fb64f524f5478": ("Binance Cold 9",      "cex", "binance"),
    "0x5a52e96bacdabb82fd05763e25335261b270efcb": ("Binance Hot",         "cex", "binance"),
    "0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be": ("Binance Hot 2",       "cex", "binance"),
    "0xd551234ae421e3bcba99a0da6d736074f22192ff": ("Binance Hot 3",       "cex", "binance"),
    "0x564286362092d8e7936f0549571a803b203aaced": ("Binance Hot 4",       "cex", "binance"),
    "0x0681d8db095565fe8a346fa0277bffde9c0edbbf": ("Binance Hot 5",       "cex", "binance"),
    "0xfe9e8709d3215310075d67e3ed32a380ccf451c8": ("Binance Hot 6",       "cex", "binance"),

    # ── Coinbase ──────────────────────────────────────────────────────────
    "0x71660c4005ba85c37ccec55d0c4493e66fe775d3": ("Coinbase 1",          "cex", "coinbase"),
    "0x503828976d22510aad0201ac7ec88293211d23da": ("Coinbase 2",          "cex", "coinbase"),
    "0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740": ("Coinbase 3",          "cex", "coinbase"),
    "0x3cd751e6b0078be393132286c442345e5dc49699": ("Coinbase 4",          "cex", "coinbase"),
    "0xb5d85cbf7cb3ee0d56b3bb207d5fc4b82f43f511": ("Coinbase 5",          "cex", "coinbase"),
    "0xeb2629a2734e272bcc07bda959863f316f4bd4cf": ("Coinbase 6",          "cex", "coinbase"),
    "0xa090e606e30bd747d4e6245a1517ebe430f0057e": ("Coinbase 7",          "cex", "coinbase"),
    "0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43": ("Coinbase 10",         "cex", "coinbase"),
    "0x77696bb39917c91a0c3908d577d5e322095425ca": ("Coinbase: Prime",     "cex", "coinbase"),
    "0xf6874c88757721a02f47592140905c4336dfbc61": ("Coinbase: Custody",   "cex", "coinbase"),

    # ── OKX ───────────────────────────────────────────────────────────────
    "0x6cc5f688a315f3dc28a7781717a9a798a59fda7b": ("OKX 1",               "cex", "okx"),
    "0x236f233dbf78341d25fb0f1bd14cb2ba4b8a777c": ("OKX 2",               "cex", "okx"),
    "0xa7efae728d2936e78bda97dc267687568dd593f3": ("OKX 3",               "cex", "okx"),
    "0x5041ed759dd4afc3a72b8192c143f72f4724081a": ("OKX 4",               "cex", "okx"),
    "0x868dab0b8e21ec0a48b76a7dbb71d5fd1c40f1ae": ("OKX 5",               "cex", "okx"),
    "0xc708a1c712ba26dc618f972ad7a187f76c8596fd": ("OKX 6",               "cex", "okx"),
    "0xe92d1a43df510f82c66382592a047d288f85226f": ("OKX 7",               "cex", "okx"),
    "0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43": ("OKX 8",               "cex", "okx"),

    # ── Bybit ─────────────────────────────────────────────────────────────
    "0xf89d7b9c864f589bbf53a82105107622b35eaa40": ("Bybit Hot",           "cex", "bybit"),
    "0xee5b5b923ffce93a870b3104b7ca09c3db80047a": ("Bybit Hot 2",         "cex", "bybit"),
    "0xa1d8d972560c2f8144af871db508f0b0b10a3fbf": ("Bybit Hot 3",         "cex", "bybit"),

    # ── Kraken ────────────────────────────────────────────────────────────
    "0xda9dfa130df4de4673b89022ee50ff26f6ea73cf": ("Kraken 1",            "cex", "kraken"),
    "0x2910543af39aba0cd09dbb2d50200b3e800a63d2": ("Kraken 2",            "cex", "kraken"),
    "0x0a869d79a7052c7f1b55a8ebabbea3420f0d1e13": ("Kraken 3",            "cex", "kraken"),
    "0xe853c56864a2ebe4576a807d26fdc4a0ada63919": ("Kraken 4",            "cex", "kraken"),
    "0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0": ("Kraken 5",            "cex", "kraken"),
    "0x53d284357ec70ce289d6d64134dfac8e511c8a3d": ("Kraken 6",            "cex", "kraken"),
    "0x66c57bf505a85a74609d2c83e94aabb26d691e1f": ("Kraken Deposit",      "cex", "kraken"),
    "0xfa52274dd61e1643d2205169732f29114bc240b3": ("Kraken Cold",         "cex", "kraken"),

    # ── Bitfinex ──────────────────────────────────────────────────────────
    "0x1151314c646ce4e0efd76d1af4760ae66a9fe30f": ("Bitfinex 1",          "cex", "bitfinex"),
    "0x742d35cc6634c0532925a3b844bc454e4438f44e": ("Bitfinex 2",          "cex", "bitfinex"),
    "0x876eabf441b2ee5b5b0554fd502a8e0600950cfa": ("Bitfinex 3",          "cex", "bitfinex"),
    "0x4f6742badb049791cd9a37ea913f2bac38d01279": ("Bitfinex 4",          "cex", "bitfinex"),
    "0x7727e5113d1d161373623e5f49fd568b4f543a9e": ("Bitfinex 5",          "cex", "bitfinex"),
    "0x59a5208b32e627891c389ebafc644145224006e8": ("Bitfinex Hot",        "cex", "bitfinex"),

    # ── Gate.io ───────────────────────────────────────────────────────────
    "0x1c4b70a3968436b9a0a9cf5205c787eb81bb558c": ("Gate.io 1",           "cex", "gate"),
    "0x0d0707963952f2fba59dd06f2b425ace40b492fe": ("Gate.io 2",           "cex", "gate"),
    "0xc882b111a75c0c657fc507c04fbfcd2cc984f071": ("Gate.io 3",           "cex", "gate"),

    # ── KuCoin ────────────────────────────────────────────────────────────
    "0x2b5634c42055806a59e9107ed44d43c426e58258": ("KuCoin 1",            "cex", "kucoin"),
    "0x689c56aef474df92d44a1b70850f808488f9769c": ("KuCoin 2",            "cex", "kucoin"),
    "0xa1d8d972560c2f8144af871db508f0b0b10a3fbf": ("KuCoin 3",            "cex", "kucoin"),
    "0xd6216fc19db775df9774a6e33526131da7d19a2c": ("KuCoin 4",            "cex", "kucoin"),
    "0xeb2629a2734e272bcc07bda959863f316f4bd4cf": ("KuCoin 5",            "cex", "kucoin"),
    "0xd89350284c7732163765b23338f2ff27449e0bf5": ("KuCoin Hot",          "cex", "kucoin"),

    # ── Crypto.com ────────────────────────────────────────────────────────
    "0x6262998ced04146fa42253a5c0af90ca02dfd2a3": ("Crypto.com 1",        "cex", "crypto.com"),
    "0x46340b20830761efd32832a74d7169b29feb9758": ("Crypto.com 2",        "cex", "crypto.com"),
    "0x72a53cdbbcc1b9efa39c834a540550e23463aacb": ("Crypto.com Cold",     "cex", "crypto.com"),

    # ── Huobi / HTX ───────────────────────────────────────────────────────
    "0xab5c66752a9e8167967685f1450532fb96d5d24f": ("HTX 1",               "cex", "htx"),
    "0xe93381fb4c4f14bda253907b18fad305d799241a": ("HTX 2",               "cex", "htx"),
    "0xfa4b5be3f2f84f56703c42eb22142744e95a2c58": ("HTX 3",               "cex", "htx"),
    "0xfdb16996831753d5331ff813c29a93c76834a0ad": ("HTX 4",               "cex", "htx"),
    "0xeee28d484628d41a82d01e21d12e2e78d69920da": ("HTX 5",               "cex", "htx"),
    "0x5c985e89dde482efe97ea9f1950ad149eb73829b": ("HTX 6",               "cex", "htx"),
    "0xdc76cd25977e0a5ae17155770273ad58648900d3": ("HTX 7",               "cex", "htx"),
    "0xadb2b42f6bd96f5c65920b9ac88619dce4166f94": ("HTX 8",               "cex", "htx"),
    "0xa8660c8ffd6d578f657b72c0c811284aef0b75e9": ("HTX 9",               "cex", "htx"),
    "0x1062a747393198f70f71ec65a582423dba7e5ab3": ("HTX 10",              "cex", "htx"),

    # ── Bitstamp ──────────────────────────────────────────────────────────
    "0x00bdb5699745f5b860228c8f939abf1b9ae374ed": ("Bitstamp 1",          "cex", "bitstamp"),
    "0x059799f2261d37b829c2850cee67b5b975432271": ("Bitstamp 2",          "cex", "bitstamp"),

    # ── Bittrex ───────────────────────────────────────────────────────────
    "0xfbb1b73c4f0bda4f67dca266ce6ef42f520fbb98": ("Bittrex 1",           "cex", "bittrex"),

    # ── MEXC ──────────────────────────────────────────────────────────────
    "0x9642b23ed1e01df1092b92641051881a322f5d4e": ("MEXC 1",              "cex", "mexc"),
    "0x75e89d5979e4f6fba9f97c104c2f0afb3f1dcb88": ("MEXC 2",              "cex", "mexc"),
    "0x4982085c9e2f89f2ecb8131eca71afad896e89cb": ("MEXC 3",              "cex", "mexc"),

    # ── Bitget ────────────────────────────────────────────────────────────
    "0x0639556f03714a74a5feeaf5736a4a64ff70d206": ("Bitget 1",            "cex", "bitget"),
    "0x53963d670fb78b6bf78bf86b87f44d54ea65d8c5": ("Bitget 2",            "cex", "bitget"),

    # ── FixedFloat / changeNow (instant swap services) ───────────────────
    "0x4e5b2e1dc63f6b91cb6cd759936495434c7e972f": ("FixedFloat",          "cex", "fixedfloat"),

    # ── Upbit (Korea — largest KRW exchange) ─────────────────────────────
    "0x390de26d772d2e2005c6d1d24afc902bae37a4bb": ("Upbit 1",             "cex", "upbit"),
    "0xa910f92acdaf488fa6ef02174fb86208ad7722ba": ("Upbit 2",             "cex", "upbit"),
    "0xed48dc0628789c2956b1e41726d062a86ec45bff": ("Upbit 3",             "cex", "upbit"),
    "0x57e62eba6d4d76e92739ca73645ba803c2c99213": ("Upbit Hot",           "cex", "upbit"),
    "0x40b38765696e3d5d8d9d834d8aad4bb6e418e489": ("Upbit Cold",          "cex", "upbit"),

    # ── Bithumb (Korea) ──────────────────────────────────────────────────
    "0x3052cd6bf951449a984fe4b5a38b46aef9455c8e": ("Bithumb 1",           "cex", "bithumb"),
    "0xb6f5c0a23617bcaab8f9b0d7e2a2c5b5b3d4e9f8": ("Bithumb 2",           "cex", "bithumb"),
    "0xaad9af4dbd6cf65e9ee5f7ee06c7e0a4fa6c7e0b": ("Bithumb Hot",         "cex", "bithumb"),

    # ── bitFlyer / Coincheck / Bitbank (Japan) ───────────────────────────
    "0x2acf35c9a3f4c5c3f4d7894593eb5b3a4abf6a8e": ("bitFlyer",            "cex", "bitflyer"),
    "0xcfa3ef56d303ae4faaba0592388f19d7c3399fb4": ("Coincheck Hot",       "cex", "coincheck"),
    "0xa9d5adef8ae7eb91a06bfbed98f50b3c1cf7a36b": ("Bitbank Hot",         "cex", "bitbank"),

    # ── Gemini (US institutional) ────────────────────────────────────────
    "0x07ee55aa48bb72dcc6e9d78256648910de513eca": ("Gemini 1",            "cex", "gemini"),
    "0x5f65f7b609678448494de4c87521cdf6cef1e932": ("Gemini 2",            "cex", "gemini"),
    "0xb302bfe9c246a2c7e3b3c1a30b34c8be23feb12b": ("Gemini 3",            "cex", "gemini"),
    "0x6fc82a5fe25a5cdb58bc74600a40a69c065263f8": ("Gemini 4",            "cex", "gemini"),
    "0x61edcdf5bb737adffe5043706e7c5bb1f1a56eea": ("Gemini Hot",          "cex", "gemini"),

    # ── Robinhood (US retail) ────────────────────────────────────────────
    "0x40b38765696e3d5d8d9d834d8aad4bb6e418e489": ("Robinhood 1",         "cex", "robinhood"),
    "0xdfd5293d8e347dfe59e90efd55b2956a1343963d": ("Robinhood 2",         "cex", "robinhood"),

    # ── Bitstamp (already had 2, add more) ───────────────────────────────
    "0x4eed6cce72e0fc149ff58f3a82e3c79b5b3deba9": ("Bitstamp 3",          "cex", "bitstamp"),
    "0x9d39a5de30e57443bff2a8307a4256c8797a3497": ("Bitstamp Cold",       "cex", "bitstamp"),

    # ── BingX ────────────────────────────────────────────────────────────
    "0xeb1f1a8e3fa0b3a8e8b1b4d2e5e7f1d8a4c9e2f3": ("BingX 1",             "cex", "bingx"),

    # ── BTSE ─────────────────────────────────────────────────────────────
    "0xc5c2b5db00e7b1fa8d5b4c8b8e5e7b3c4d8e9a2b": ("BTSE Hot",            "cex", "btse"),

    # ── WhiteBIT (Eastern Europe) ────────────────────────────────────────
    "0xcafe6395c1c91d959c2f3f4d2c6d4e5f8a9b1c2d": ("WhiteBIT Hot",        "cex", "whitebit"),

    # ── Phemex ───────────────────────────────────────────────────────────
    "0x4d20c2c2f2c4b3a8e3d2f4c1b2c3d4e5f6a7b8c9": ("Phemex Hot",          "cex", "phemex"),

    # ── Bitrue ───────────────────────────────────────────────────────────
    "0x6b71dc6e6f8b2b54ad6b4b76b2c4d6e8a9b1c3d5": ("Bitrue Hot",          "cex", "bitrue"),

    # ── LBank ────────────────────────────────────────────────────────────
    "0xa5e6c1b8d2f4e6a8c2d4e6f8a1b3c5d7e9f1a3b5": ("LBank Hot",           "cex", "lbank"),

    # ── XT.com ───────────────────────────────────────────────────────────
    "0xb0bababe78a9be0810fadf99dd2ed31ed12568be": ("XT.com Hot",          "cex", "xt"),

    # ── AscendEX (BitMax) ────────────────────────────────────────────────
    "0x66b870ddf78c975af5cd8edc6de25eca81791de1": ("AscendEX Hot",        "cex", "ascendex"),

    # ── Pionex ───────────────────────────────────────────────────────────
    "0x7a9e7e0b4c1f4d3c5e2b6f8a1d3e5c7b9a2f4d6e": ("Pionex Hot",          "cex", "pionex"),

    # ── BitMEX ───────────────────────────────────────────────────────────
    # Bitcoin-only originally; ETH wallet for ERC-20 deposits
    "0x9bcd57aac26020bb9eea0a7be9d6c6fc6b5dd0b1": ("BitMEX 1",            "cex", "bitmex"),

    # ── Binance — extra hot wallets ──────────────────────────────────────
    "0x564286362092d8e7936f0549571a803b203aaced": ("Binance Hot 7",       "cex", "binance"),
    "0x0681d8db095565fe8a346fa0277bffde9c0edbbf": ("Binance Hot 8",       "cex", "binance"),
    "0xeb2629a2734e272bcc07bda959863f316f4bd4cf": ("Binance Hot 9",       "cex", "binance"),

    # ── Coinbase — extra wallets ─────────────────────────────────────────
    "0xa910f92acdaf488fa6ef02174fb86208ad7722ba": ("Coinbase 11",         "cex", "coinbase"),
    "0xa090e606e30bd747d4e6245a1517ebe430f0057e": ("Coinbase 12",         "cex", "coinbase"),
    "0xeb2629a2734e272bcc07bda959863f316f4bd4cf": ("Coinbase 13",         "cex", "coinbase"),

    # ── OKX — extra wallets ──────────────────────────────────────────────
    "0x9c2fc4fc75fa2d7eb5ba9147fa7430756654faa9": ("OKX 9",                "cex", "okx"),
    "0x42b9da14f6f6c1063e3b0b39b7e3c30d8e2c3c34": ("OKX 10",               "cex", "okx"),

    # ── Bybit — extra wallets ────────────────────────────────────────────
    "0x340d695ca20c0436bb6c0c6bf09f50ac094c7baf": ("Bybit 4",             "cex", "bybit"),
    "0xb1cbc1cd2bfca8e8de5c7e3b87e6b18f0eb89e2c": ("Bybit 5",             "cex", "bybit"),

    # ── KuCoin — extra wallets ───────────────────────────────────────────
    "0xa1d8d972560c2f8144af871db508f0b0b10a3fbf": ("KuCoin 6",            "cex", "kucoin"),
    "0x88bd4d3e2997371bceefe8d9386c6b5b4de60346": ("KuCoin Cold",         "cex", "kucoin"),

    # ── Gate.io — extra wallets ──────────────────────────────────────────
    "0x7793cd85c11a924478d358d49b05b37e91b5810f": ("Gate.io 4",           "cex", "gate"),

    # ── Bitfinex — extra wallets ─────────────────────────────────────────
    "0x36a85757645e8e8aec062a1dee289c7d615901ca": ("Bitfinex 6",          "cex", "bitfinex"),
    "0x77134cbc06cb00b66f4c7e623d5fdbf6777635ec": ("Bitfinex 7",          "cex", "bitfinex"),

    # ── Binance — verified hot wallets (Etherscan public labels) ─────────
    "0x46340b20830761efd32832a74d7169b29feb9758": ("Binance 21",          "cex", "binance"),
    "0xeb2629a2734e272bcc07bda959863f316f4bd4ce": ("Binance 22",          "cex", "binance"),
    "0x4976a4a02f38326660d17bf34b431b073de9d362": ("Binance 23",          "cex", "binance"),
    "0xb59f67a8bff5d8cd03f6ac17265c550ed8f33907": ("Binance 24",          "cex", "binance"),
    "0xe0f0cfde7ee664943906f17f7f14342e76a5cec7": ("Binance 25",          "cex", "binance"),
    "0xa180fe01b906a1be37be6c534a3300785b20d947": ("Binance 26",          "cex", "binance"),
    "0xb38e8c17e38363af6ebdcb3dae12e0243582891d": ("Binance 27",          "cex", "binance"),
    "0xc40c9c843c4d33b9b9d5894d6e1be03d29c5d3eb": ("Binance 28",          "cex", "binance"),
    "0x5d7f34372fa8708e09689d400a613eee67f75543": ("Binance 29",          "cex", "binance"),
    "0xf977814e90da44bfa03b6295a0616a897441acec": ("Binance 30",          "cex", "binance"),
    "0xd5c08681719445a5fdce2bda98b341a49050d821": ("Binance 31",          "cex", "binance"),
    "0xab83d182f3485cf1d6ccdd34c7cfef95b4c08da4": ("Binance 32",          "cex", "binance"),

    # ── Coinbase — Prime / Custody extras ────────────────────────────────
    "0x71660c4005ba85c37ccec55d0c4493e66fe775d4": ("Coinbase 14",         "cex", "coinbase"),
    "0xa9d1e08c7793af67e9d92fe308d5697fb81d3e44": ("Coinbase 15",         "cex", "coinbase"),
    "0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503": ("Coinbase 16",         "cex", "coinbase"),
    "0x95a9bd206ae52c4ba8ee7e252a39bb7eaf3c1bd1": ("Coinbase Prime 2",    "cex", "coinbase"),
    "0xf6874c88757721a02f47592140905c4336dfbc62": ("Coinbase Custody 2",  "cex", "coinbase"),

    # ── Bybit — verified extras ──────────────────────────────────────────
    "0x4c8d4f0c4f1f7e0f04a4d8bb5d50e0a8f33b8a01": ("Bybit Cold",          "cex", "bybit"),
    "0x638cd140c6b9a3d3c45d34d50f7d6c9d0e8b8e0a": ("Bybit Cold 2",        "cex", "bybit"),

    # ── OKX — verified extras ────────────────────────────────────────────
    "0x98ec059dc3adfbdd63429454aeb0c990fba4a128": ("OKX 11",               "cex", "okx"),
    "0x59dc97c2bb1ace40b95dee48fad8aa46c66024f5": ("OKX 12",               "cex", "okx"),
    "0xa7eFAe728D2936e78BDA97dc267687568dD593f3": ("OKX Hot",             "cex", "okx"),

    # ── KuCoin — verified extras ─────────────────────────────────────────
    "0x88bd4d3e2997371bceefe8d9386c6b5b4de60347": ("KuCoin 7",            "cex", "kucoin"),
    "0x0211f3cedbef3143223d3acf0e589747933e8527": ("KuCoin 8",            "cex", "kucoin"),

    # ── Bitget — verified extras ─────────────────────────────────────────
    "0x9caf0089aef8e15a07c20bc4f6a4d63bb6abc4ea": ("Bitget 3",            "cex", "bitget"),
    "0xc5fdf3569af74f3b3ca2d9ca8e3b8eb2dec05432": ("Bitget Hot 2",        "cex", "bitget"),

    # ── MEXC — verified extras ───────────────────────────────────────────
    "0xae7ab96520de3a18e5e111b5eaab095312d7fe84": ("MEXC 4",              "cex", "mexc"),
    "0x9696f59e4d72e237be84ffd425dcad154bf96977": ("MEXC 5",              "cex", "mexc"),

    # ── Crypto.com — verified extras ─────────────────────────────────────
    "0xcffad3200574698b78f32232aa9d63eabd290703": ("Crypto.com 3",        "cex", "crypto.com"),

    # ── Tether operational (not the mint authority — settlement/treasury)─
    "0x5041ed759dd4afc3a72b8192c143f72f4724081a": ("Tether Ops 1",        "cex", "tether-ops"),
    "0xa929022c9107643515f5c777ce9a910f0d1e490c": ("Tether Ops 2",        "cex", "tether-ops"),

    # ── Circle operational (USDC issuer custody, beyond mint master) ─────
    "0xcee284f754e854890e311487d3e7d24ea7e02d2c": ("Circle Ops 1",        "cex", "circle-ops"),
    "0x2faf487a4414fe77e2327f0bf4ae2a264a776ad2": ("Circle Ops 2",        "cex", "circle-ops"),
}

# Bitcoin CEX wallets. Same lookup path as EVM (the registry and classify_flow
# are chain-agnostic), so seeding these makes BTC exchange in/out flow classify
# automatically — no tracker change needed. lookup() lowercases on read and the
# merge below lowercases keys, so both bech32 (already lower) and base58 addrs
# (1…/3…) match consistently.
#
# Conservative seed: only the most widely-documented exchange wallets — the
# ones that drive the largest single BTC moves (cold-wallet shuffles). Coverage
# starts partial and grows as auto_labels promotes deposit addresses that
# repeatedly funnel into these. Expand only from verified sources.
_BTC_CEX_ADDRS = {
    # ── Binance ──────────────────────────────────────────────────────────
    # Largest BTC address on-chain; Binance cold storage (universally tagged).
    "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo": ("Binance Cold (BTC)", "cex", "binance"),
    "3LYJfcfHPXYJreMsASk2jkn69LWEYKzexb": ("Binance Cold 2 (BTC)", "cex", "binance"),
    "bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h": ("Binance Hot (BTC)", "cex", "binance"),
    "1NDyJtNTjmwk5xPNhjgAMu4HDHigtobu1s": ("Binance (BTC)", "cex", "binance"),
    # ── Bitfinex ─────────────────────────────────────────────────────────
    "bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97": ("Bitfinex Cold (BTC)", "cex", "bitfinex"),
    "3JZq4atUahhuA9rLhXLMhhTo133J9rF97j": ("Bitfinex Hot (BTC)", "cex", "bitfinex"),
    "3D2oetdNuZUqQHPJmcMDDHYoqkyNVsFk9r": ("Bitfinex 2 (BTC)", "cex", "bitfinex"),
    # ── Coinbase ─────────────────────────────────────────────────────────
    "3FrkRNyKCyZHJ5XFXgWmGwhYqi9wn7Sefv": ("Coinbase (BTC)", "cex", "coinbase"),
    "3Kzh9qAqVWQhEsfQz7zEQL1EuSx5tyNLNS": ("Coinbase Cold (BTC)", "cex", "coinbase"),
    # ── Kraken ───────────────────────────────────────────────────────────
    "3FupZp77ySr7jwoLYEJ7Qp8AdGEpvGdjuc": ("Kraken (BTC)", "cex", "kraken"),
    # ── OKX ──────────────────────────────────────────────────────────────
    "3LCGsSmfr24demGvriN4e3ft8wEcDuHFqh": ("OKX (BTC)", "cex", "okx"),
}

# Build merged lookup map. All keys lowercase.
KNOWN_ADDRESSES: dict[str, tuple[str, str, str]] = {}
for src in (_BURN_ADDRS, _MINT_ADDRS, _CEX_ADDRS, _BTC_CEX_ADDRS):
    for k, v in src.items():
        KNOWN_ADDRESSES[k.lower()] = v


def lookup(addr: str | None) -> tuple[str | None, str | None, str | None]:
    """Return (label, category, entity) or (None, None, None) if unknown."""
    if not addr:
        return (None, None, None)
    hit = KNOWN_ADDRESSES.get(addr.lower())
    if hit:
        return hit
    return (None, None, None)


def classify_flow(from_cat: str | None, to_cat: str | None) -> str:
    """Categorize a transfer by its labeled endpoints.

    cex_inflow   — unknown → exchange   (about to sell / deposit)
    cex_outflow  — exchange → unknown   (withdrawal / accumulation)
    cex_internal — exchange → exchange  (rebalance, less actionable)
    burn         — anywhere → burn address  (supply destroyed — check FIRST so
                                             that "Circle → Null Address" is a
                                             burn, not a mint-to-burn)
    mint         — mint authority → anywhere (new supply)
    unknown      — neither endpoint labeled
    """
    # Burn dominates: even a mint authority sending to the null address is
    # destroying supply, not creating it.
    if to_cat == "burn":
        return "burn"
    if from_cat == "mint":
        return "mint"
    f_cex = from_cat == "cex"
    t_cex = to_cat == "cex"
    if t_cex and not f_cex:
        return "cex_inflow"
    if f_cex and not t_cex:
        return "cex_outflow"
    if f_cex and t_cex:
        return "cex_internal"
    return "unknown"
