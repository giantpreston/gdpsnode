let csrf = '';
let currentLevels = [];
let dashboardRequestCount = 0;
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[character]));
const demonNames = { 3: 'Easy Demon', 4: 'Medium Demon', 0: 'Hard Demon', 5: 'Insane Demon', 6: 'Extreme Demon' };

function showToast(message, type = 'success') {
    const stack = $('#toast-stack');
    if (!stack) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    stack.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('is-leaving');
        setTimeout(() => toast.remove(), 180);
    }, 2600);
}

function touchLastSaved(message = 'Saved just now') {
    const node = $('#last-saved');
    if (!node) return;
    node.textContent = message;
}

function setDashboardStatus(isBusy) {
    const orb = $('#topbar-status');
    if (!orb) return;
    orb.classList.toggle('is-busy', !!isBusy);
}

function beginDashboardRequest() {
    dashboardRequestCount += 1;
    setDashboardStatus(true);
}

function endDashboardRequest() {
    dashboardRequestCount = Math.max(0, dashboardRequestCount - 1);
    setDashboardStatus(dashboardRequestCount > 0);
}

function setBusyState(button, label = 'Saving…', disabled = true) {
    if (!button) return;
    if (disabled && !button.dataset.defaultText) button.dataset.defaultText = button.textContent;
    button.disabled = disabled;
    if (disabled) button.textContent = label;
    else button.textContent = button.dataset.defaultText || button.textContent;
}

function clearSearchButton(form) {
    const query = form.querySelector('input[name="query"]');
    if (query) query.value = '';
}

function sortLevelResults(levels) {
    const selector = $('#level-sort');
    if (!selector) return levels;
    const mode = selector.value || 'id';
    const copy = [...levels];
    if (mode === 'name') return copy.sort((a, b) => (a.levelName || '').localeCompare(b.levelName || ''));
    if (mode === 'stars') return copy.sort((a, b) => Number(b.starStars || 0) - Number(a.starStars || 0));
    return copy.sort((a, b) => Number(b.levelID) - Number(a.levelID));
}
const featureNames = { 1: 'Featured', 2: 'Epic', 3: 'Legendary', 4: 'Mythic' };
const difficultyNames = { 1: 'Easy', 2: 'Normal', 3: 'Hard', 4: 'Harder', 5: 'Insane' };
const secretRewardItems = [
    [1, 'Fire Shard'], [2, 'Ice Shard'], [3, 'Poison Shard'], [4, 'Shadow Shard'], [5, 'Lava Shard'],
    [6, 'Demon Key'], [7, 'Mana Orbs'], [8, 'Diamonds'], [10, 'Earth Shard'], [11, 'Blood Shard'],
    [12, 'Metal Shard'], [13, 'Light Shard'], [14, 'Soul Shard'], [15, 'Yellow Key'],
    [1001, 'Cube unlock'], [1002, 'Color 1 unlock'], [1003, 'Color 2 unlock'], [1004, 'Ship unlock'],
    [1005, 'Ball unlock'], [1006, 'UFO unlock'], [1007, 'Wave unlock'], [1008, 'Robot unlock'],
    [1009, 'Spider unlock'], [1010, 'Streak unlock'], [1011, 'Death unlock'], [1012, 'GJ item unlock'],
    [1013, 'Swing unlock'], [1014, 'Jetpack unlock'], [1015, 'Ship fire unlock']
];
const secretRewardUnlockDefaults = { 1001: 1, 1002: 1, 1003: 1, 1004: 1, 1005: 1, 1006: 63, 1007: 1, 1008: 1, 1009: 1, 1010: 1, 1011: 1, 1012: 1, 1013: 1, 1014: 1, 1015: 1 };
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
    beginDashboardRequest();
    try {
        const response = await fetch(url, { ...options, headers });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || `Request failed (${response.status})`);
        }
        return response.status === 204 ? null : response.json();
    } finally {
        endDashboardRequest();
    }
}

