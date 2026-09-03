let csrf = '';
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[character]));
const demonNames = { 3: 'Easy Demon', 4: 'Medium Demon', 0: 'Hard Demon', 5: 'Insane Demon', 6: 'Extreme Demon' };
const featureNames = { 1: 'Featured', 2: 'Epic', 3: 'Legendary', 4: 'Mythic' };
const difficultyNames = { 1: 'Easy', 2: 'Normal', 3: 'Hard', 4: 'Harder', 5: 'Insane' };
const gauntletNames = ['Fire', 'Ice', 'Poison', 'Shadow', 'Lava', 'Bonus', 'Chaos', 'Demon', 'Time', 'Crystal', 'Magic', 'Spike', 'Monster', 'Doom', 'Death', 'Forest', 'Rune', 'Force', 'Spooky', 'Dragon', 'Water', 'Haunted', 'Acid', 'Witch', 'Power', 'Potion', 'Snake', 'Toxic', 'Halloween', 'Treasure', 'Ghost', 'Spider', 'Gem', 'Inferno', 'Portal', 'Strange', 'Fantasy', 'Christmas', 'Surprise', 'Mystery', 'Cursed', 'Cyborg', 'Castle', 'Grave', 'Temple', 'World', 'Galaxy', 'Universe', 'Discord', 'Split', 'NCS I', 'NCS II', 'Space', 'Cosmos', 'Random', 'Chance', 'Future', 'Utopia', 'Cinema', 'Love', 'Duality'];
const selected = (current, value) => Number(current) === Number(value) ? ' selected' : '';
function decodeBase64Url(value) {
    if (!value) return '';
    try {
        const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
        return new TextDecoder().decode(Uint8Array.from(binary, character => character.charCodeAt(0)));
    } catch { return '[Invalid description encoding]'; }
}
function encodeBase64Url(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_');
}
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

function renderCollections(data) {
    $('#gauntlet-list').innerHTML = Array.from({ length: 61 }, (_, index) => {
        const id = index + 1;
        const gauntlet = data.gauntlets.find(item => item.ID === id);
        const levels = gauntlet ? [1, 2, 3, 4, 5].map(slot => gauntlet[`level${slot}`]).join(',') : '';
        return `<form class="collection-form gauntlet-form" data-id="${id}"><strong>${id}. ${gauntletNames[index]}</strong><input name="levels" value="${levels}" placeholder="Five level IDs" aria-label="${gauntletNames[index]} level IDs" required><button type="submit">${gauntlet ? 'Save' : 'Create'}</button>${gauntlet ? '<button type="button" class="reject delete-gauntlet">Delete</button>' : ''}</form>`;
    }).join('');
    $('#map-pack-list').innerHTML = data.mapPacks.length ? data.mapPacks.map(pack => `<form class="collection-form map-pack-row" data-id="${pack.packID}"><input name="packName" value="${escapeHtml(pack.packName)}" required><input name="levels" value="${escapeHtml(pack.levels)}" required><input name="stars" type="number" min="0" value="${pack.stars}" required><input name="coins" type="number" min="0" value="${pack.coins}" required><input name="difficulty" type="number" min="0" max="5" value="${pack.difficulty}" required><span class="color-control"><input class="color-picker" type="color" value="${rgbToHex(pack.barColor) || '#000000'}" aria-label="Bar color picker"><input name="barColor" value="${escapeHtml(pack.barColor)}" pattern="[0-9]+,[0-9]+,[0-9]+" required></span><span class="color-control"><input class="color-picker" type="color" value="${rgbToHex(pack.textColor) || '#000000'}" aria-label="Text color picker"><input name="textColor" value="${escapeHtml(pack.textColor)}" pattern="[0-9]+,[0-9]+,[0-9]+" required></span><button type="submit">Save</button><button type="button" class="reject delete-pack">Delete</button></form>`).join('') : '<p class="empty">No map packs yet.</p>';
    const lists = data.lists || [];
    $('#level-list-list').innerHTML = lists.length ? lists.map(list => `<form class="collection-form level-list-row" data-id="${list.listID}"><label>List name<input name="listName" maxlength="20" value="${escapeHtml(list.listName)}" required></label><label>Description<input name="listDesc" maxlength="1000" value="${escapeHtml(decodeBase64Url(list.listDesc))}"></label><label>Level IDs<input name="listLevels" value="${escapeHtml(list.listLevels)}" required></label><label>Difficulty<input name="starDifficulty" type="number" min="-1" max="10" value="${list.starDifficulty}" required></label><label>Stars reward<input name="starStars" type="number" min="0" max="10" value="${list.starStars}" required></label><label>Featured<select name="featured"><option value="0"${selected(list.featured, 0)}>Not featured</option><option value="1"${selected(list.featured, 1)}>Featured</option></select></label><label>Count for reward<input name="countForReward" type="number" min="0" max="1" value="${list.countForReward}" required></label><label>Original<select name="original"><option value="0"${selected(list.original, 0)}>Reupload</option><option value="1"${selected(list.original, 1)}>Original</option></select></label><label>Visibility<select name="unlisted"><option value="0"${selected(list.unlisted, 0)}>Listed</option><option value="1"${selected(list.unlisted, 1)}>Unlisted</option><option value="2"${selected(list.unlisted, 2)}>Friends</option></select></label><span class="list-meta">#${list.listID} · v${list.listVersion} · ${escapeHtml(list.creator || 'unknown')}</span><button type="submit">Save</button><button type="button" class="reject delete-list">Delete</button></form>`).join('') : '<p class="empty">No level lists yet.</p>';
    syncColorControls($('#map-pack-list'));
}

