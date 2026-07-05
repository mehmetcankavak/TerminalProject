"""Compass çıktısından setup + risk uyarıları türeten kural tabanlı advisor.

Her şey deterministic — ML yok, LLM yok. Bir kural tetiklenmedi mi kart boş
kalsın yerine `RANGE` default'una düşer, kullanıcı her zaman bir okuma görür.

Kart hiçbir zaman "AL/SAT" demez, finansal tavsiye sınırını aşmaz. Söylediği
şey **durum tespiti** ve **ne izlenmeli** — kullanıcı kararı kendi verir.
"""
from __future__ import annotations



# ───────────────────────────────────────────────────────────── setup detection

def _detect_setup(c: dict, master: float, momentum: dict, agree: int, diverge: int) -> dict:
    """Sırayla daha güçlü koşullara bak, ilk eşleşeni dön. Hiçbiri yoksa RANGE."""
    sm_c = c.get("smart_money") or {}
    sm   = sm_c.get("score") or 0
    sm_fills     = sm_c.get("fills_score")
    sm_positions = sm_c.get("positions_score")
    bt   = (c.get("big_transfers") or {}).get("score") or 0
    fd   = (c.get("funding") or {}).get("score") or 0       # contrarian: + = oversold
    lq   = (c.get("liquidations") or {}).get("score") or 0  # contrarian: + = long flush
    vol  = (c.get("volume") or {}).get("score") or 0

    mom_label = (momentum or {}).get("label") if (momentum or {}).get("available") else None

    # CAPITULATION_BOTTOM — long flush + heavy selling + funding oversold
    # Tarihsel olarak orta vadeli dipler bu kombinasyonla geliyor.
    if lq > 0.5 and vol < -0.4 and fd > 0.3:
        return {
            "key": "CAPITULATION_BOTTOM",
            "title": "PANİK SATIŞI",
            "tone": "contrarian_bull",
            "message": (
                "Zorla long likidasyonları + geniş satış baskısı + aşırı negatif funding. "
                "Tarihsel olarak orta vadeli dönüş zemini, ama henüz erken. "
                "BTC'nin tutunmasını ve volume'ün soğumasını bekle."
            ),
            "reasons": [
                f"Long likidasyon yoğun (skor {lq:+.2f})",
                f"Geniş satış baskısı (volume {vol:+.2f})",
                f"Aşırı negatif funding (skor {fd:+.2f})",
            ],
        }

    # DISTRIBUTION_TOP — funding euphoric + whales reducing + still some volume
    # Aşırı kaldıraçlı kalabalık + akıllı para çıkışı = lokal tepe sinyali.
    if fd < -0.3 and sm < 0 and lq < -0.2:
        return {
            "key": "DISTRIBUTION_TOP",
            "title": "TEPE UYARISI",
            "tone": "contrarian_bear",
            "message": (
                "Aşırı pozitif funding + akıllı para azaltıyor + short likidasyonları sürüyor. "
                "Geç kalan long'lar için riskli zemin. Long açma; pozisyonun varsa stop'unu yukarı çek."
            ),
            "reasons": [
                f"Aşırı pozitif funding (skor {fd:+.2f}, contrarian)",
                f"Akıllı para azaltıyor (skor {sm:+.2f})",
                f"Short likidasyon zinciri (skor {lq:+.2f})",
            ],
        }

    # SM_DIVERGENCE — fills and live positions disagree.
    # Fills bullish + positions still short → balinalar short kapatıyor (sıkışma,
    # ama yeni long değil). Tersi durumda → balinalar kar realize ediyor.
    if (sm_fills is not None and sm_positions is not None
            and abs(sm_fills) > 0.25 and abs(sm_positions) > 0.25
            and (sm_fills > 0) != (sm_positions > 0)):
        if sm_fills > 0 and sm_positions < 0:
            return {
                "key": "SM_DIVERGENCE_UNWIND_SHORTS",
                "title": "BALINA SHORT KAPATIYOR",
                "tone": "contrarian_bull",
                "message": (
                    "Balina fills bullish ama net pozisyonları hâlâ short. "
                    "Yani yeni long açmıyorlar — mevcut shortları kapatıyorlar. "
                    "Sıkışma rallisi olabilir, kalıcı trend değil. Kovalama, "
                    "geri çekilmede izle."
                ),
                "reasons": [
                    f"Fills skoru {sm_fills:+.2f} (alımda)",
                    f"Pozisyonlar skoru {sm_positions:+.2f} (hâlâ net short)",
                ],
            }
        else:
            return {
                "key": "SM_DIVERGENCE_TAKE_PROFIT",
                "title": "BALINA KAR REALİZE",
                "tone": "contrarian_bear",
                "message": (
                    "Balina fills bearish ama net pozisyonları hâlâ long. "
                    "Yani yeni short açmıyorlar — mevcut longları azaltıyorlar. "
                    "Lokal tepe işareti olabilir. Yeni long açma, mevcutsa "
                    "stop'u sıkılaştır."
                ),
                "reasons": [
                    f"Fills skoru {sm_fills:+.2f} (satışta)",
                    f"Pozisyonlar skoru {sm_positions:+.2f} (hâlâ net long)",
                ],
            }

    # EARLY_ACCUMULATION — broad buying + whales joining + funding not euphoric yet
    if vol > 0.4 and sm > 0.2 and fd > -0.1 and (bt > 0 or lq > 0):
        return {
            "key": "EARLY_ACCUMULATION",
            "title": "ERKEN BİRİKİM",
            "tone": "bullish",
            "message": (
                "Geniş alım baskısı + akıllı para katılıyor + funding henüz aşırı değil. "
                "Momentum trade için uygun zemin. Pozisyon açacaksan stop seviyeni belirle, "
                "kaldıraçla acele etme."
            ),
            "reasons": [
                f"Volume × price BULLISH (skor {vol:+.2f})",
                f"Akıllı para alımda (skor {sm:+.2f})",
                f"Funding euphoric değil (skor {fd:+.2f})",
            ],
        }

    # TREND_CONTINUATION_BULL — overall bullish, multiple confirmations, fresh momentum
    if (master > 0.25 and vol > 0.2 and agree >= 3
            and mom_label in ("RISING", "ACCELERATING")):
        return {
            "key": "TREND_CONTINUATION",
            "title": "TREND DEVAMI",
            "tone": "bullish",
            "message": (
                "Master skor pozitif, bileşenlerin çoğu aynı yönde, ivme taze. "
                "Trend devamı senaryosu güçlü. Mevcut long pozisyonları tut, "
                "yeni giriş için pullback'leri izle."
            ),
            "reasons": [
                f"Master skor {master:+.2f}",
                f"{agree} bileşen aynı yönde",
                f"İvme: {mom_label}",
            ],
        }

    # TREND_CONTINUATION_BEAR — symmetric bearish version
    if (master < -0.25 and vol < -0.2 and agree >= 3
            and mom_label in ("RISING", "ACCELERATING")):
        return {
            "key": "TREND_CONTINUATION",
            "title": "DÜŞÜŞ DEVAMI",
            "tone": "bearish",
            "message": (
                "Master skor negatif, bileşenlerin çoğu aynı yönde, ivme taze. "
                "Düşüş devamı senaryosu güçlü. Long açma; mevcut pozisyonun varsa "
                "stop'u takip et."
            ),
            "reasons": [
                f"Master skor {master:+.2f}",
                f"{agree} bileşen aynı yönde",
                f"İvme: {mom_label}",
            ],
        }

    # RANGE / DIVERGENT — default state
    if diverge >= 2 or abs(master) < 0.15:
        return {
            "key": "RANGE",
            "title": "RANGE / BELİRSİZ",
            "tone": "neutral",
            "message": (
                "Bileşenler çelişiyor veya master skor sıfıra yakın. "
                "Trend trade dönemi değil — range strateji uygula, breakout'u bekle. "
                "Düşük kaldıraçla scalp ya da bekleme önerilir."
            ),
            "reasons": (
                [f"{diverge} bileşen ters yönde"] if diverge >= 2
                else [f"Master skor sıfıra yakın ({master:+.2f})"]
            ),
        }

    # Fallback — directional but not strong enough for explicit setup
    direction = "BULLISH" if master > 0 else "BEARISH"
    return {
        "key": "MILD_DIRECTIONAL",
        "title": f"HAFİF {direction}",
        "tone": "bullish" if master > 0 else "bearish",
        "message": (
            "Yön belirgin ama bileşenler yeterince hizalanmadı. "
            "Erken giriş yerine bir bileşenin daha onaylamasını bekleyebilirsin."
        ),
        "reasons": [f"Master skor {master:+.2f}, {agree} bileşen aynı yönde"],
    }