function suggestionText(suggestion) {
    const demon = suggestion.stars === 10 && suggestion.demonDiff in demonNames ? ` · ${demonNames[suggestion.demonDiff]}` : '';
    const feature = suggestion.feature ? ` · ${featureNames[suggestion.feature]}` : '';
    return `${suggestion.stars}★${demon}${feature} · ${escapeHtml(suggestion.moderator || 'unknown')}`;
}

function render(data) {
    const labels = [['accounts', 'Accounts'], ['levels', 'Levels'], ['moderators', 'Advisors'], ['elders', 'Mods'], ['pending', 'Pending']];
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
    currentLevels = Array.isArray(levels) ? levels : [];
    const ordered = sortLevelResults(currentLevels);
    $('#level-results').innerHTML = ordered.length ? ordered.map(level => `<button class="level-result" data-level="${level.levelID}"><span><strong>${escapeHtml(level.levelName)}</strong><small>#${level.levelID} · ${escapeHtml(level.creator || 'unknown')}</small></span><span>${level.starStars ? `${level.starStars}★` : 'unrated'}${level.starDifficulty ? ` · ${difficultyNames[level.starDifficulty]}` : ''} · ${level.userRates || 0} user ratings</span></button>`).join('') : '<p class="empty">No matching levels.</p>';
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
    $('#level-list-list').innerHTML = lists.length ? lists.map(list => `<form class="collection-form level-list-row" data-id="${list.listID}"><label>List name<input name="listName" maxlength="20" value="${escapeHtml(list.listName)}" required></label><label>Description<input name="listDesc" maxlength="1000" value="${escapeHtml(list.listDesc || '')}"></label><label>Level IDs<input name="listLevels" value="${escapeHtml(list.listLevels)}" required></label><label>Difficulty<input name="starDifficulty" type="number" min="-1" max="10" value="${list.starDifficulty}" required></label><label>Stars reward<input name="starStars" type="number" min="0" max="10" value="${list.starStars}" required></label><label>Featured<select name="featured"><option value="0"${selected(list.featured, 0)}>Not featured</option><option value="1"${selected(list.featured, 1)}>Featured</option></select></label><label>Count for reward<input name="countForReward" type="number" min="0" max="1" value="${list.countForReward}" required></label><label>Original<select name="original"><option value="0"${selected(list.original, 0)}>Reupload</option><option value="1"${selected(list.original, 1)}>Original</option></select></label><label>Visibility<select name="unlisted"><option value="0"${selected(list.unlisted, 0)}>Listed</option><option value="1"${selected(list.unlisted, 1)}>Unlisted</option><option value="2"${selected(list.unlisted, 2)}>Friends</option></select></label><span class="list-meta">#${list.listID} · v${list.listVersion} · ${escapeHtml(list.creator || 'unknown')}</span><button type="submit">Save</button><button type="button" class="reject delete-list">Delete</button></form>`).join('') : '<p class="empty">No level lists yet.</p>';
    syncColorControls($('#map-pack-list'));
}

