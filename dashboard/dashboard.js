let csrf = '';
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[character]));
const demonNames = { 3: 'Easy Demon', 4: 'Medium Demon', 0: 'Hard Demon', 5: 'Insane Demon', 6: 'Extreme Demon' };
const featureNames = { 1: 'Featured', 2: 'Epic', 3: 'Legendary', 4: 'Mythic' };
const selected = (current, value) => Number(current) === Number(value) ? ' selected' : '';
async function request(url, options = {}) {
    const headers = { ...options.headers };
    if (options.body) headers['Content-Type'] = 'application/json';
    if (csrf && options.method && options.method !== 'GET') headers['X-CSRF-Token'] = csrf;
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `Request failed (${response.status})`);
    return response.status === 204 ? null : response.json();
}

function suggestionText(suggestion) {
    const demon = suggestion.stars === 10 && suggestion.demonDiff in demonNames ? ` · ${demonNames[suggestion.demonDiff]}` : '';
    const feature = suggestion.feature ? ` · ${featureNames[suggestion.feature]}` : '';
    return `${suggestion.stars}★${demon}${feature} · ${escapeHtml(suggestion.moderator || 'unknown')}`;
}

function render(data) {
    const labels = [['accounts', 'Accounts'], ['levels', 'Levels'], ['moderators', 'Mods'], ['elders', 'Elders'], ['pending', 'Pending']];
    $('#stats').innerHTML = labels.map(([key, label]) => `<div class="stat"><span>${label}</span><strong>${data.stats[key].toLocaleString()}</strong></div>`).join('');

    const grouped = [...data.pending.reduce((levels, suggestion) => {
    if (!levels.has(suggestion.levelID)) levels.set(suggestion.levelID, { ...suggestion, suggestions: [] });
    levels.get(suggestion.levelID).suggestions.push(suggestion);
    return levels;
    }, new Map()).values()];
    $('#queue-count').textContent = `${grouped.length} levels · ${data.pending.length} suggestions`;
    $('#queue').innerHTML = grouped.length ? grouped.map(level => {
    const first = level.suggestions[0];
    return `<article class="queue-item" data-level="${level.levelID}"><div class="level-line"><span class="level-name">${escapeHtml(level.levelName)}</span><span class="level-id">#${level.levelID}</span></div><div class="details">${level.suggestions.length > 1 ? `${level.suggestions.length} moderator suggestions` : '1 moderator suggestion'}</div><div class="suggestions">${level.suggestions.map(suggestion => `<div class="suggestion">${suggestionText(suggestion)}</div>`).join('')}</div><div class="actions"><label>Stars<select class="stars"><option value="1"${selected(first.stars, 1)}>1</option><option value="2"${selected(first.stars, 2)}>2</option><option value="3"${selected(first.stars, 3)}>3</option><option value="4"${selected(first.stars, 4)}>4</option><option value="5"${selected(first.stars, 5)}>5</option><option value="6"${selected(first.stars, 6)}>6</option><option value="7"${selected(first.stars, 7)}>7</option><option value="8"${selected(first.stars, 8)}>8</option><option value="9"${selected(first.stars, 9)}>9</option><option value="10"${selected(first.stars, 10)}>10</option></select></label><label>Feature<select class="feature"><option value="0"${selected(first.feature, 0)}>None</option><option value="1"${selected(first.feature, 1)}>Featured</option><option value="2"${selected(first.feature, 2)}>Epic</option><option value="3"${selected(first.feature, 3)}>Legendary</option><option value="4"${selected(first.feature, 4)}>Mythic</option></select></label><label>Demon<select class="demon"><option value="0"${selected(first.demonDiff, 0)}>None / Hard</option><option value="3"${selected(first.demonDiff, 3)}>Easy</option><option value="4"${selected(first.demonDiff, 4)}>Medium</option><option value="5"${selected(first.demonDiff, 5)}>Insane</option><option value="6"${selected(first.demonDiff, 6)}>Extreme</option></select></label><button class="approve">Rate</button><button class="reject">Reject</button></div></article>`;
    }).join('') : '<p class="empty">The queue is clear.</p>';

    $('#recent').innerHTML = data.recent.length ? data.recent.map(item => { const rarity = item.starEpic ? featureNames[item.starEpic + 1] : item.featured ? 'Featured' : ''; const demon = item.starDemon ? demonNames[item.starDemonDiff] || 'Demon' : ''; const rating = item.starStars ? `${item.starStars}★${demon ? ` · ${demon}` : ''}` : 'unrated'; return `<article class="recent-item"><div><div class="level-name">${escapeHtml(item.levelName)}</div><div class="details">#${item.levelID} · ${escapeHtml(item.creator || 'unknown')}</div></div><div class="recent-meta"><span class="badge">${rating}</span><br>${rarity}</div></article>`; }).join('') : '<p class="empty">No levels yet.</p>';
}

async function load() {
    try { const data = await request('api/bootstrap'); csrf = data.csrf; render(data); $('#login-view').hidden = true; $('#app-view').hidden = false; }
    catch (error) { if (!$('#app-view').hidden) $('#app-error').textContent = error.message; }
}

$('#login-form').addEventListener('submit', async event => {
    event.preventDefault(); $('#login-error').textContent = '';
    const form = new FormData(event.currentTarget);
    try { const data = await request('api/login', { method: 'POST', body: JSON.stringify({ username: form.get('username'), password: form.get('password') }) }); csrf = data.csrf; await load(); }
    catch (error) { $('#login-error').textContent = error.message; }
});

$('#queue').addEventListener('click', async event => {
    if (!event.target.classList.contains('approve') && !event.target.classList.contains('reject')) return;
    const item = event.target.closest('.queue-item'); if (!item) return;
    const body = { levelId: Number(item.dataset.level) };
    const url = event.target.classList.contains('approve') ? 'api/rate' : 'api/reject';
    if (url.endsWith('/rate')) { body.stars = Number(item.querySelector('.stars').value); body.feature = Number(item.querySelector('.feature').value); body.demonDiff = Number(item.querySelector('.demon').value); }
    try { await request(url, { method: 'POST', body: JSON.stringify(body) }); await load(); }
    catch (error) { $('#app-error').textContent = error.message; }
});

$('#logout').addEventListener('click', async () => { try { await request('api/logout', { method: 'POST', body: '{}' }); location.reload(); } catch (error) { $('#app-error').textContent = error.message; } });
load();