# ──────────────────────────────────────────────────────────────────── risks

def _detect_risks(c: dict) -> list[dict]:
    """Bağımsız tetiklenen uyarı listesi. Bir setup'la çakışabilir — sorun değil,
    setup büyük resim, risk operasyonel uyarı."""
    risks: list[dict] = []

    fd = (c.get("funding") or {})
    fd_score = fd.get("score") or 0
    over     = fd.get("overbought") or 0
    under    = fd.get("oversold") or 0
    if fd_score < -0.3 and over > max(1, under) * 1.5:
        risks.append({
            "key": "HIGH_LONG_LEVERAGE",
            "title": "Yüksek long kaldıracı",
            "message": (
                f"{over} sembolde funding pozitif (overbought), {under} sembolde negatif. "
                "Long pozisyon açıyorsan likidasyon haritasını kontrol et — "
                "ters squeeze riski yüksek."
            ),
        })

    lq = (c.get("liquidations") or {})
    long_l  = lq.get("long")  or 0
    short_l = lq.get("short") or 0
    if long_l > 0 and short_l > 0 and long_l > short_l * 2:
        risks.append({
            "key": "LONG_FLUSH_ACTIVE",
            "title": "Long likidasyon dalgası",
            "message": (
                f"Son 24s'de long likidasyonlar (${long_l:,.0f}) short'ları "
                f"(${short_l:,.0f}) 2x'in üstünde aşıyor. "
                "Bıçağı yakalamaya çalışma; volume soğumadan bottom call yapma."
            ),
        })
    elif short_l > 0 and long_l > 0 and short_l > long_l * 2:
        risks.append({
            "key": "SHORT_SQUEEZE_ACTIVE",
            "title": "Short squeeze sürüyor",
            "message": (
                f"Short likidasyonlar (${short_l:,.0f}) long'ları "
                f"(${long_l:,.0f}) 2x'in üstünde aşıyor. "
                "Squeeze tepelerinde geç kalmış long açma — dönüş riski artar."
            ),
        })

    etf = (c.get("etf") or {})
    etf_score = etf.get("score")
    vol_score = (c.get("volume") or {}).get("score") or 0
    if etf.get("available") and etf_score is not None:
        if etf_score < -0.5 and vol_score > 0.3:
            risks.append({
                "key": "TRADFI_DIVERGENCE",
                "title": "TradFi çıkıyor, kripto-native alıyor",
                "message": (
                    "Spot ETF tarafı satış baskısında ama kripto-native hacim alımda. "
                    "Ralliler sınırlı kalabilir — TradFi dağıtımı bitmeden büyük pozisyon riskli."
                ),
            })

    sm = (c.get("smart_money") or {})
    sm_score = sm.get("score")
    if sm.get("available") and sm_score is not None:
        if sm_score < -0.3 and vol_score > 0.3:
            risks.append({
                "key": "RETAIL_VS_WHALES",
                "title": "Akıllı para tersine",
                "message": (
                    "Geniş alım baskısı var ama whale fill'ler net satış yönünde. "
                    "Retail FOMO sinyali olabilir — agresif long'a karşı dikkatli ol."
                ),
            })

    return risks