function renderAccountResults(users) {
    $('#account-results').innerHTML = users.length ? users.map(user => `
        <form class="account-row" data-account="${user.accountID}">
          <div class="account-main">
            <strong>${escapeHtml(user.userName || user.profileName || `Account #${user.accountID}`)}</strong>
            <small>#${user.accountID} · ${user.modLevel === 2 ? 'Mod' : user.modLevel === 1 ? 'Advisor' : user.modLevel === 3 ? 'Leaderboard' : 'Player'} · ${user.isDisabled ? 'Disabled' : 'Active'}</small>
          </div>
          <label>Mod level<select name="modLevel"><option value="0"${selected(user.modLevel, 0)}>Player</option><option value="1"${selected(user.modLevel, 1)}>Advisor</option><option value="2"${selected(user.modLevel, 2)}>Mod</option><option value="3"${selected(user.modLevel, 3)}>Leaderboard</option></select></label>
          <label>Disabled<select name="isDisabled"><option value="0"${selected(user.isDisabled, 0)}>No</option><option value="1"${selected(user.isDisabled, 1)}>Yes</option></select></label>
          <button type="submit">Save</button>
        </form>
    `).join('') : '<p class="empty">No matching accounts.</p>';
}

function renderSchedule(data) {
    const daily = data.daily || [];
    const weekly = data.weekly || [];
    const event = data.event || [];
    const formatType = (type, slot) => {
        if (type === 'daily') return `Daily #${slot}`;
        if (type === 'weekly') return `Weekly #${slot}`;
        return `Event #${slot}`;
    };
    const formatExpiry = unixTime => {
        if (!unixTime) return 'No expiry';
        const date = new Date(Number(unixTime) * 1000);
        if (Number.isNaN(date.getTime())) return 'No expiry';
        return `Expires ${date.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`;
    };
    const display = [
        daily.length ? `<div class="schedule-group"><div class="schedule-header"><strong>Daily</strong><span>${daily.length} active</span></div>${daily.map(item => `<div class="schedule-item"><div class="schedule-item-header"><strong>${formatType('daily', item.dailyNumber)}</strong><button type="button" class="ghost small delete-schedule-slot" data-type="daily" data-slot="${item.dailyNumber}">Remove</button></div><span>${escapeHtml(item.levelName)} · #${item.levelID} · ${escapeHtml(item.creator || 'unknown')}</span><small>${formatExpiry(item.dailyTime)}</small></div>`).join('')}</div>` : '<div class="schedule-group"><div class="schedule-header"><strong>Daily</strong><span>0 active</span></div><p class="empty">No daily level set.</p></div>',
        weekly.length ? `<div class="schedule-group"><div class="schedule-header"><strong>Weekly</strong><span>${weekly.length} active</span></div>${weekly.map(item => `<div class="schedule-item"><div class="schedule-item-header"><strong>${formatType('weekly', item.dailyNumber - 100000)}</strong><button type="button" class="ghost small delete-schedule-slot" data-type="weekly" data-slot="${item.dailyNumber - 100000}">Remove</button></div><span>${escapeHtml(item.levelName)} · #${item.levelID} · ${escapeHtml(item.creator || 'unknown')}</span><small>${formatExpiry(item.dailyTime)}</small></div>`).join('')}</div>` : '<div class="schedule-group"><div class="schedule-header"><strong>Weekly</strong><span>0 active</span></div><p class="empty">No weekly level set.</p></div>',
        event.length ? `<div class="schedule-group"><div class="schedule-header"><strong>Event</strong><span>${event.length} active</span></div>${event.map(item => `<div class="schedule-item"><div class="schedule-item-header"><strong>${formatType('event', item.dailyNumber - 200000)}</strong><button type="button" class="ghost small delete-schedule-slot" data-type="event" data-slot="${item.dailyNumber - 200000}">Remove</button></div><span>${escapeHtml(item.levelName)} · #${item.levelID} · ${escapeHtml(item.creator || 'unknown')}</span><small>${formatExpiry(item.dailyTime)}</small></div>`).join('')}</div>` : '<div class="schedule-group"><div class="schedule-header"><strong>Event</strong><span>0 active</span></div><p class="empty">No event level set.</p></div>'
    ];
    $('#schedule-display').innerHTML = display.join('');
}

function renderSongs(songs) {
    $('#song-list').innerHTML = songs.length ? songs.map(song => `<div class="song-row"><div><strong>${escapeHtml(song.name)}</strong><span>${escapeHtml(song.artistName)} · #${song.ID} · ${song.size} MB</span></div><a href="${escapeHtml(song.link)}" target="_blank" rel="noreferrer">Open file</a><button type="button" class="reject delete-song" data-song="${song.ID}">Delete</button></div>`).join('') : '<p class="empty">No songs uploaded.</p>';
}