function renderAccountResults(users) {
    $('#account-results').innerHTML = users.length ? users.map(user => `
        <form class="account-row" data-account="${user.accountID}">
          <div class="account-main">
            <strong>${escapeHtml(user.userName || user.profileName || `Account #${user.accountID}`)}</strong>
            <small>#${user.accountID} · ${user.modLevel === 2 ? 'Elder' : user.modLevel === 1 ? 'Mod' : user.modLevel === 3 ? 'Leaderboard' : 'Player'} · ${user.isDisabled ? 'Disabled' : 'Active'}</small>
          </div>
          <label>Mod level<select name="modLevel"><option value="0"${selected(user.modLevel, 0)}>Player</option><option value="1"${selected(user.modLevel, 1)}>Mod</option><option value="2"${selected(user.modLevel, 2)}>Elder</option><option value="3"${selected(user.modLevel, 3)}>Leaderboard</option></select></label>
          <label>Disabled<select name="isDisabled"><option value="0"${selected(user.isDisabled, 0)}>No</option><option value="1"${selected(user.isDisabled, 1)}>Yes</option></select></label>
          <button type="submit">Save</button>
        </form>
    `).join('') : '<p class="empty">No matching accounts.</p>';
}

function renderSchedule(data) {
    const daily = data.daily || [];
    const weekly = data.weekly || [];
    const display = [
        daily.length ? daily.map(item => `<div class="schedule-item"><strong>Daily #${item.dailyNumber}</strong><span>${escapeHtml(item.levelName)} · #${item.levelID} · ${escapeHtml(item.creator || 'unknown')}</span></div>`).join('') : '<p class="empty">No daily level set.</p>',
        weekly.length ? weekly.map(item => `<div class="schedule-item"><strong>Weekly #${item.dailyNumber - 100000}</strong><span>${escapeHtml(item.levelName)} · #${item.levelID} · ${escapeHtml(item.creator || 'unknown')}</span></div>`).join('') : '<p class="empty">No weekly level set.</p>'
    ];
    $('#schedule-display').innerHTML = display.join('');
}

function renderSongs(songs) {
    $('#song-list').innerHTML = songs.length ? songs.map(song => `<div class="song-row"><div><strong>${escapeHtml(song.name)}</strong><span>${escapeHtml(song.artistName)} · #${song.ID} · ${song.size} MB</span></div><a href="${escapeHtml(song.link)}" target="_blank" rel="noreferrer">Open file</a><button type="button" class="reject delete-song" data-song="${song.ID}">Delete</button></div>`).join('') : '<p class="empty">No songs uploaded.</p>';
}

