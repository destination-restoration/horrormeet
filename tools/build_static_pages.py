#!/usr/bin/env python3
"""Build static, crawlable pages for HorrorMeet.

The Atlas, the Vault and the Séance live in Supabase and are drawn by
JavaScript, so search engines see little of them. This writes plain HTML:

  atlas/index.html             directory of every film and every place
  atlas/<id>-<slug>.html       one page per approved pin
  atlas/film/<slug>.html       "Where was <film> filmed?" for every film with pins
  vault/index.html             directory of every public domain film
  vault/<id>-<slug>.html       "Watch <film> free" with the Internet Archive player
  qa/<slug>.html               one page per published premiere Q&A or sitting
  sitemap.xml, robots.txt      at the site root

A GitHub Action (.github/workflows/rebuild-static.yml) runs this weekly and
commits any changes. Run by hand from the repo root:  python3 tools/build_static_pages.py
Street addresses and coordinates are deliberately not printed on Atlas pages;
each one links to the live map instead.
"""
import html, json, math, os, re, unicodedata, urllib.parse, urllib.request
from collections import defaultdict
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://horrormeet.com'
API = 'https://lwwtlsxvbzmddwdcbsnj.supabase.co/rest/v1/'
KEY = 'sb_publishable_HexDGBDO-zSLkasLjsR6rw__Vi8JMZD'
CSS_V = re.search(r'styles\.css\?v=(\d+)', open(os.path.join(ROOT, 'index.html')).read()).group(1)
TODAY = date.today().isoformat()

KIND_LABEL = {'film set': 'Filming location', 'haunted': 'Haunted place',
              'ghost town': 'Ghost town', 'prison': 'Abandoned and historic prison'}
KIND_PLURAL = {'film set': 'Horror filming locations', 'haunted': 'Haunted places',
               'ghost town': 'Ghost towns', 'prison': 'Prisons'}


def get(table, query):
    rows, start = [], 0
    while True:
        req = urllib.request.Request(API + table + '?' + query, headers={
            'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Range': f'{start}-{start + 999}'})
        batch = json.load(urllib.request.urlopen(req))
        rows += batch
        if len(batch) < 1000:
            return rows
        start += 1000


def fetch():
    rows, start = [], 0
    while True:
        url = (API + 'map_spots?select=id,title,kind,category,description,lat,lng,source_url'
               '&status=eq.approved&order=id')
        req = urllib.request.Request(url, headers={'apikey': KEY, 'Authorization': 'Bearer ' + KEY,
                                                   'Range': f'{start}-{start + 999}'})
        batch = json.load(urllib.request.urlopen(req))
        rows += batch
        if len(batch) < 1000:
            return rows
        start += 1000


def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')[:70] or 'place'


def e(s):
    return html.escape(s or '', quote=True)


FILM_RE = re.compile(r'^(.*?)\s*\(([^()]+)\)\s*$')


def split_film(title):
    """'Buntzen Lake North Beach (Freddy vs. Jason 2003)' -> place, film display, film key"""
    m = FILM_RE.match(title or '')
    if not m:
        return title, None, None
    place, film = m.group(1).strip(), m.group(2).strip()
    y = re.match(r'^(.*\S)\s+((?:18|19|20)\d\d)$', film)
    display = f'{y.group(1)} ({y.group(2)})' if y else film
    return place or title, display, film


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a['lat'], a['lng'], b['lat'], b['lng']))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(min(1, h)))


