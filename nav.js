(function () {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;
  var fx = document.getElementById('doorFx');
  if (!fx) {
    fx = document.createElement('div');
    fx.id = 'doorFx';
    fx.innerHTML = '<div class="frame"><div class="panel"></div></div>';
    document.body.appendChild(fx);
  }
  document.querySelectorAll('a.tab, .guides a').forEach(function (d) {
    d.addEventListener('click', function (e) {
      var href = d.getAttribute('href');
      if (!href || d.classList.contains('on')) return;
      e.preventDefault();
      fx.classList.remove('go');
      void fx.offsetWidth;
      fx.classList.add('go');
      setTimeout(function () { window.location.href = href; }, 340);
    });
  });
})();
