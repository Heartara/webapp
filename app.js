const menu = document.querySelector('.menu');
const navigation = document.querySelector('#navigation');
menu?.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded', String(open)); navigation.classList.toggle('open', open); });
navigation?.addEventListener('click', event => { if (event.target.closest('a')) { menu.setAttribute('aria-expanded', 'false'); navigation.classList.remove('open'); } });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu?.getAttribute('aria-expanded') === 'true') { menu.setAttribute('aria-expanded', 'false'); navigation.classList.remove('open'); menu.focus(); } });
const search = document.querySelector('#card-search');
search?.addEventListener('input', () => { const query = search.value.trim().toLowerCase(); let count = 0; document.querySelectorAll('[data-card]').forEach(card => { card.hidden = !card.dataset.card.includes(query); if (!card.hidden) count++; }); document.querySelector('#card-count').textContent = query ? `${count} matching ${count === 1 ? 'card' : 'cards'}` : '44 main cards'; });