def shell(title, desc, canonical, body, depth, jsonld=None, tagline='the atlas of horror. every pin is a real place.', room='THE ATLAS', ref='atlas'):
    up = '../' * depth
    ld = f'<script type="application/ld+json">{json.dumps(jsonld)}</script>' if jsonld else ''
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{canonical}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{canonical}">
<meta property="og:site_name" content="HorrorMeet">
<meta property="og:image" content="{BASE}/icon-512.png">
<meta name="theme-color" content="#0b0b0e">
<link rel="icon" href="{up}icon-180.png">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Frijole&family=Rye&display=swap">
<link rel="stylesheet" href="{up}styles.css?v={CSS_V}">
<style>
  .at-crumb{{font-size:12.5px;color:var(--faint);margin:18px 0 6px}}
  .at-crumb a{{color:var(--dim)}}
  .at-h1{{font-family:'Frijole',Impact,fantasy;font-size:26px;line-height:1.25;color:var(--white);text-shadow:3px 3px 0 var(--red-deep);margin:4px 0 6px}}
  .at-kind{{font-family:'Rye',Georgia,serif;color:var(--red);font-size:12px;letter-spacing:.14em;text-transform:uppercase}}
  .at-body p{{color:var(--dim);font-size:15.5px;line-height:1.6;max-width:65ch}}
  .at-btns{{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0}}
  .at-list{{list-style:none;padding:0;margin:8px 0}}
  .at-list li{{border:2px solid var(--line);background:var(--panel);padding:10px 14px;margin:8px 0}}
  .at-list li a{{color:var(--white);font-weight:600}}
  .at-list li p{{margin:4px 0 0;color:var(--dim);font-size:14px;line-height:1.45}}
  .at-cols{{columns:2 260px;column-gap:24px;padding-left:18px}}
  .at-cols li{{margin:3px 0;break-inside:avoid}}
  .at-cols a{{color:var(--dim)}}
  .at-join{{border:2px dashed var(--red);background:var(--panel);padding:14px 16px;margin:26px 0 10px}}
  .at-join b{{color:var(--white)}}
  .at-h2{{font-family:'Rye',Georgia,serif;color:var(--white);font-size:19px;margin:28px 0 6px}}
  .at-transcript p{{font-size:14px;line-height:1.55;max-width:70ch}}
</style>
{ld}
</head>
<body>
<header class="app"><div class="tagline-bar"><div class="inner">{tagline}</div></div><div class="app-bar"><a class="logo" href="{up}index.html#home">HORRORMEET</a></div>
  <form class="sitesearch" action="{up}search.html" method="get" role="search">
    <input type="search" name="q" maxlength="80" placeholder="Search everything: a film, a haunted place, a name..." autocomplete="off" aria-label="Search HorrorMeet">
    <button type="submit" aria-label="Search">Search</button>
  </form>
</header>
<main class="wrap">
{body}
  <div class="at-join"><b>HorrorMeet is the horror fans' own site, free to join.</b> A mapped atlas of {{TOTAL}} real horror places, premiere Q&amp;As from the rooms most people never get into, a free library of public domain horror, and a shelf of independent films. <a class="btn" href="{up}join.html?ref={ref}" style="margin-left:6px">Join free</a></div>
  <footer>{room} · a HorrorMeet room · <a href="{up}atlas/index.html">the atlas</a> · <a href="{up}vault/index.html">the vault</a> · <a href="{up}seance.html">premiere Q&amp;As</a> · <a href="{up}index.html">home</a></footer>