function setupDashboardUX() {
    const searchInputs = document.querySelectorAll('.search-bar input[name="query"]');
    searchInputs.forEach(input => {
        input.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                input.value = '';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
    });

    document.addEventListener('keydown', event => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            const target = $('#level-query') || $('#account-query');
            if (target) {
                target.focus();
                target.select();
            }
        }
    });

    document.querySelectorAll('button, input, select').forEach(element => {
        element.addEventListener('focus', () => touchLastSaved('Ready'));
    });
}

function renderQuests(quests) {
    const typeNames = { 1: 'Orbs', 2: 'Coins', 3: 'Stars' };
    $('#quest-list').innerHTML = quests.length ? quests.map(quest => `<div class="quest-row"><div><strong>${escapeHtml(quest.name)}</strong><span>${typeNames[quest.type]} · Need ${quest.amount} · ${quest.reward} 💎</span></div><button type="button" class="reject delete-quest" data-quest="${quest.questID}">Delete</button></div>`).join('') : '<p class="empty">No quests created.</p>';
}

function decodeSecretCode(value) {
    try { return atob(value); } catch { return '[Invalid code]'; }
}

function rewardLabel(rewards) {
    const values = String(rewards || '').split(',').map(Number);
    const names = new Map(secretRewardItems);
    const result = [];
    for (let index = 0; index + 1 < values.length; index += 2) {
        const name = names.get(values[index]) || `Item ${values[index]}`;
        result.push(values[index] >= 1000 ? `${name} #${values[index + 1]}` : `${name} ×${values[index + 1]}`);
    }
    return result.join(' · ');
}

function secretRewardItemOptions() {
    return secretRewardItems.map(([id, name]) => `<option value="${id}">${name}</option>`).join('');
}

function addSecretRewardItem(item = {}) {
    const row = document.createElement('div');
    row.className = 'secret-reward-item';
    row.innerHTML = `<select name="itemID" aria-label="Reward item">${secretRewardItemOptions()}</select><span class="secret-reward-value-label">Quantity</span><input name="total" type="number" min="1" max="999999" value="${item.total || 1}" aria-label="Reward quantity" required><button type="button" class="ghost remove-secret-item">Remove</button>`;
    row.querySelector('[name="itemID"]').value = item.itemID || 1;
    updateSecretRewardValue(row, item.total);
    $('#secret-reward-items').append(row);
}

function updateSecretRewardValue(row, value) {
    const itemID = Number(row.querySelector('[name="itemID"]').value);
    const input = row.querySelector('[name="total"]');
    const unlock = itemID >= 1000;
    input.min = unlock ? '1' : '1';
    input.max = '999999';
    input.value = value || (unlock ? secretRewardUnlockDefaults[itemID] || 1 : 1);
    input.setAttribute('aria-label', unlock ? 'Unlock item ID' : 'Reward quantity');
    const label = row.querySelector('.secret-reward-value-label');
    if (label) label.textContent = unlock ? 'Unlock ID' : 'Quantity';
}

function formatSecretRewardUses(uses) {
    if (uses === -1) return 'Unlimited uses';
    return `${uses} use${uses === 1 ? '' : 's'}`;
}

function formatSecretRewardExpiry(duration, createdAt = 0) {
    const totalSeconds = Number(duration) || 0;
    if (!totalSeconds) return 'Never expires';
    const expiresAt = Number(createdAt) + totalSeconds;
    return `Ends ${new Date(expiresAt * 1000).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`;
}

function isSecretRewardActive(reward) {
    if (!reward || reward.uses === 0) return false;
    const createdAt = Number(reward.createdAt) || 0;
    const duration = Number(reward.duration) || 0;
    const now = Math.floor(Date.now() / 1000);
    if (duration !== 0 && createdAt + duration <= now) return false;
    return true;
}