# ──────────────────────────────────────────────────────── "ne izle" katmanı

def _eval_condition(current: float, threshold: float, op: str) -> tuple[bool, float]:
    """Bir koşulu değerlendir → (tetiklendi mi, 0-1 yakınlık skoru).

    "Yakınlık" hesabı: koşulun eşiğinden span kadar uzakta 0, tam eşikte 1.
    Span = |threshold| veya 0.3 (hangisi büyükse) — küçük eşiklerde de
    anlamlı yakınlık çıksın diye.
    """
    span = max(abs(threshold), 0.3)
    if op == "gt":
        met = current > threshold
        progress = max(0.0, min(1.0, (current - (threshold - span)) / span))
    else:  # "lt"
        met = current < threshold
        progress = max(0.0, min(1.0, ((threshold + span) - current) / span))
    return met, progress


def _watch_for(key: str, title: str, hook_tmpl: str, tone: str,
               conds: list[dict], current_setup_key: str) -> dict | None:
    """Bir setup için yaklaşıklık kartı üret. Şu an aktif olan setup için None.
    Çok uzaktaki (avg < 0.55) veya zaten tetiklenmişe çok yakın (> 0.95) olanları atar."""
    if key == current_setup_key:
        return None
    evaluated = []
    for c in conds:
        met, prog = _eval_condition(c["current"], c["threshold"], c["op"])
        evaluated.append({
            "label": c["label"],
            "current": round(c["current"], 3),
            "threshold": c["threshold"],
            "op": c["op"],
            "met": met,
            "progress": round(prog, 2),
        })
    avg = sum(e["progress"] for e in evaluated) / len(evaluated)
    if avg < 0.55 or avg > 0.95:
        return None
    met_count = sum(1 for e in evaluated if e["met"])
    return {
        "key": key,
        "title": title,
        "tone": tone,
        "hook": hook_tmpl.format(met=met_count, total=len(evaluated)),
        "progress": round(avg, 2),
        "conditions": evaluated,
    }


