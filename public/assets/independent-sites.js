(() => {
  document.querySelectorAll('.independent-sites').forEach(section => {
    const search = section.querySelector('[data-sites-search]');
    const category = section.querySelector('[data-sites-category]');
    const cards = [...section.querySelectorAll('.independent-card')];
    function filter() {
      const words = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
      let count = 0;
      cards.forEach(card => {
        const matches = words.every(word => card.dataset.siteSearch.toLocaleLowerCase().includes(word));
        card.hidden = !matches || Boolean(category && category.value && card.dataset.siteCategory !== category.value);
        if (!card.hidden) count++;
      });
      section.querySelector('[data-sites-count]').textContent = `顯示 ${count} / ${cards.length} 站`;
      section.querySelector('.independent-empty').hidden = count !== 0;
    }
    search.addEventListener('input', filter);
    if (category) category.addEventListener('change', filter);
    filter();
  });
})();