function renderSecretRewards(rewards) {
    const visible = (rewards || []).filter(isSecretRewardActive);
    $('#secret-reward-list').innerHTML = visible.length ? visible.map(reward => `<div class="quest-row"><div><strong>${escapeHtml(decodeSecretCode(reward.code))}</strong><span>${escapeHtml(rewardLabel(reward.rewards))} · ${formatSecretRewardUses(reward.uses)} · ${formatSecretRewardExpiry(reward.duration, reward.createdAt)}</span></div><div class="row-actions"><button type="button" class="ghost small copy-secret-code" data-code="${escapeHtml(decodeSecretCode(reward.code))}">Copy</button><button type="button" class="reject delete-secret-reward" data-reward="${reward.rewardID}">Delete</button></div></div>`).join('') : '<p class="empty">No active secret codes.</p>';
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
        renderSecretRewards((await request('api/secret-rewards')).rewards || []);
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
    const submit = event.currentTarget.querySelector('button[type="submit"]');
    setBusyState(submit, 'Authorizing…', true);
    try {
        const data = await request('api/login', { method: 'POST', body: JSON.stringify({ username: form.get('username'), password: form.get('password') }) });
        csrf = data.csrf;
        await load();
        showToast('Dashboard opened', 'success');
    } catch (error) { $('#login-error').textContent = error.message; showToast(error.message, 'error'); }
    finally { setBusyState(submit, 'Authorizing…', false); }
});

$('#toggle-password').addEventListener('click', () => {
    const password = $('#login-password');
    if (!password) return;
    const toggle = $('#toggle-password');
    const next = password.type === 'password' ? 'text' : 'password';
    password.type = next;
    toggle.textContent = next === 'password' ? 'Show' : 'Hide';
});

function getDurationSecondsFromForm(form, selector = { preset: '[name="durationPreset"]', days: '[name="durationDays"]', hours: '[name="durationHours"]', minutes: '[name="durationMinutes"]', date: '[name="expiresAt"]', never: '[name="neverExpires"]' }) {
    const neverInput = selector.never ? form.querySelector(selector.never) : null;
    const neverExpires = !!neverInput?.checked;
    if (neverExpires) return 0;

    const preset = (selector.preset ? form.querySelector(selector.preset)?.value : null) || 'custom';
    const customDays = Number((selector.days ? form.querySelector(selector.days)?.value : 0) || 0);
    const customHours = Number((selector.hours ? form.querySelector(selector.hours)?.value : 0) || 0);
    const customMinutes = Number((selector.minutes ? form.querySelector(selector.minutes)?.value : 0) || 0);

    if (preset === '1d') return 86400;
    if (preset === '7d') return 604800;
    if (preset === '30d') return 2592000;
    if (preset === '90d') return 7776000;
    if (preset === '365d') return 31536000;

    const expiresAtValue = form.querySelector(selector.date)?.value;
    if (preset === 'date' && expiresAtValue) {
        const expiresAt = new Date(expiresAtValue);
        if (Number.isNaN(expiresAt.getTime())) throw new Error('Choose a valid expiry date and time');
        const duration = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 1000));
        if (!duration) throw new Error('Expiry date must be later than now');
        return duration;
    }

    const totalSeconds = (customDays * 86400) + (customHours * 3600) + (customMinutes * 60);
    if (totalSeconds <= 0) return 0;
    return totalSeconds;
}

function getSecretRewardDurationFromForm(form) {
    return getDurationSecondsFromForm(form);
}

function updateSecretRewardFormControls(form) {
    const neverExpires = form.querySelector('[name="neverExpires"]')?.checked;
    const preset = form.querySelector('[name="durationPreset"]')?.value || 'custom';
    const durationFields = form.querySelector('.secret-duration-fields');
    const dateField = form.querySelector('.secret-expiry-date');
    const durationDays = form.querySelector('[name="durationDays"]');
    const durationHours = form.querySelector('[name="durationHours"]');
    const durationMinutes = form.querySelector('[name="durationMinutes"]');

    const useCustomLength = !neverExpires && preset === 'custom';
    const useDateField = !neverExpires && preset === 'date';

    if (durationFields) durationFields.hidden = neverExpires || useDateField;
    if (dateField) dateField.hidden = neverExpires || !useDateField;
    if (durationDays) durationDays.disabled = neverExpires || useDateField;
    if (durationHours) durationHours.disabled = neverExpires || useDateField;
    if (durationMinutes) durationMinutes.disabled = neverExpires || useDateField;
}