def _compute_watch(c: dict, current_setup_key: str) -> list[dict]:
    """Tetiklenmeye yakın setup'ları üret, yakınlığa göre sırala, en fazla 2 dön."""
    sm  = (c.get("smart_money")   or {}).get("score") or 0
    bt  = (c.get("big_transfers") or {}).get("score") or 0
    fd  = (c.get("funding")       or {}).get("score") or 0
    lq  = (c.get("liquidations")  or {}).get("score") or 0
    vol = (c.get("volume")        or {}).get("score") or 0
    etf = (c.get("etf")           or {}).get("score") or 0

    candidates: list[dict] = []

    # CAPITULATION_BOTTOM watch
    w = _watch_for(
        "CAPITULATION_BOTTOM_WATCH", "DİP YAKLAŞIYOR",
        "{met}/{total} koşul tamam · long flush bekleniyor",
        "contrarian_bull",
        [
            {"label": "Long likidasyon yoğunluğu", "current": lq, "threshold":  0.5, "op": "gt"},
            {"label": "Geniş satış baskısı",       "current": vol, "threshold": -0.4, "op": "lt"},
            {"label": "Aşırı negatif funding",     "current": fd,  "threshold":  0.3, "op": "gt"},
        ],
        current_setup_key,
    )
    if w: candidates.append(w)

    # DISTRIBUTION_TOP watch
    w = _watch_for(
        "DISTRIBUTION_TOP_WATCH", "TEPE OLUŞABİLİR",
        "{met}/{total} koşul tamam · funding ve whale çıkışı izlemde",
        "contrarian_bear",
        [
            {"label": "Aşırı pozitif funding",  "current": fd, "threshold": -0.3, "op": "lt"},
            {"label": "Akıllı para azaltıyor",  "current": sm, "threshold":  0.0, "op": "lt"},
            {"label": "Short squeeze zinciri",  "current": lq, "threshold": -0.2, "op": "lt"},
        ],
        current_setup_key,
    )
    if w: candidates.append(w)

    # EARLY_ACCUMULATION watch
    w = _watch_for(
        "EARLY_ACCUMULATION_WATCH", "BİRİKİM BAŞLAYABİLİR",
        "{met}/{total} koşul tamam · alıcı tarafı toparlanıyor",
        "bullish",
        [
            {"label": "Volume × price BULLISH",     "current": vol, "threshold":  0.4, "op": "gt"},
            {"label": "Akıllı para alımda",         "current": sm,  "threshold":  0.2, "op": "gt"},
            {"label": "Funding euphoric değil",     "current": fd,  "threshold": -0.1, "op": "gt"},
            {"label": "On-chain veya likidasyon onay",
             "current": max(bt, lq), "threshold": 0.0, "op": "gt"},
        ],
        current_setup_key,
    )
    if w: candidates.append(w)

    # TRADFI_DIVERGENCE risk watch — risk olduğu için ayrı tonla göster
    w = _watch_for(
        "TRADFI_DIVERGENCE_WATCH", "TradFi divergence izlemde",
        "{met}/{total} koşul tamam · TradFi/kripto-native ayrışması olası",
        "risk",
        [
            {"label": "ETF tarafı bearish",        "current": etf, "threshold": -0.5, "op": "lt"},
            {"label": "Kripto-native hacim alımda","current": vol, "threshold":  0.3, "op": "gt"},
        ],
        current_setup_key,
    )
    if w: candidates.append(w)

    # En yakın ikisini al
    candidates.sort(key=lambda x: x["progress"], reverse=True)
    return candidates[:2]


# ────────────────────────────────────────────────────────────── public entry

def derive_advice(compass: dict) -> dict:
    """Compass output → advisor card (setup + risks + watch).

    Compass `available` değilse bile minimum RANGE döner ki UI boş kalmasın.
    """
    components = compass.get("components") or {}
    master     = float(compass.get("score") or 0)
    agree      = int(compass.get("agree_count") or 0)
    diverge    = int(compass.get("diverge_count") or 0)
    momentum   = compass.get("momentum") or {}

    setup = _detect_setup(components, master, momentum, agree, diverge)
    risks = _detect_risks(components)
    watch = _compute_watch(components, setup.get("key", ""))
    return {"setup": setup, "risks": risks, "watch": watch}
