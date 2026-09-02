(function () {
  var h = document.querySelector('header.app');
  if (!h) return;

  /* scroll-collapse */
  var last = 0;
  window.addEventListener('scroll', function () {
    var y = window.scrollY;
    if (y < 70) h.classList.remove('doors-hidden');
    else if (y > last + 6) h.classList.add('doors-hidden');
    else if (y < last - 6) h.classList.remove('doors-hidden');
    last = y;
  }, { passive: true });

  /* door overlay (create if the page doesn't have one) */
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;
  var fx = document.getElementById('doorFx');
  if (!fx) {
    fx = document.createElement('div');
    fx.id = 'doorFx';
    fx.innerHTML = '<div class="frame"><div class="panel"></div></div>';
    document.body.appendChild(fx);
  }

  /* animated navigation for door-shaped ANCHORS (subpage tabs + guide doors) */
  var doors = document.querySelectorAll('a.tab, .guides a');
  doors.forEach(function (d) {
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
