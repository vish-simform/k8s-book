(function() {
  const bar = document.createElement('div');
  bar.id = 'reading-progress';
  document.body.prepend(bar);
  window.addEventListener('scroll', () => {
    const scrollable = document.body.scrollHeight - window.innerHeight;
    if (scrollable > 0) {
      bar.style.width = `${Math.min((window.scrollY / scrollable) * 100, 100)}%`;
    }
  });
})();