$('#queue').addEventListener('click', async event => {
    if (!event.target.classList.contains('approve') && !event.target.classList.contains('reject')) return;
    const item = event.target.closest('.queue-item'); if (!item) return;
    const body = { levelId: Number(item.dataset.level) };
    const url = event.target.classList.contains('approve') ? 'api/rate' : 'api/reject';
    if (url.endsWith('/rate')) { body.stars = Number(item.querySelector('.stars').value); body.feature = Number(item.querySelector('.feature').value); body.demonDiff = Number(item.querySelector('.demon').value); }
    const button = event.target;
    setBusyState(button, 'Working…', true);
    try { await request(url, { method: 'POST', body: JSON.stringify(body) }); await load(); showToast(url.includes('rate') ? 'Suggestion rated' : 'Suggestion rejected', 'success'); }
    catch (error) { $('#app-error').textContent = error.message; showToast(error.message, 'error'); }
    finally { setBusyState(button, 'Working…', false); }
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
    const button = event.currentTarget.querySelector('button[type="submit"]');
    setBusyState(button, 'Searching…', true);
    try {
        const data = await request(`api/levels?q=${encodeURIComponent(query)}`);
        renderLevels(data.levels);
        touchLastSaved('Levels ready');
        showToast('Levels refreshed', 'success');
    } catch (error) { $('#app-error').textContent = error.message; showToast(error.message, 'error'); }
    finally { setBusyState(button, 'Searching…', false); }
});

$('#level-sort').addEventListener('change', () => {
    renderLevels(currentLevels);
    showToast('Level list sorted', 'success');
});

$('#clear-level-search').addEventListener('click', () => {
    const form = $('#level-search');
    if (!form) return;
    clearSearchButton(form);
    $('#level-sort').value = 'id';
    renderLevels([]);
    form.dispatchEvent(new Event('submit'));
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
    const button = event.currentTarget.querySelector('button[type="submit"]');
    setBusyState(button, 'Searching…', true);
    try {
        const data = await request(`api/users?q=${encodeURIComponent(query)}`);
        renderAccountResults(data.users);
        touchLastSaved('Accounts ready');
    } catch (error) { $('#app-error').textContent = error.message; showToast(error.message, 'error'); }
    finally { setBusyState(button, 'Searching…', false); }
});

$('#clear-account-search').addEventListener('click', () => {
    const form = $('#account-search');
    if (!form) return;
    clearSearchButton(form);
    form.dispatchEvent(new Event('submit'));
});

$('#server-schedule-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
        const payload = {
            levelId: Number(formData.get('levelId')),
            slot: Number(formData.get('slot')),
            type: formData.get('type'),
            expiresAt: getDurationSecondsFromForm(form, {
                preset: '[name="scheduleExpiryPreset"]',
                days: '[name="scheduleDurationDays"]',
                hours: '[name="scheduleDurationHours"]',
                minutes: '[name="scheduleDurationMinutes"]',
                date: '[name="scheduleExpiresAt"]'
            }) || undefined
        };
        await request('api/server-schedule', { method: 'POST', body: JSON.stringify(payload) });
        form.reset();
        updateScheduleExpiryControls(form);
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

$('#clear-event').addEventListener('click', async () => {
    try { await request('api/server-schedule/clear', { method: 'POST', body: JSON.stringify({ type: 'event' }) }); renderSchedule(await request('api/server-schedule')); }
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
    } else if (form.classList.contains('level-list-row')) {
        event.preventDefault();
        try { await request(`api/lists/${form.dataset.id}`, { method: 'PUT', body: JSON.stringify(formBody(form)) }); await load(); }
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
            beginDashboardRequest();
            const response = await fetch('api/songs', { method: 'POST', body: new FormData(form), headers: csrf ? { 'X-CSRF-Token': csrf } : {} });
            if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `Request failed (${response.status})`);
            form.reset();
            renderSongs((await request('api/songs')).songs);
        } catch (error) { $('#app-error').textContent = error.message; }
        finally { endDashboardRequest(); }
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
    } else if (form.id === 'secret-reward-form') {
        event.preventDefault();
        try {
            const formData = new FormData(form);
            const items = [...document.querySelectorAll('#secret-reward-items .secret-reward-item')].map(row => ({
                itemID: Number(row.querySelector('[name="itemID"]').value),
                total: Number(row.querySelector('[name="total"]').value)
            }));
            const uses = formData.get('usesInfinite') === 'on' ? -1 : Number(formData.get('uses'));
            const duration = getSecretRewardDurationFromForm(form);
            await request('api/secret-rewards', { method: 'POST', body: JSON.stringify({
                code: formData.get('code'), uses, duration, items
            }) });
            form.reset();
            $('#secret-reward-items').innerHTML = '';
            addSecretRewardItem();
            updateSecretRewardFormControls(form);
            renderSecretRewards((await request('api/secret-rewards')).rewards || []);
        } catch (error) { $('#app-error').textContent = error.message; }
    }
});

