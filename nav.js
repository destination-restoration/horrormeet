(function () {
  var h = document.querySelector('header.app');
  if (!h) return;
  var last = 0;
  window.addEventListener('scroll', function () {
    var y = window.scrollY;
    if (y < 70) h.classList.remove('doors-hidden');
    else if (y > last + 6) h.classList.add('doors-hidden');
    else if (y < last - 6) h.classList.remove('doors-hidden');
    last = y;
  }, { passive: true });
})();
