(function () {
  var PAGE = location.pathname.split('/').pop() || 'index.html';
  var CATS = [
    { key: 'community', label: 'Community', rooms: [
      ['Sightings', 'index.html#feed'], ['The Board', 'index.html#board'],
      ['The Rooms', 'rooms.html'], ['The Basement', 'basement.html'], ['The Séance', 'seance.html']] },
    { key: 'films', label: 'Films', rooms: [
      ['The Shelf', 'index.html#films'], ['The Vault', 'vault.html'], ['The Circuit', 'festivals.html'],
      ['The Awards', 'awards.html'], ['The Crew', 'crew.html']] },
    { key: 'world', label: 'The World', rooms: [
      ['News Wire', 'index.html#news'], ['The Atlas', 'index.html#map'],
      ['Meetups', 'index.html#meetups'], ['The Morgue', 'morgue.html']] },
    { key: 'market', label: 'Estate Sale', href: 'market.html' }
  ];

  function roomIsCurrent(href) {
    if (href.indexOf('index.html#') === 0) return PAGE === 'index.html' && location.hash === href.slice(href.indexOf('#'));
    return href === PAGE;
  }
  function catOfCurrent() {
    if (PAGE === 'market.html') return 'market';
    for (var i = 0; i < CATS.length; i++) {
      var c = CATS[i];
      if (!c.rooms) continue;
      for (var j = 0; j < c.rooms.length; j++) if (roomIsCurrent(c.rooms[j][1])) return c.key;
    }
    if (PAGE === 'index.html' && (!location.hash || location.hash === '#home')) return null;
    return 'community';
  }

  var tabsEl = document.querySelector('nav.tabs');
  var guidesEl = document.querySelector('.guides');
  if (!tabsEl || !guidesEl) return;
  var active = catOfCurrent();

  var locked = active;
  function findCat(key) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].key === key) return CATS[i];
    return null;
  }
  function renderDoors() {
    tabsEl.innerHTML = CATS.map(function (c) {
      var cls = 'tab' + (locked && c.key === locked ? ' active' : '');
      var href = c.href || '#';
      return '<a class="' + cls + '" href="' + href + '" data-cat="' + c.key + '"><span>' + c.label + '</span></a>';
    }).join('');
  }
  function renderChips(key) {
    var cat = findCat(key);
    if (cat && cat.rooms) {
      guidesEl.style.display = '';
      guidesEl.innerHTML = cat.rooms.map(function (r) {
        return '<a href="' + r[1] + '"' + (roomIsCurrent(r[1]) ? ' class="on"' : '') + '><span>' + r[0] + '</span></a>';
      }).join('');
    } else {
      guidesEl.innerHTML = '';
      guidesEl.style.display = 'none';
    }
  }
  renderDoors();
  renderChips(locked);
  window.addEventListener('hashchange', function () {
    locked = catOfCurrent();
    renderDoors();
    renderChips(locked);
  });

  /* hover a door: peek at its rooms. click: lock it in. leave the nav: back to the locked one */
  tabsEl.addEventListener('mouseover', function (e) {
    var a = e.target.closest('a.tab');
    if (!a) return;
    var cat = findCat(a.dataset.cat);
    if (cat && cat.rooms) renderChips(cat.key);
  });
  tabsEl.addEventListener('mouseleave', function () { renderChips(locked); });
  tabsEl.addEventListener('click', function (e) {
    var a = e.target.closest('a.tab');
    if (!a) return;
    var cat = findCat(a.dataset.cat);
    if (cat && cat.rooms) {
      e.preventDefault();
      locked = cat.key;
      renderDoors();
      renderChips(locked);
    }
  });

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fx = document.getElementById('doorFx');
  if (!fx && !reduced) {
    fx = document.createElement('div');
    fx.id = 'doorFx';
    fx.innerHTML = '<div class="frame"><div class="panel"></div></div>';
    document.body.appendChild(fx);
  }

  document.addEventListener('click', function (e) {
    var d = e.target.closest('.guides a, a.tab[data-cat="market"], .app-bar .logo');
    if (!d) return;
    var href = d.getAttribute('href');
    if (!href || href === '#' || d.classList.contains('on')) return;
    if (href.indexOf('index.html#') === 0 && PAGE === 'index.html') {
      e.preventDefault();
      location.hash = href.slice(href.indexOf('#'));
      return;
    }
    if (reduced || !fx) return;
    e.preventDefault();
    fx.classList.remove('go'); void fx.offsetWidth; fx.classList.add('go');
    setTimeout(function () { window.location.href = href; }, 340);
  });
})();
