let csrf = '';
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[character]));
const demonNames = { 3: 'Easy Demon', 4: 'Medium Demon', 0: 'Hard Demon', 5: 'Insane Demon', 6: 'Extreme Demon' };
const featureNames = { 1: 'Featured', 2: 'Epic', 3: 'Legendary', 4: 'Mythic' };
const difficultyNames = { 1: 'Easy', 2: 'Normal', 3: 'Hard', 4: 'Harder', 5: 'Insane' };
const selected = (current, value) => Number(current) === Number(value) ? ' selected' : '';
function syncDemonControl(container) {
    const stars = container.querySelector('.stars, .detail-stars');
    const demon = container.querySelector('.demon, .detail-demon');
    if (!stars || !demon) return;
    demon.disabled = Number(stars.value) !== 10;
    if (demon.disabled) demon.value = '0';
}
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
    document.querySelectorAll('.queue-item').forEach(syncDemonControl);

    $('#recent').innerHTML = data.recent.length ? data.recent.map(item => { const rarity = item.starEpic ? featureNames[item.starEpic + 1] : item.featured ? 'Featured' : ''; const demon = item.starDemon ? demonNames[item.starDemonDiff] || 'Demon' : ''; const rating = item.starStars ? `${item.starStars}★${item.starAuto ? ' · Auto' : ''}${demon ? ` · ${demon}` : ''}` : 'unrated'; const difficulty = item.starDifficulty ? difficultyNames[item.starDifficulty] : ''; return `<article class="recent-item"><div><div class="level-name">${escapeHtml(item.levelName)}</div><div class="details">#${item.levelID} · ${escapeHtml(item.creator || 'unknown')}</div></div><div class="recent-meta"><span class="badge">${rating}</span><br>${difficulty}${difficulty && rarity ? ' · ' : ''}${rarity}</div></article>`; }).join('') : '<p class="empty">No levels yet.</p>';
}

function renderLevels(levels) {
    $('#level-results').innerHTML = levels.length ? levels.map(level => `<button class="level-result" data-level="${level.levelID}"><span><strong>${escapeHtml(level.levelName)}</strong><small>#${level.levelID} · ${escapeHtml(level.creator || 'unknown')}</small></span><span>${level.starStars ? `${level.starStars}★` : 'unrated'}${level.starDifficulty ? ` · ${difficultyNames[level.starDifficulty]}` : ''} · ${level.userRates || 0} user ratings</span></button>`).join('') : '<p class="empty">No matching levels.</p>';
}