</main>
<script type="module" src="{up}track.js?v=1"></script>
</body>
</html>
'''


def main():
    rows = [r for r in fetch() if r.get('lat') is not None and r.get('title')]
    total = f'{len(rows):,}'
    for r in rows:
        place, film_disp, film_key = split_film(r['title']) if r.get('kind') == 'film set' else (r['title'], None, None)
        r['place'], r['film'], r['film_key'] = place, film_disp, film_key
        r['url'] = f"atlas/{r['id']}-{slug(r['title'])}.html"
    films = defaultdict(list)
    for r in rows:
        if r['film_key']:
            films[r['film_key']].append(r)
    film_url = {k: f'atlas/film/{slug(k)}.html' for k in films}

    os.makedirs(os.path.join(ROOT, 'atlas', 'film'), exist_ok=True)
    for old in os.listdir(os.path.join(ROOT, 'atlas')):
        if old.endswith('.html'):
            os.remove(os.path.join(ROOT, 'atlas', old))
    for old in os.listdir(os.path.join(ROOT, 'atlas', 'film')):
        os.remove(os.path.join(ROOT, 'atlas', 'film', old))

    def write(rel, text):
        with open(os.path.join(ROOT, rel), 'w') as f:
            f.write(text.replace('{TOTAL}', total))

    # one page per pin
    for r in rows:
        near = sorted((x for x in rows if x is not r), key=lambda x: km(r, x))[:6]
        label = KIND_LABEL.get(r.get('kind'), 'Horror place')
        if r['film']:
            title = f"{r['place']}: where {r['film']} was filmed | HorrorMeet Atlas"
            h1 = r['place']
            kind_line = f"Filming location · {e(r['film'])}"
        else:
            title = f"{r['title']}: {label.lower()} | HorrorMeet Atlas"
            h1 = r['title']
            kind_line = e(label)
        desc = re.sub(r'\s+', ' ', r.get('description') or '').strip()
        meta = (desc[:152] + '...') if len(desc) > 155 else desc or f'{h1}, on the HorrorMeet Atlas of real horror places.'
        src = r.get('source_url') or ''
        src_host = re.sub(r'^www\.', '', re.sub(r'^https?://([^/]+).*$', r'\1', src)) if src else ''
        body = f'''  <div class="at-crumb"><a href="../atlas/index.html">Atlas</a> › {e(KIND_PLURAL.get(r.get('kind'), 'Places'))}{f' › <a href="../{film_url[r["film_key"]]}">{e(r["film"])}</a>' if r['film_key'] else ''}</div>
  <div class="at-kind">{kind_line}</div>
  <h1 class="at-h1">{e(h1)}</h1>
  <div class="at-body"><p>{e(desc)}</p></div>
  <div class="at-btns">
    <a class="btn" href="../index.html?spot={r['id']}#map">See it on the live map</a>
    {f'<a class="btn ghost" href="../{film_url[r["film_key"]]}">Every {e(r["film"])} location</a>' if r['film_key'] else ''}
  </div>
  {f'<p class="hint">Source: <a href="{e(src)}" rel="nofollow noopener" target="_blank">{e(src_host)}</a></p>' if src else ''}
  <div class="at-h2">Nearby on the Atlas</div>
  <ul class="at-list">{''.join(f'<li><a href="../{x["url"]}">{e(x["title"])}</a> <span class="hint">· {e(KIND_LABEL.get(x.get("kind"), ""))} · {round(km(r, x)):,} km</span></li>' for x in near)}</ul>'''
        ld = {'@context': 'https://schema.org', '@type': 'TouristAttraction', 'name': h1,
              'description': desc[:500], 'url': f"{BASE}/{r['url']}",
              'geo': {'@type': 'GeoCoordinates', 'latitude': round(r['lat'], 3), 'longitude': round(r['lng'], 3)}}
        write(r['url'], shell(title, meta, f"{BASE}/{r['url']}", body, 1, ld))

    # one page per film
    def join_names(names):
        names = list(names)
        if len(names) <= 1:
            return ''.join(names)
        return ', '.join(names[:-1]) + ' and ' + names[-1]

    film_pins = [(k, p) for k, pins in films.items() for p in pins]
    for k, pins in films.items():
        disp = pins[0]['film']
        n = len(pins)
        places = [p['place'] for p in pins]
        lead = (', '.join(places[:4]) + f' and {n - 4} more') if n > 4 else join_names(places)
        if n >= 3:
            title = f"Where Was {disp} Filmed? All {n} Real Locations, Mapped | HorrorMeet"
        else:
            title = f"Where Was {disp} Filmed? The Real Location{'s' if n != 1 else ''}, Mapped | HorrorMeet"
        answer = f"{disp} was filmed at {lead}."
        meta = (answer + ' What was shot at each place, where it is on the map, and whether you can visit.')[:300]
        # other horror shot within 80 km of this film's first pin: the internal links Google follows
        near = {}
        for k2, p2 in film_pins:
            if k2 == k:
                continue
            d = km(pins[0], p2)
            if d <= 80 and (k2 not in near or d < near[k2][0]):
                near[k2] = (d, p2['film'])
        near_list = sorted(near.items(), key=lambda kv: kv[1][0])[:8]
        near_html = ''
        if near_list:
            near_html = ('<div class="at-h2">More horror filmed nearby</div><ul class="at-list">' + ''.join(
                f'<li><a href="{slug(k2)}.html">Where was {e(name)} filmed?</a> <span class="hint">· {max(1, round(d)):,} km away</span></li>'
                for k2, (d, name) in near_list) + '</ul>')
        def loc(p):
            src = p.get('source_url') or ''
            host = re.sub(r'^www\.', '', re.sub(r'^https?://([^/]+).*$', r'\1', src)) if src else ''
            return (f'<li><h2 class="at-h2" style="margin:18px 0 4px"><a href="../../{p["url"]}">{e(p["place"])}</a></h2>'
                    f'<p>{e(p.get("description") or "")}</p>'
                    f'<p class="hint"><a href="../../index.html?spot={p["id"]}#map">See it on the map</a>'
                    + (f' · Source: <a href="{e(src)}" rel="nofollow noopener" target="_blank">{e(host)}</a>' if src else '') + '</p></li>')
        faq = [
            (f'Where was {disp} filmed?', answer + ' Every location on this page is a real place with its spot on the HorrorMeet Atlas map.'),
            (f'Can you visit the {disp} filming locations?',
             'Many of them, yes. Each location above says whether it is a public place, a private home or no longer standing. '
             'Private homes are for looking at from the sidewalk only: never knock, never step onto the property.'),
            (f'How many {disp} filming locations are on the map?',
             f'{n} so far. The Atlas grows every week, and members can add a location with a source.'),
        ]
        faq_html = '<div class="at-h2">Quick answers</div>' + ''.join(
            f'<p><b style="color:var(--white)">{e(q)}</b><br>{e(a_)}</p>' for q, a_ in faq)
        body = f'''  <div class="at-crumb"><a href="../index.html">Atlas</a> › <a href="../index.html#films">Filming locations</a></div>
  <div class="at-kind">Filming locations</div>
  <h1 class="at-h1">Where was {e(disp)} filmed?</h1>
  <p class="at-body" style="max-width:70ch"><b style="color:var(--white)">{e(answer)}</b> {n} real location{'s' if n != 1 else ''} below, each with what was shot there and its place on the map.</p>
  <div class="at-btns"><a class="btn" href="../../index.html?spot={pins[0]['id']}#map">Open {'them' if n != 1 else 'it'} on the live map</a></div>
  <ul class="at-list" style="list-style:none;padding-left:0">{''.join(loc(p) for p in pins)}</ul>
  {faq_html}
  {near_html}
  <p class="hint">Know a {e(disp)} location that is missing? <a href="../../join.html?ref=atlas-add">Join free</a> and add it with a source.</p>'''
        url_ = f"{BASE}/{film_url[k]}"
        ld = [
            {'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
                {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a_}} for q, a_ in faq]},
            {'@context': 'https://schema.org', '@type': 'ItemList', 'name': f'{disp} filming locations', 'numberOfItems': n,
             'itemListElement': [{'@type': 'ListItem', 'position': i + 1, 'name': p['place'], 'url': f"{BASE}/{p['url']}"}
                                 for i, p in enumerate(pins)]},
            {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
                {'@type': 'ListItem', 'position': 1, 'name': 'Atlas', 'item': f'{BASE}/atlas/index.html'},
                {'@type': 'ListItem', 'position': 2, 'name': f'Where was {disp} filmed?', 'item': url_}]},
        ]
        page = shell(title, meta, url_, body, 2, ld)
        write(film_url[k], page)

    # directory
    by_kind = defaultdict(list)
    for r in rows:
        by_kind[r.get('kind') or 'other'].append(r)
    film_items = sorted(films.items(), key=lambda kv: kv[1][0]['film'].lower())
    sections = [f'''  <div class="at-h2" id="films">Where horror was filmed: {len(films)} films</div>
  <ul class="at-cols">{''.join(f'<li><a href="film/{slug(k)}.html">{e(v[0]["film"])}</a> <span class="hint">{len(v)}</span></li>' for k, v in film_items)}</ul>''']
    for kind in ('haunted', 'prison', 'ghost town', 'film set'):
        items = sorted(by_kind.get(kind, []), key=lambda r: r['title'].lower())
        if items:
            sections.append(f'''  <div class="at-h2" id="{slug(kind)}">{e(KIND_PLURAL[kind])}: {len(items):,}</div>
  <ul class="at-cols">{''.join(f'<li><a href="{r["url"][6:]}">{e(r["title"])}</a></li>' for r in items)}</ul>''')
    body = f'''  <div class="at-kind">The HorrorMeet Atlas</div>
  <h1 class="at-h1">{total} real horror places</h1>
  <p class="at-body" style="color:var(--dim);max-width:65ch">Filming locations from {len(films)} horror films and series, haunted houses, ghost towns and prisons, every one a real place you can visit or at least drive past. <a href="../index.html#map">Open the live map</a>.</p>
{chr(10).join(sections)}'''
    write('atlas/index.html', shell(f'The HorrorMeet Atlas: {total} real horror filming locations and haunted places',
                                    f'Where horror movies were filmed, plus haunted places, ghost towns and prisons: {total} real locations from {len(films)} films, mapped.',
                                    f'{BASE}/atlas/index.html', body, 1))

    vault_urls = build_vault(write)
    qa_urls = build_qa(write)

    # sitemap + robots
    main_pages = ['', 'seance.html', 'vault.html', 'festivals.html', 'awards.html', 'press.html', 'rules.html',
                  'market.html', 'morgue.html', 'crew.html', 'rooms.html', 'basement.html', 'join.html', 'atlas/index.html', 'vault/index.html']
    urls = [f'{BASE}/{p}' for p in main_pages] + [f'{BASE}/{film_url[k]}' for k in films] + [f'{BASE}/{r["url"]}' for r in rows] + [f'{BASE}/{u}' for u in vault_urls + qa_urls]
    with open(os.path.join(ROOT, 'sitemap.xml'), 'w') as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')
        for u in urls:
            f.write(f'  <url><loc>{html.escape(u)}</loc><lastmod>{TODAY}</lastmod></url>\n')
        f.write('</urlset>\n')
    with open(os.path.join(ROOT, 'robots.txt'), 'w') as f:
        f.write(f'User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /seance/\n\nSitemap: {BASE}/sitemap.xml\n')
    print(f'{len(rows)} pin pages, {len(films)} film pages, {len(vault_urls) - 1} vault pages, {len(qa_urls)} qa pages, {len(urls)} sitemap urls')



DEAD = {0, 404, 410, 500, 502, 503, 504}


def clean_dir(rel):
    d = os.path.join(ROOT, rel)
    os.makedirs(d, exist_ok=True)
    for old in os.listdir(d):
        if old.endswith('.html'):
            os.remove(os.path.join(d, old))


def build_vault(write):
    # hidden = unpublished by a rights audit (11/11/26). Rows stay in the table; they never get a page.
    films = [f for f in get('vault_films', 'select=id,identifier,title,year,director,blurb,rights_note,link_status,downloads,curated&hidden=is.false&order=sort_order')
             if f.get('identifier') and f.get('title') and f.get('link_status') not in DEAD]
    # the archive holds several uploads of the same film (dubs, ipod encodes, re-uploads).
    # near-identical pages hurt ranking, so keep one page per film: curated first, then most watched.
    JUNK = r'\b(full|hd|1080p|720p|480p|ipod|flash|video|versions?|doblada|al|espa[nñ]ol|subtitulada|restored|remastered|movie|film|and)\b'
    def key(f):
        t = re.sub(r'\(.*?\)|\[.*?\]', ' ', f['title'].lower())
        t = re.sub(JUNK, ' ', t)
        t = re.sub(r'\b(18|19|20)\d\d\b', ' ', t)
        return re.sub(r'[^a-z0-9]+', ' ', t).strip() + '|' + str(f.get('year') or '')
    # an upload with no year joins a dated copy of the same title, when there is exactly one
    dated = defaultdict(set)
    for f in films:
        t, y = key(f).split('|')
        if y: dated[t].add(y)
    def key2(f):
        t, y = key(f).split('|')
        if not y and len(dated[t]) == 1: y = next(iter(dated[t]))
        return t + '|' + y
    best = {}
    for f in films:
        k = key2(f)
        rank = (bool(f.get('curated')), f.get('downloads') or 0)
        if k not in best or rank > best[k][0]:
            best[k] = (rank, f)
    films = sorted((v[1] for v in best.values()), key=lambda f: f['id'])
    clean_dir('vault')
    urls = []
    for f in films:
        t = f['title']
        yr = f.get('year')
        name = t if (not yr or str(yr) in t) else f'{t} ({yr})'
        f['url'] = f"vault/{f['id']}-{slug(t)}.html"
        blurb = re.sub(r'\s+', ' ', f.get('blurb') or '').strip()
        meta = f'Watch {name} free, legally. ' + (blurb[:120] + '...' if len(blurb) > 120 else blurb)
        ident = urllib.parse.quote(f['identifier'])
        body = f'''  <div class="at-crumb"><a href="index.html">The Vault</a> › Public domain horror</div>
  <div class="at-kind">Watch free · public domain</div>
  <h1 class="at-h1">{e(name)}</h1>
  {f'<p class="hint">Directed by {e(f["director"])}</p>' if f.get('director') else ''}
  <div style="position:relative;width:100%;aspect-ratio:4/3;background:#000;margin:14px 0">
    <iframe src="https://archive.org/embed/{ident}" title="{e(name)}" loading="lazy" allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>
  </div>
  <div class="at-body"><p>{e(blurb)}</p></div>
  <p class="hint">{e(f.get('rights_note') or 'Public domain.')} Streams from the <a href="https://archive.org/details/{ident}" rel="noopener" target="_blank">Internet Archive</a>.</p>
  <div class="at-btns"><a class="btn" href="../vault.html">Browse the whole Vault</a></div>'''
        ld = {'@context': 'https://schema.org', '@type': 'Movie', 'name': t, 'description': blurb[:500],
              'url': f"{BASE}/{f['url']}"}
        if yr: ld['dateCreated'] = str(yr)
        if f.get('director'): ld['director'] = {'@type': 'Person', 'name': f['director']}
        write(f['url'], shell(f'Watch {name} free: public domain horror | HorrorMeet Vault', meta,
                              f"{BASE}/{f['url']}", body, 1, ld,
                              tagline='the classics never needed permission.', room='THE VAULT', ref='vault'))
        urls.append(f['url'])
    items = sorted(films, key=lambda f: f['title'].lower())
    body = f'''  <div class="at-kind">The HorrorMeet Vault</div>
  <h1 class="at-h1">{len(films):,} horror films you can watch free</h1>
  <p class="at-body" style="color:var(--dim);max-width:65ch">Public domain horror, legally free to stream: silent classics, poverty row chillers, drive-in features and serials, every one playable right on its page. <a href="../vault.html">Search the Vault</a>.</p>
  <ul class="at-cols">{''.join(f'<li><a href="{f["url"][6:]}">{e(f["title"])}</a></li>' for f in items)}</ul>'''
    write('vault/index.html', shell(f'The HorrorMeet Vault: {len(films):,} public domain horror films to watch free',
                                    'Watch classic horror free and legally: public domain horror films from the silent era to the drive-in, playable on every page.',
                                    f'{BASE}/vault/index.html', body, 1, tagline='the classics never needed permission.', room='THE VAULT', ref='vault'))
    return ['vault/index.html'] + urls


def yt_seconds(ts):
    parts = [int(x) for x in ts.split(':')]
    return sum(v * 60 ** i for i, v in enumerate(reversed(parts)))



def load_transcript(slug):
    """captions/<slug>.srt -> list of (seconds, text). An optional <slug>.cuts.json
    holds [[start, end], ...] second ranges to leave out (embargoed talk)."""
    path = os.path.join(ROOT, 'data', 'transcripts', slug + '.srt')
    if not os.path.exists(path):
        return []
    cuts = []
    cpath = os.path.join(ROOT, 'data', 'transcripts', slug + '.cuts.json')
    if os.path.exists(cpath):
        cuts = json.load(open(cpath))
    out = []
    for block in re.split(r'\n\s*\n', open(path, encoding='utf-8').read().strip()):
        lines = block.strip().split('\n')
        if len(lines) < 3 or '-->' not in lines[1]:
            continue
        h, m, rest = lines[1].split(' --> ')[0].split(':')
        sec = int(h) * 3600 + int(m) * 60 + float(rest.replace(',', '.'))
        if any(a <= sec <= b for a, b in cuts):
            continue
        text = ' '.join(x.strip() for x in lines[2:])
        text = re.sub(r'\s+', ' ', text).strip()
        if text:
            out.append((sec, text))
    return out


def transcript_html(slug, vid):
    caps = load_transcript(slug)
    if not caps:
        return ''
    blocks, cur, start = [], [], None
    for sec, text in caps:
        if start is None:
            start = sec
        cur.append(text)
        if sec - start >= 45 or sum(len(t) for t in cur) > 600:
            blocks.append((start, ' '.join(cur))); cur, start = [], None
    if cur:
        blocks.append((start, ' '.join(cur)))
    def stamp(sec):
        sec = int(sec); h, r = divmod(sec, 3600); m, s2 = divmod(r, 60)
        return f'{h}:{m:02d}:{s2:02d}' if h else f'{m}:{s2:02d}'
    rows = ''.join(
        f'<p><a href="https://www.youtube.com/watch?v={vid}&amp;t={int(sec)}s" target="_blank" rel="noopener" style="color:var(--red);font-size:12px;letter-spacing:.06em">{stamp(sec)}</a> {e(text)}</p>'
        for sec, text in blocks)
    return ('<div class="at-h2">Transcript</div>'
            '<p class="hint">Auto-captioned from the episode, lightly cleaned. Timestamps open that moment on YouTube.</p>'
            f'<div class="at-body at-transcript">{rows}</div>')

def build_qa(write):
    rows = [r for r in get('seance_sittings', 'select=id,kind,slug,guest,guest_role,film,youtube_id,summary,recap,chapters,'
                                                'happened_at,event,venue,panelists,host,vertical,duration,uploaded_at&status=eq.published')
            if r.get('slug') and r.get('youtube_id')]
    clean_dir('qa')
    urls = []
    for r in rows:
        url = f"qa/{r['slug']}.html"
        when = ''
        if r.get('happened_at'):
            from datetime import datetime
            from zoneinfo import ZoneInfo
            dt = datetime.fromisoformat(r['happened_at'].replace('Z', '+00:00')).astimezone(ZoneInfo('America/Los_Angeles'))
            when = dt.strftime('%B ') + str(dt.day) + dt.strftime(', %Y')
        where = ', '.join(x for x in (r.get('event'), r.get('venue')) if x)
        vid = r['youtube_id']
        title = f"{r['guest']}: {where}" if where else r['guest']
        recap = r.get('recap') or r.get('summary') or ''
        paras = ''.join(f'<p>{e(p)}</p>' for p in recap.split('\n\n') if p.strip())
        chap = ''
        if r.get('chapters'):
            chap = '<div class="at-h2">Chapters</div><ul class="at-list">' + ''.join(
                f'<li><a href="https://www.youtube.com/watch?v={vid}&amp;t={yt_seconds(t)}s" target="_blank" rel="noopener">{e(t)}</a> {e(label)}</li>'
                for t, label in r['chapters']) + '</ul>'
        tall = 'aspect-ratio:9/16;max-width:380px;margin:14px auto' if r.get('vertical') else 'aspect-ratio:16/9;margin:14px 0'
        body = f'''  <div class="at-crumb"><a href="../seance.html">The Séance</a> › {'Premiere Q&amp;As' if r.get('kind') == 'qa' else 'Sittings'}</div>
  <div class="at-kind">{e(where or 'The Séance')}{' · ' + e(when) if when else ''}</div>
  <h1 class="at-h1">{e(r['guest'])}</h1>
  {f'<p class="hint"><b style="color:var(--white)">On stage:</b> {e(r["panelists"])}</p>' if r.get('panelists') else ''}
  {f'<p class="hint"><b style="color:var(--white)">Hosted by</b> {e(r["host"])}</p>' if r.get('host') else ''}
  <div style="position:relative;width:100%;{tall};background:#000">
    <iframe data-seance="{r['id']}" src="https://www.youtube-nocookie.com/embed/{vid}" title="{e(r['guest'])}" loading="lazy" allowfullscreen allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture" style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>
  </div>
  <p class="hint" style="color:var(--white);font-weight:600"><span data-seance-count="{r['id']}"></span> · <a data-seance-yt="{r['id']}" href="https://www.youtube.com/watch?v={vid}" target="_blank" rel="noopener">Watch on YouTube ↗</a></p>
  <script type="module">import {{ initSeanceCounters }} from '../viewcount.js'; initSeanceCounters();</script>
  <div class="at-h2">What was said</div>
  <div class="at-body">{paras}</div>
  {chap}
  {transcript_html(r['slug'], vid)}
  <div class="at-btns"><a class="btn" href="../seance.html">More premiere Q&amp;As</a></div>'''
        ld = {'@context': 'https://schema.org', '@type': 'VideoObject', 'name': title,
              'description': re.sub(r'\s+', ' ', recap)[:500],
              'thumbnailUrl': [f'https://i.ytimg.com/vi/{vid}/hqdefault.jpg'],
              'uploadDate': r.get('uploaded_at') or r.get('happened_at'),
              'embedUrl': f'https://www.youtube.com/embed/{vid}',
              'contentUrl': f'https://www.youtube.com/watch?v={vid}'}
        if r.get('duration'): ld['duration'] = r['duration']
        meta = re.sub(r'\s+', ' ', recap)[:152] + '...'
        write(url, shell(f"{title} | HorrorMeet", meta, f'{BASE}/{url}', body, 1, ld,
                         tagline='ask your questions. the circle is listening.', room='THE SÉANCE', ref='qa'))
        urls.append(url)
    return urls

if __name__ == '__main__':
    main()