document.addEventListener('input', event => {
    const control = event.target.closest('.color-control');
    if (!control) return;
    if (event.target.classList.contains('color-picker')) syncColorControl(control, true);
    else if (event.target.name === 'barColor' || event.target.name === 'textColor') syncColorControl(control);
});

document.addEventListener('focusin', event => {
    if (!event.target.matches('select')) return;

    document.querySelectorAll('select.selected').forEach(select => {
        if (select !== event.target) select.classList.remove('selected');
    });

    event.target.classList.add('selected');
});

document.addEventListener('change', event => {
    if (event.target.matches('select')) event.target.classList.remove('selected');
    if (event.target.name === 'itemID') updateSecretRewardValue(event.target.closest('.secret-reward-item'));
    if (event.target.matches('[name="usesInfinite"]') || event.target.matches('[name="neverExpires"]') || event.target.matches('[name="durationPreset"]')) {
        const form = event.target.closest('#secret-reward-form');
        if (form) updateSecretRewardFormControls(form);
    }
});

function updateScheduleExpiryControls(form) {
    const preset = form.querySelector('[name="scheduleExpiryPreset"]')?.value || 'custom';
    const durationFields = form.querySelector('.schedule-duration-fields');
    const dateField = form.querySelector('.schedule-expiry-date');
    const days = form.querySelector('[name="scheduleDurationDays"]');
    const hours = form.querySelector('[name="scheduleDurationHours"]');
    const minutes = form.querySelector('[name="scheduleDurationMinutes"]');

    const useDateField = preset === 'date';
    if (durationFields) durationFields.hidden = useDateField;
    if (dateField) dateField.hidden = !useDateField;
    if (days) days.disabled = useDateField;
    if (hours) hours.disabled = useDateField;
    if (minutes) minutes.disabled = useDateField;
}

const secretRewardForm = document.getElementById('secret-reward-form');
if (secretRewardForm) {
    const usesInput = secretRewardForm.querySelector('[name="uses"]');
    const usesInfinite = secretRewardForm.querySelector('[name="usesInfinite"]');
    const neverExpires = secretRewardForm.querySelector('[name="neverExpires"]');
    const durationPreset = secretRewardForm.querySelector('[name="durationPreset"]');

    const syncSecretRewardUseState = () => {
        if (!usesInput || !usesInfinite) return;
        usesInput.disabled = usesInfinite.checked;
        if (usesInfinite.checked) usesInput.value = '1';
    };

    usesInfinite?.addEventListener('change', syncSecretRewardUseState);
    neverExpires?.addEventListener('change', () => updateSecretRewardFormControls(secretRewardForm));
    durationPreset?.addEventListener('change', () => updateSecretRewardFormControls(secretRewardForm));
    syncSecretRewardUseState();
    updateSecretRewardFormControls(secretRewardForm);
}