function renderLevelDetail(data) {
    const level = data.level;
    const official = level.starStars ? `${level.starStars}★${level.starAuto ? ' · Auto' : ''}${level.starDemon ? ` · ${demonNames[level.starDemonDiff] || 'Demon'}` : ''}` : 'Unrated';
    const difficulty = level.starDifficulty ? difficultyNames[level.starDifficulty] : 'Unset';
    const rarity = level.starEpic ? featureNames[level.starEpic + 1] : level.featured ? 'Featured' : 'None';
    const feature = level.starEpic ? level.starEpic + 1 : level.featured ? 1 : 0;
    $('#level-detail').hidden = false;
    $('#level-detail').innerHTML = `<div class="detail-heading"><div><p class="eyebrow">Level #${level.levelID}</p><h3>${escapeHtml(level.levelName)}</h3></div><button class="close-detail" type="button">Close</button></div><p class="detail-description">${escapeHtml(level.levelDesc || 'No description')}</p><div class="detail-facts"><span>Official <b>${official}</b></span><span>Difficulty <b>${difficulty}</b></span><span>Rarity <b>${rarity}</b></span><span>Users <b>${level.userRates || 0} ratings · ${level.avgUserRate || 0}★ avg</b></span><span>Stats <b>${level.downloads || 0} downloads · ${level.likes || 0} likes</b></span></div><div class="detail-columns"><div><h4>Moderator suggestions (${data.suggestions.length})</h4>${data.suggestions.length ? data.suggestions.map(suggestion => `<div class="suggestion">${suggestionText(suggestion)}</div>`).join('') : '<p class="empty">None</p>'}</div><div><h4>User ratings</h4>${data.ratings.length ? data.ratings.map(rating => `<div class="user-rating"><span>${escapeHtml(rating.userName || `Account #${rating.accountID}`)} · ${rating.stars}★</span><button class="remove-rating" data-account="${rating.accountID}" type="button">Remove</button></div>`).join('') : '<p class="empty">No user ratings</p>'}</div></div><div class="detail-actions"><label>Difficulty<select class="detail-difficulty"${level.starStars ? ' disabled' : ''}><option value="0"${selected(level.starDifficulty, 0)}>Unset</option><option value="1"${selected(level.starDifficulty, 1)}>Easy</option><option value="2"${selected(level.starDifficulty, 2)}>Normal</option><option value="3"${selected(level.starDifficulty, 3)}>Hard</option><option value="4"${selected(level.starDifficulty, 4)}>Harder</option><option value="5"${selected(level.starDifficulty, 5)}>Insane</option></select></label><button class="detail-difficulty-save" type="button"${level.starStars ? ' disabled' : ''}>Save difficulty</button><label>Stars<select class="detail-stars"><option value="0"${selected(level.starStars, 0)}>Unrate</option><option value="1"${selected(level.starStars, 1)}>1</option><option value="2"${selected(level.starStars, 2)}>2</option><option value="3"${selected(level.starStars, 3)}>3</option><option value="4"${selected(level.starStars, 4)}>4</option><option value="5"${selected(level.starStars, 5)}>5</option><option value="6"${selected(level.starStars, 6)}>6</option><option value="7"${selected(level.starStars, 7)}>7</option><option value="8"${selected(level.starStars, 8)}>8</option><option value="9"${selected(level.starStars, 9)}>9</option><option value="10"${selected(level.starStars, 10)}>10</option></select></label><label>Feature<select class="detail-feature"><option value="0"${selected(feature, 0)}>None</option><option value="1"${selected(feature, 1)}>Featured</option><option value="2"${selected(feature, 2)}>Epic</option><option value="3"${selected(feature, 3)}>Legendary</option><option value="4"${selected(feature, 4)}>Mythic</option></select></label><label>Demon<select class="detail-demon"><option value="0"${selected(level.starDemon ? level.starDemonDiff : 0, 0)}>None / Hard</option><option value="3"${selected(level.starDemonDiff, 3)}>Easy</option><option value="4"${selected(level.starDemonDiff, 4)}>Medium</option><option value="5"${selected(level.starDemonDiff, 5)}>Insane</option><option value="6"${selected(level.starDemonDiff, 6)}>Extreme</option></select></label><button class="detail-rate" type="button">Save rating</button></div>`;
    syncDemonControl($('#level-detail'));
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

$('#queue').addEventListener('change', event => {
    const item = event.target.closest('.queue-item');
    if (item && event.target.classList.contains('stars')) syncDemonControl(item);
});

$('#level-detail').addEventListener('change', event => {
    if (event.target.classList.contains('detail-stars')) syncDemonControl(event.currentTarget);
});

$('#level-search').addEventListener('submit', async event => {
    event.preventDefault();
    const query = new FormData(event.currentTarget).get('query');
    try { const data = await request(`api/levels?q=${encodeURIComponent(query)}`); renderLevels(data.levels); }
    catch (error) { $('#app-error').textContent = error.message; }
});

$('#level-results').addEventListener('click', async event => {
    const result = event.target.closest('.level-result'); if (!result) return;
    try { renderLevelDetail(await request(`api/levels/${result.dataset.level}`)); }
    catch (error) { $('#app-error').textContent = error.message; }
});

$('#level-detail').addEventListener('click', async event => {
    const detail = event.currentTarget;
    if (event.target.classList.contains('close-detail')) { detail.hidden = true; return; }
    const currentLevel = detail.querySelector('.eyebrow')?.textContent.match(/\d+/)?.[0];
    if (!currentLevel) return;
    try {
        if (event.target.classList.contains('remove-rating')) {
            await request(`api/levels/${currentLevel}/user-ratings/${event.target.dataset.account}`, { method: 'DELETE' });
        } else if (event.target.classList.contains('detail-difficulty-save')) {
            await request(`api/levels/${currentLevel}/difficulty`, { method: 'POST', body: JSON.stringify({ difficulty: Number(detail.querySelector('.detail-difficulty').value) }) });
        } else if (event.target.classList.contains('detail-rate')) {
            const stars = Number(detail.querySelector('.detail-stars').value);
            if (stars === 0) await request(`api/levels/${currentLevel}/unrate`, { method: 'POST', body: '{}' });
            else await request('api/rate', { method: 'POST', body: JSON.stringify({ levelId: Number(currentLevel), stars, feature: Number(detail.querySelector('.detail-feature').value), demonDiff: Number(detail.querySelector('.detail-demon').value) }) });
        } else return;
        renderLevelDetail(await request(`api/levels/${currentLevel}`));
    } catch (error) { $('#app-error').textContent = error.message; }
});

$('#logout').addEventListener('click', async () => { try { await request('api/logout', { method: 'POST', body: '{}' }); location.reload(); } catch (error) { $('#app-error').textContent = error.message; } });
load();