function renderQuests(quests) {
    const typeNames = { 1: 'Orbs', 2: 'Coins', 3: 'Stars' };
    $('#quest-list').innerHTML = quests.length ? quests.map(quest => `<div class="quest-row"><div><strong>${escapeHtml(quest.name)}</strong><span>${typeNames[quest.type]} · Need ${quest.amount} · ${quest.reward} 💎</span></div><button type="button" class="reject delete-quest" data-quest="${quest.questID}">Delete</button></div>`).join('') : '<p class="empty">No quests created.</p>';
}

function formBody(form) {
    const body = Object.fromEntries(new FormData(form).entries());
    if (form.id === 'level-list-form' || form.classList.contains('level-list-row')) body.listDesc = encodeBase64Url(body.listDesc || '');
    return body;
}

function rgbToHex(value) {
    if (typeof value !== 'string' || !/^\d+,\d+,\d+$/.test(value)) return null;
    const channels = value.split(',').map(Number);
    if (channels.some(channel => channel < 0 || channel > 255)) return null;
    return `#${channels.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}

function hexToRgb(value) {
    const match = /^#([0-9a-f]{6})$/i.exec(value);
    if (!match) return null;
    return match[1].match(/.{2}/g).map(channel => parseInt(channel, 16)).join(',');
}

function syncColorControl(control, fromPicker = false) {
    const picker = control.querySelector('.color-picker');
    const input = control.querySelector('input[name="barColor"], input[name="textColor"]');
    if (!picker || !input) return;
    if (fromPicker) input.value = hexToRgb(picker.value);
    else {
        const hex = rgbToHex(input.value);
        if (hex) picker.value = hex;
    }
}

function syncColorControls(root = document) {
    root.querySelectorAll('.color-control').forEach(control => syncColorControl(control));
}

async function load() {
    try {
        const data = await request('api/bootstrap');
        csrf = data.csrf;
        render(data);
        renderCollections(await request('api/collections'));
        renderSongs((await request('api/songs')).songs);
        renderQuests((await request('api/quests')).quests || []);
        renderAccountResults((await request('api/users?limit=25')).users);
        renderSchedule(await request('api/server-schedule'));
        $('#login-view').hidden = true;
        $('#app-view').hidden = false;
    } catch (error) {
        if (!$('#app-view').hidden) $('#app-error').textContent = error.message;
    }
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

$('#account-search').addEventListener('submit', async event => {
    event.preventDefault();
    const query = new FormData(event.currentTarget).get('query');
    try {
        const data = await request(`api/users?q=${encodeURIComponent(query)}`);
        renderAccountResults(data.users);
    } catch (error) { $('#app-error').textContent = error.message; }
});

$('#server-schedule-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
        const payload = {
            levelId: Number(form.get('levelId')),
            slot: Number(form.get('slot')),
            type: form.get('type'),
            expiresAt: Number(form.get('expiresAt')) || undefined
        };
        await request('api/server-schedule', { method: 'POST', body: JSON.stringify(payload) });
        renderSchedule(await request('api/server-schedule'));
    } catch (error) { $('#app-error').textContent = error.message; }
});

$('#clear-daily').addEventListener('click', async () => {
    try { await request('api/server-schedule/clear', { method: 'POST', body: JSON.stringify({ type: 'daily' }) }); renderSchedule(await request('api/server-schedule')); }
    catch (error) { $('#app-error').textContent = error.message; }
});

$('#clear-weekly').addEventListener('click', async () => {
    try { await request('api/server-schedule/clear', { method: 'POST', body: JSON.stringify({ type: 'weekly' }) }); renderSchedule(await request('api/server-schedule')); }
    catch (error) { $('#app-error').textContent = error.message; }
});

function showTab(name) {
    document.querySelectorAll('.tab').forEach(item => item.classList.toggle('active', item.dataset.tab === name));
    $('#levels-tab').hidden = name !== 'levels';
    $('#collections-tab').hidden = name !== 'collections';
    $('#management-tab').hidden = name !== 'management';
}

document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => showTab(tab.dataset.tab)));
showTab('levels');

document.addEventListener('submit', async event => {
    const form = event.target;
    if (form.id === 'map-pack-form' || form.classList.contains('map-pack-row')) {
        event.preventDefault();
        try { await request(form.dataset.id ? `api/map-packs/${form.dataset.id}` : 'api/map-packs', { method: form.dataset.id ? 'PUT' : 'POST', body: JSON.stringify(formBody(form)) }); await load(); }
        catch (error) { $('#app-error').textContent = error.message; }
    } else if (form.id === 'level-list-form' || form.classList.contains('level-list-row')) {
        event.preventDefault();
        try { await request(form.dataset.id ? `api/lists/${form.dataset.id}` : 'api/lists', { method: form.dataset.id ? 'PUT' : 'POST', body: JSON.stringify(formBody(form)) }); await load(); }
        catch (error) { $('#app-error').textContent = error.message; }
    } else if (form.classList.contains('gauntlet-form')) {
        event.preventDefault();
        try { await request(`api/gauntlets/${form.dataset.id}`, { method: 'PUT', body: JSON.stringify(formBody(form)) }); await load(); }
        catch (error) { $('#app-error').textContent = error.message; }
    } else if (form.classList.contains('account-row')) {
        event.preventDefault();
        try {
            const accountId = form.dataset.account;
            const payload = {
                modLevel: Number(new FormData(form).get('modLevel')),
                isDisabled: Number(new FormData(form).get('isDisabled'))
            };
            await request(`api/users/${accountId}`, { method: 'PUT', body: JSON.stringify(payload) });
            await load();
        } catch (error) { $('#app-error').textContent = error.message; }
    } else if (form.id === 'song-form') {
        event.preventDefault();
        try {
            const response = await fetch('api/songs', { method: 'POST', body: new FormData(form), headers: csrf ? { 'X-CSRF-Token': csrf } : {} });
            if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `Request failed (${response.status})`);
            form.reset();
            renderSongs((await request('api/songs')).songs);
        } catch (error) { $('#app-error').textContent = error.message; }
    } else if (form.id === 'quest-form') {
        event.preventDefault();
        try {
            const formData = new FormData(form);
            const payload = {
                type: Number(formData.get('type')),
                amount: Number(formData.get('amount')),
                reward: Number(formData.get('reward')),
                name: formData.get('name')
            };
            await request('api/quests', { method: 'POST', body: JSON.stringify(payload) });
            form.reset();
            renderQuests((await request('api/quests')).quests || []);
        } catch (error) { $('#app-error').textContent = error.message; }
    }
});

document.addEventListener('input', event => {
    const control = event.target.closest('.color-control');
    if (!control) return;
    if (event.target.classList.contains('color-picker')) syncColorControl(control, true);
    else if (event.target.name === 'barColor' || event.target.name === 'textColor') syncColorControl(control);
});

document.addEventListener('click', async event => {
    if (event.target.classList.contains('delete-song')) {
        try { await request(`api/songs/${event.target.dataset.song}`, { method: 'DELETE' }); renderSongs((await request('api/songs')).songs); }
        catch (error) { $('#app-error').textContent = error.message; }
        return;
    }
    if (event.target.classList.contains('delete-quest')) {
        try { await request(`api/quests/${event.target.dataset.quest}`, { method: 'DELETE' }); renderQuests((await request('api/quests')).quests || []); }
        catch (error) { $('#app-error').textContent = error.message; }
        return;
    }
    const form = event.target.closest('.collection-form');
    if (!form) return;
    const isGauntlet = form.classList.contains('gauntlet-form');
    const isList = form.classList.contains('level-list-row');
    if (!event.target.classList.contains(isList ? 'delete-list' : isGauntlet ? 'delete-gauntlet' : 'delete-pack')) return;
    try { await request(`api/${isList ? 'lists' : isGauntlet ? 'gauntlets' : 'map-packs'}/${form.dataset.id}`, { method: 'DELETE' }); await load(); }
    catch (error) { $('#app-error').textContent = error.message; }
});
load();