const scheduleForm = document.getElementById('server-schedule-form');
if (scheduleForm) {
    const preset = scheduleForm.querySelector('[name="scheduleExpiryPreset"]');
    preset?.addEventListener('change', () => updateScheduleExpiryControls(scheduleForm));
    updateScheduleExpiryControls(scheduleForm);
}

document.addEventListener('click', event => {
    if (!event.target.matches('select')) {
        document.querySelectorAll('select.selected').forEach(select => select.classList.remove('selected'));
    }
});

document.addEventListener('click', async event => {
    if (event.target.classList.contains('copy-secret-code')) {
        const code = event.target.dataset.code || '';
        try {
            if (navigator.clipboard) await navigator.clipboard.writeText(code);
            else {
                const tmp = document.createElement('textarea');
                tmp.value = code;
                document.body.appendChild(tmp);
                tmp.select();
                document.execCommand('copy');
                tmp.remove();
            }
            showToast('Secret code copied', 'success');
        } catch (error) {
            showToast('Copy failed', 'error');
        }
        return;
    }
    if (event.target.classList.contains('delete-schedule-slot')) {
        const slot = Number(event.target.dataset.slot);
        const type = event.target.dataset.type;
        if (!type || !Number.isInteger(slot) || slot < 1) return;
        if (!confirm(`Remove ${type} slot #${slot}?`)) return;
        try { await request(`api/server-schedule/${type}/${slot}`, { method: 'DELETE' }); renderSchedule(await request('api/server-schedule')); showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} slot removed`, 'success'); }
        catch (error) { $('#app-error').textContent = error.message; showToast(error.message, 'error'); }
        return;
    }
    if (event.target.classList.contains('delete-song')) {
        if (!confirm('Delete this song?')) return;
        try { await request(`api/songs/${event.target.dataset.song}`, { method: 'DELETE' }); renderSongs((await request('api/songs')).songs); showToast('Song deleted', 'success'); }
        catch (error) { $('#app-error').textContent = error.message; showToast(error.message, 'error'); }
        return;
    }
    if (event.target.classList.contains('delete-quest')) {
        if (!confirm('Delete this quest?')) return;
        try { await request(`api/quests/${event.target.dataset.quest}`, { method: 'DELETE' }); renderQuests((await request('api/quests')).quests || []); showToast('Quest deleted', 'success'); }
        catch (error) { $('#app-error').textContent = error.message; showToast(error.message, 'error'); }
        return;
    }
    if (event.target.classList.contains('remove-secret-item')) {
        const rows = document.querySelectorAll('#secret-reward-items .secret-reward-item');
        if (rows.length > 1) event.target.closest('.secret-reward-item').remove();
        return;
    }
    if (event.target.classList.contains('add-secret-item')) {
        addSecretRewardItem();
        return;
    }
    if (event.target.classList.contains('delete-secret-reward')) {
        if (!confirm('Delete this secret reward?')) return;
        try { await request(`api/secret-rewards/${event.target.dataset.reward}`, { method: 'DELETE' }); renderSecretRewards((await request('api/secret-rewards')).rewards || []); showToast('Secret reward deleted', 'success'); }
        catch (error) { $('#app-error').textContent = error.message; showToast(error.message, 'error'); }
        return;
    }
    const form = event.target.closest('.collection-form');
    if (!form) return;
    const isGauntlet = form.classList.contains('gauntlet-form');
    const isList = form.classList.contains('level-list-row');
    if (!event.target.classList.contains(isList ? 'delete-list' : isGauntlet ? 'delete-gauntlet' : 'delete-pack')) return;
    if (!confirm('Delete this collection item?')) return;
    try { await request(`api/${isList ? 'lists' : isGauntlet ? 'gauntlets' : 'map-packs'}/${form.dataset.id}`, { method: 'DELETE' }); await load(); showToast('Collection item deleted', 'success'); }
    catch (error) { $('#app-error').textContent = error.message; showToast(error.message, 'error'); }
});

addSecretRewardItem();
setupDashboardUX();
load();
