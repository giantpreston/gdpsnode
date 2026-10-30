let csrf = '';
let currentLevels = [];
let dashboardRequestCount = 0;
let currentModLevel = 0;
let currentLevelDetail = null;
let dashboardFeatures = new Set();
let accountRolePermissions = {};
let accountHasCustomRestrictions = false;
let accountPermissionsChanged = false;
const ACCOUNT_ACTION_FEATURES = ['accountRole', 'accountDisable', 'leaderboardBan', 'commentBan', 'creatorBan', 'accountAccess'];
const accountRecords = new Map();
const picker = { kind: '', query: '', offset: 0, limit: 10, total: 0 };
let scheduleEntries = [];
let scheduleNextSlots = { daily: 1, weekly: 1, event: 1 };
let scheduleSlotManuallyEdited = false;
let scheduleDefaultStartValue = '';
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let newsItems = [];
let newsVersion = 1001;
let newsImages = [];
const moderatorRanks = { 0: 0, 3: 1, 1: 2, 2: 3 };
const moderatorRank = modLevel => moderatorRanks[Number(modLevel)] ?? -1;
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[character]));
const cocosColors = new Set('bcgljyopr adfs'.replace(/\s/g, '').split(''));
const greetings = {
    earlyMorning: [
        'Good Morning!',
        'Rise and Shine!',
        'Morning, Sunshine!',
        'Wakey Wakey!',
        "Look Who's Awake!",
        'The Sun Has Risen!',
        'Good Morning, You Magnificent Human!',
        'Another Day, Another Slay!',
        'Caffeine Required?',
        'Congratulations on Waking Up!',
        'Morning, You Absolute Legend!',
        "You're Awake! That's Progress!",
        "Time to Pretend We're Productive!"
    ],
    morning: [
        'Good Morning!',
        'Top of the Morning!',
        'Have a Beautiful Morning!',
        'Make Today Count!',
        "Let's Make Today Great!",
        'A Bright New Day!',
        'Morning, Sunshine!',
        'Another Day, Another Slay!',
        'The Birds Are Probably Singing!',
        "You're Doing Great! Probably!",
        'Hydration Check!',
        'Rise and Shine, Superstar!'
    ],
    afternoon: [
        'Good Afternoon!',
        'Hope Your Day Is Going Well!',
        'Still Going Strong?',
        'Enjoy Your Afternoon!',
        'Hello There, Daytime Dweller!',
        'Lunch Break Over Yet?',
        'Afternoon Already? Time Flies!',
        "You're Doing Great! Probably!",
        'Hydration Check!',
        'Have You Eaten Today?',
        'The Grind Never Ends!',
        'Look at You, Being Productive!',
        'Midday Madness!',
        'Welcome to the Second Half!'
    ],
    evening: [
        'Good Evening!',
        'Evening, Sunshine!',
        'Time to Unwind!',
        "You've Survived Another Day!",
        'Welcome to the Chill Zone!',
        'The Sun Is Clocking Out!',
        'Professional Relaxation Time!',
        'The Evening Has Entered the Chat!',
        "How's Life Treating You?",
        'The Sky Is Doing Its Thing Again!',
        'Another Day Conquered!',
        'The Vibes Are Immaculate!'
    ],
    night: [
        'Good Evening!',
        'Night Owl Mode!',
        'Burning the Midnight Oil?',
        'The Night Is Young!',
        'Still Awake?',
        'Welcome to the Late Shift!',
        'Sleep Is for the Weak! (Just Kidding.)',
        'The Moon Says Hello!',
        'What Are We Doing Up This Late?',
        'Another Night of Questionable Decisions!',
        "It's Past Your Bedtime!",
        'The Sleep Schedule Has Left the Chat!',
        'Welcome, Creature of the Night!',
        'The Owls Are Watching.',
        '3 AM Thoughts Loading...'
    ],
    lateNight: [
        'Hello, Night Owl!',
        'Midnight Greetings!',
        'Up Late?',
        'Welcome to the Shadow Realm!',
        'The World Is Asleep. You Aren\'t.',
        'Sleep Deprivation Gang!',
        'What Is Bro Doing Awake?',
        'Go to Bed. Seriously.',
        'Time Is An Illusion!',
        'The Midnight Council Welcomes You.',
        'Insomnia Premium™',
        'Greetings, Fellow Sleepless Being.',
        'What are you DOING??!',
        'The Sun Will Be Back Eventually.',
        'You Should Probably Be Sleeping.',
        'Someone is up when they shouldn\'t be.',
        'Coffee and Prayers.',
        'The Rotting Hours Have Begun.'
    ],
    universal: [
        'Ahoy, Matey!',
        'Well, Well, Well...',
        'Look Who Decided to Show Up!',
        'Greetings, Earthling.',
        'Beep Boop!',
        'Welcome Back, Gamer.',
        "You've Been Spotted.",
        'A Wild Visitor Appeared!',
        'Hello There, General Kenobi!',
        "What's Cooking, Good Looking?",
        'GEEEET OUT!!',
        'The Council Has Summoned You.',
        'Welcome to the Internet!',
        'Certified Human Detected.',
        'Another Victim... I Mean Visitor!',
        "Nice Weather We're Having.",
        'Your Presence Has Been Acknowledged.',
        'The Department of Greetings Welcomes You.',
        'You Have Unlocked: Website.',
        'Somebody Call the Welcome Committee!',
        'No Thoughts, Just Vibes.',
        'Paws on the keyboard!',
        'The Website Missed You. Probably.',
        'You Again? Excellent.',
        'The Prophecy Has Been Fulfilled.',
        'You Look... Rendered Today.',
        'A Very Normal Greeting for a Very Normal Person.',
        'The Vibes Are Immaculate!',
        'Behold! A Visitor!',
        'Whatcha doin\' in my swamp?',
        'I\'m something of a programmer myself.',
        'Greetings, Carbon-Based Lifeform.',
        'The Algorithm Has Chosen You.'
    ]
};

function renderGreeting(username) {
    const hour = new Date().getHours();
    const timeOfDay = hour < 4 ? 'lateNight'
        : hour < 8 ? 'earlyMorning'
            : hour < 12 ? 'morning'
                : hour < 17 ? 'afternoon'
                    : hour < 21 ? 'evening'
                        : 'night';
    const timeLabels = {
        earlyMorning: 'EARLY MORNING',
        morning: 'MORNING',
        afternoon: 'AFTERNOON',
        evening: 'EVENING',
        night: 'NIGHT SHIFT',
        lateNight: 'LATE NIGHT'
    };
    const options = Math.random() < 0.2 ? greetings.universal : greetings[timeOfDay];
    $('#greeting-message').textContent = options[Math.floor(Math.random() * options.length)];
    $('#greeting-period').textContent = timeLabels[timeOfDay];
    $('#greeting-username').textContent = username;
    const nameParts = String(username ?? '').trim().split(/\s+/).filter(Boolean);
    const initials = nameParts.length > 1
        ? nameParts.slice(0, 2).map(part => Array.from(part)[0]).join('')
        : Array.from(nameParts[0] || '').slice(0, 2).join('');
    $('#greeting-avatar').textContent = initials.toUpperCase();
}

function renderCocosText(value) {
    const source = String(value ?? '');
    const tagPattern = /<\/?c[a-z]?>/gi;
    let output = '';
    let cursor = 0;
    let open = false;
    for (const match of source.matchAll(tagPattern)) {
        output += escapeHtml(source.slice(cursor, match.index));
        const tag = match[0].toLowerCase();
        if (tag === '</c>') {
            if (open) output += '</span>';
            open = false;
        } else {
            if (open) output += '</span>';
            const colorCode = tag.slice(2, -1);
            const colorClass = cocosColors.has(colorCode) ? `cocos-color-${colorCode}` : 'cocos-color-unknown';
            output += `<span class="${colorClass}">`;
            open = true;
        }
        cursor = match.index + match[0].length;
    }
    output += escapeHtml(source.slice(cursor));
    if (open) output += '</span>';
    return output;
}
const demonNames = { 3: 'Easy Demon', 4: 'Medium Demon', 0: 'Hard Demon', 5: 'Insane Demon', 6: 'Extreme Demon' };
const listDemonNames = { 6: 'Easy Demon', 7: 'Medium Demon', 8: 'Hard Demon', 9: 'Insane Demon', 10: 'Extreme Demon' };

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
    const selector = $('#browse-sort');
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
const gauntletNames = ['Fire', 'Ice', 'Poison', 'Shadow', 'Lava', 'Bonus', 'Chaos', 'Demon', 'Time', 'Crystal', 'Magic', 'Spike', 'Monster', 'Doom', 'Death', 'Forest', 'Rune', 'Force', 'Spooky', 'Dragon', 'Water', 'Haunted', 'Acid', 'Witch', 'Power', 'Potion', 'Snake', 'Toxic', 'Halloween', 'Treasure', 'Ghost', 'Spider', 'Gem', 'Inferno', 'Portal', 'Strange', 'Fantasy', 'Christmas', 'Surprise', 'Mystery', 'Cursed', 'Cyborg', 'Castle', 'Grave', 'Temple', 'World', 'Galaxy', 'Universe', 'Discord', 'Split', 'NCS I', 'NCS II', 'Space', 'Cosmos', 'Random', 'Chance', 'Future', 'Utopia', 'Cinema', 'Love', 'Duality', 'Paradox'];
const selected = (current, value) => Number(current) === Number(value) ? ' selected' : '';
function decodeBase64Url(value) {
    if (!value) return '';
    try {
        const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
        const binary = atob(padded);
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
    const coins = suggestion.starCoins ? ' · Verified Coins' : '';
    return `${suggestion.stars}★${demon}${feature}${coins} · ${escapeHtml(suggestion.moderator || 'unknown')}`;
}

function render(data) {
    $('#server-motd').innerHTML = renderCocosText(data.motd);
    const labels = [['accounts', 'Accounts'], ['levels', 'Levels'], ['moderators', 'Advisors'], ['elders', 'Mods'], ['pending', 'Pending']];
    $('#stats').innerHTML = data.stats ? labels.map(([key, label]) => `<div class="stat"><span>${label}</span><strong>${data.stats[key].toLocaleString()}</strong></div>`).join('') : '';

    const grouped = [...data.pending.reduce((levels, suggestion) => {
    if (!levels.has(suggestion.levelID)) levels.set(suggestion.levelID, { ...suggestion, suggestions: [] });
    levels.get(suggestion.levelID).suggestions.push(suggestion);
    return levels;
    }, new Map()).values()];
    $('#queue-count').textContent = `${grouped.length} levels · ${data.pending.length} suggestions`;
    $('#queue').innerHTML = grouped.length ? grouped.map(level => {
    const first = level.suggestions[0];
    return `<article class="queue-item" data-level="${level.levelID}"><div class="level-line"><span class="level-name">${escapeHtml(level.levelName)}</span><span class="level-id">#${level.levelID}</span></div><div class="details">${level.suggestions.length > 1 ? `${level.suggestions.length} moderator suggestions` : '1 moderator suggestion'}</div><div class="suggestions">${level.suggestions.map(suggestion => `<div class="suggestion">${suggestionText(suggestion)}</div>`).join('')}</div><div class="actions"><label>Stars<select class="stars"><option value="1"${selected(first.stars, 1)}>1</option><option value="2"${selected(first.stars, 2)}>2</option><option value="3"${selected(first.stars, 3)}>3</option><option value="4"${selected(first.stars, 4)}>4</option><option value="5"${selected(first.stars, 5)}>5</option><option value="6"${selected(first.stars, 6)}>6</option><option value="7"${selected(first.stars, 7)}>7</option><option value="8"${selected(first.stars, 8)}>8</option><option value="9"${selected(first.stars, 9)}>9</option><option value="10"${selected(first.stars, 10)}>10</option></select></label><label>Feature<select class="feature"><option value="0"${selected(first.feature, 0)}>None</option><option value="1"${selected(first.feature, 1)}>Featured</option><option value="2"${selected(first.feature, 2)}>Epic</option><option value="3"${selected(first.feature, 3)}>Legendary</option><option value="4"${selected(first.feature, 4)}>Mythic</option></select></label><label>Demon<select class="demon"><option value="0"${selected(first.demonDiff, 0)}>None / Hard</option><option value="3"${selected(first.demonDiff, 3)}>Easy</option><option value="4"${selected(first.demonDiff, 4)}>Medium</option><option value="5"${selected(first.demonDiff, 5)}>Insane</option><option value="6"${selected(first.demonDiff, 6)}>Extreme</option></select></label><label class="queue-coins"><input class="star-coins" type="checkbox"${first.starCoins ? ' checked' : ''}> Verified Coins</label><button class="approve">Rate</button><button class="reject">Reject</button></div></article>`;
    }).join('') : '<p class="empty">The queue is clear.</p>';
    document.querySelectorAll('.queue-item').forEach(syncDemonControl);

    $('#recent').innerHTML = data.recent.length ? data.recent.map(item => { const rarity = item.starEpic ? featureNames[item.starEpic + 1] : item.featured ? 'Featured' : ''; const demon = item.starDemon ? demonNames[item.starDemonDiff] || 'Demon' : ''; const rating = item.starStars ? `${item.starStars}★${item.starAuto ? ' · Auto' : ''}${demon ? ` · ${demon}` : ''}` : 'unrated'; const difficulty = item.starDifficulty ? difficultyNames[item.starDifficulty] : ''; return `<article class="recent-item"><div><div class="level-name">${escapeHtml(item.levelName)}</div><div class="details">#${item.levelID} · ${escapeHtml(item.creator || 'unknown')}</div></div><div class="recent-meta"><span class="badge">${rating}</span><br>${difficulty}${difficulty && rarity ? ' · ' : ''}${rarity}</div></article>`; }).join('') : '<p class="empty">No levels yet.</p>';
}

function renderLevels(levels) {
    currentLevels = Array.isArray(levels) ? levels : [];
    const ordered = sortLevelResults(currentLevels);
    $('#browse-results').innerHTML = ordered.length ? ordered.map(level => `<button class="level-result" data-level="${level.levelID}"><span><strong>${escapeHtml(level.levelName)}</strong><small>#${level.levelID} · ${escapeHtml(level.creator || 'unknown')}</small></span><span>${level.starStars ? `${level.starStars}★` : 'unrated'}${level.starDifficulty ? ` · ${difficultyNames[level.starDifficulty]}` : ''} · ${level.userRates || 0} user ratings</span></button>`).join('') : '<p class="empty">No matching levels.</p>';
}

function renderLists(lists) {
    $('#browse-results').innerHTML = lists.length ? lists.map(list => `<button class="level-result list-result" data-list="${list.listID}"><span><strong>${escapeHtml(list.listName)}</strong><small>#${list.listID} · ${escapeHtml(list.creator || 'unknown')} · ${String(list.listLevels || '').split(',').filter(Boolean).length} levels</small></span><span>${list.starStars || 0} diamonds · ${listDemonNames[list.starDifficulty] || `Difficulty ${list.starDifficulty}`}</span></button>`).join('') : '<p class="empty">No matching lists.</p>';
}

function renderListEditor(list) {
    const levelCount = String(list.listLevels || '').split(',').filter(Boolean).length;
    const original = Number(list.original) || 0;
    const detail = $('#level-detail');
    detail.style.removeProperty('left');
    detail.style.removeProperty('top');
    detail.style.removeProperty('transform');
    detail.classList.remove('is-dragging');
    detail.hidden = false;
    detail.innerHTML = `<div class="detail-heading"><div><p class="eyebrow">List #${list.listID}</p><h3>${escapeHtml(list.listName)}</h3></div><button class="close-detail" type="button">Close</button></div><form class="collection-form level-list-row list-editor" data-id="${list.listID}"><label>List name<input name="listName" maxlength="20" value="${escapeHtml(list.listName)}" required></label><label>Description<textarea name="listDesc" maxlength="1000">${escapeHtml(list.listDesc || '')}</textarea></label><label>Level IDs<input name="listLevels" value="${escapeHtml(list.listLevels)}" required></label><label>Difficulty<select name="starDifficulty" required><option value="-1"${selected(list.starDifficulty, -1)}>Unrated</option><option value="0"${selected(list.starDifficulty, 0)}>Auto / None</option><option value="1"${selected(list.starDifficulty, 1)}>Easy</option><option value="2"${selected(list.starDifficulty, 2)}>Normal</option><option value="3"${selected(list.starDifficulty, 3)}>Hard</option><option value="4"${selected(list.starDifficulty, 4)}>Harder</option><option value="5"${selected(list.starDifficulty, 5)}>Insane</option><option value="6"${selected(list.starDifficulty, 6)}>Easy Demon</option><option value="7"${selected(list.starDifficulty, 7)}>Medium Demon</option><option value="8"${selected(list.starDifficulty, 8)}>Hard Demon</option><option value="9"${selected(list.starDifficulty, 9)}>Insane Demon</option><option value="10"${selected(list.starDifficulty, 10)}>Extreme Demon</option></select></label><label>Diamonds reward<input name="starStars" type="number" min="0" step="1" value="${list.starStars}" required></label><label>Featured<select name="featured"><option value="0"${selected(list.featured, 0)}>Not featured</option><option value="1"${selected(list.featured, 1)}>Featured</option></select></label><label>Count for reward<input name="countForReward" type="number" min="0" max="${levelCount}" value="${list.countForReward}" required></label><label>List type<select class="list-original-mode"><option value="0"${selected(original, 0)}>Original</option><option value="1"${original !== 0 ? ' selected' : ''}>Reupload</option></select><input class="list-original-id" type="number" min="1" step="1" value="${original || 1}"${original === 0 ? ' hidden' : ''} aria-label="Original list ID"><input name="original" type="hidden" value="${original}"></label><label>Visibility<select name="unlisted"><option value="0"${selected(list.unlisted, 0)}>Listed</option><option value="1"${selected(list.unlisted, 1)}>Friends</option><option value="2"${selected(list.unlisted, 2)}>Unlisted (by ID)</option></select></label><span class="list-meta">v${list.listVersion} · ${escapeHtml(list.creator || 'unknown')}</span><button type="submit">Save</button><button type="button" class="reject delete-list">Delete</button></form>`;
    syncFeaturedListVisibility(detail);
    const dragHandle = detail.querySelector('.detail-heading');
    dragHandle.classList.add('detail-drag-handle');
    dragHandle.title = 'Drag to move';
                $('#level-detail').querySelector('.list-original-id').required = Number(list.original) !== 0;
}

function renderVoteChart(kind, data) {
    const definitions = {
        ratings: {
            title: 'User star ratings',
            items: data.ratings,
            getValue: item => `${item.stars}★`,
            values: Array.from({ length: 10 }, (_, index) => `${index + 1}★`)
        },
        demons: {
            title: 'Community demon votes',
            items: data.demonRatings,
            getValue: item => demonNames[item.demonDiff] || 'Other',
            values: ['Easy Demon', 'Medium Demon', 'Hard Demon', 'Insane Demon', 'Extreme Demon']
        },
        'advisor-stars': {
            title: 'Advisor suggested stars',
            items: data.suggestions,
            getValue: item => `${item.stars}★`,
            values: Array.from({ length: 10 }, (_, index) => `${index + 1}★`)
        },
        'advisor-demons': {
            title: 'Advisor suggested demon difficulty',
            items: data.suggestions.filter(item => Number(item.stars) === 10),
            getValue: item => demonNames[item.demonDiff] || 'Other',
            values: ['Easy Demon', 'Medium Demon', 'Hard Demon', 'Insane Demon', 'Extreme Demon']
        }
    };
    const chart = definitions[kind] || definitions.ratings;
    const counts = new Map(chart.values.map(value => [value, 0]));
    for (const item of chart.items) {
        const value = chart.getValue(item);
        counts.set(value, (counts.get(value) || 0) + 1);
    }
    const max = Math.max(1, ...counts.values());
    const rows = [...counts].map(([label, count]) => {
        const width = count ? Math.max(5, Math.ceil(count / max * 20) * 5) : 0;
        return `<div class="vote-chart-row"><span>${escapeHtml(label)}</span><span class="vote-chart-track"><span class="vote-chart-fill" data-width="${width}"></span></span><strong>${count}</strong></div>`;
    }).join('');
    $('#vote-chart').innerHTML = `<div class="vote-chart-heading"><strong>${chart.title}</strong><span>${chart.items.length} vote${chart.items.length === 1 ? '' : 's'}</span></div>${chart.items.length ? `<div class="vote-chart-rows">${rows}</div>` : '<p class="empty">No votes or suggestions to chart.</p>'}`;
    $('#level-detail').querySelectorAll('[data-vote-chart]').forEach(button => {
        button.classList.toggle('active', button.dataset.voteChart === kind);
        button.setAttribute('aria-pressed', String(button.dataset.voteChart === kind));
    });
}

function renderLevelDetail(data) {
    const level = data.level;
    const official = level.starStars ? `${level.starStars}★${level.starAuto ? ' · Auto' : ''}${level.starDemon ? ` · ${demonNames[level.starDemonDiff] || 'Demon'}` : ''}` : 'Unrated';
    const difficulty = level.starDifficulty ? difficultyNames[level.starDifficulty] : 'Unset';
    const rarity = level.starEpic ? featureNames[level.starEpic + 1] : level.featured ? 'Featured' : 'None';
    const feature = level.starEpic ? level.starEpic + 1 : level.featured ? 1 : 0;
    const detail = $('#level-detail');
    detail.style.removeProperty('left');
    detail.style.removeProperty('top');
    detail.style.removeProperty('transform');
    detail.classList.remove('is-dragging');
    $('#level-detail').hidden = false;
    $('#level-detail').innerHTML = `<div class="detail-heading"><div><p class="eyebrow">Level #${level.levelID}</p><h3>${escapeHtml(level.levelName)}</h3></div><button class="close-detail" type="button">Close</button></div><p class="detail-description">${escapeHtml(level.levelDesc || 'No description')}</p><div class="detail-facts"><span>Official <b>${official}</b></span><span>Difficulty <b>${difficulty}</b></span><span>Rarity <b>${rarity}</b></span><span>Users <b>${level.userRates || 0} ratings · ${level.avgUserRate || 0}★ avg</b></span><span>Stats <b>${level.downloads || 0} downloads · ${level.likes || 0} likes</b></span></div><div class="detail-columns"><div><h4>Moderator suggestions (${data.suggestions.length})</h4>${data.suggestions.length ? data.suggestions.map(suggestion => `<div class="suggestion">${suggestionText(suggestion)}</div>`).join('') : '<p class="empty">None</p>'}</div><div><h4>User ratings</h4>${data.ratings.length ? data.ratings.map(rating => `<div class="user-rating"><span>${escapeHtml(rating.userName || `Account #${rating.accountID}`)} · ${rating.stars}★</span><button class="remove-rating" data-account="${rating.accountID}" type="button">Remove</button></div>`).join('') : '<p class="empty">No user ratings</p>'}<h4>Demon votes (${data.demonRatings.length})</h4>${data.demonRatings.length ? data.demonRatings.map(rating => `<div class="user-rating"><span>${escapeHtml(rating.userName || `Account #${rating.accountID}`)} · ${escapeHtml(demonNames[rating.demonDiff] || 'Demon')}${rating.mode === 1 && [1, 2].includes(Number(rating.modLevel)) ? ' · Priority' : ''}</span><button class="remove-demon-rating" data-account="${rating.accountID}" type="button">Remove</button></div>`).join('') : '<p class="empty">No demon votes</p>'}</div></div><div class="detail-actions"><label>Difficulty<select class="detail-difficulty"${level.starStars ? ' disabled' : ''}><option value="0"${selected(level.starDifficulty, 0)}>Unset</option><option value="1"${selected(level.starDifficulty, 1)}>Easy</option><option value="2"${selected(level.starDifficulty, 2)}>Normal</option><option value="3"${selected(level.starDifficulty, 3)}>Hard</option><option value="4"${selected(level.starDifficulty, 4)}>Harder</option><option value="5"${selected(level.starDifficulty, 5)}>Insane</option></select></label><button class="detail-difficulty-save" type="button"${level.starStars ? ' disabled' : ''}>Save difficulty</button><label>Stars<select class="detail-stars"><option value="0"${selected(level.starStars, 0)}>Unrate</option><option value="1"${selected(level.starStars, 1)}>1</option><option value="2"${selected(level.starStars, 2)}>2</option><option value="3"${selected(level.starStars, 3)}>3</option><option value="4"${selected(level.starStars, 4)}>4</option><option value="5"${selected(level.starStars, 5)}>5</option><option value="6"${selected(level.starStars, 6)}>6</option><option value="7"${selected(level.starStars, 7)}>7</option><option value="8"${selected(level.starStars, 8)}>8</option><option value="9"${selected(level.starStars, 9)}>9</option><option value="10"${selected(level.starStars, 10)}>10</option></select></label><label>Feature<select class="detail-feature"><option value="0"${selected(feature, 0)}>None</option><option value="1"${selected(feature, 1)}>Featured</option><option value="2"${selected(feature, 2)}>Epic</option><option value="3"${selected(feature, 3)}>Legendary</option><option value="4"${selected(feature, 4)}>Mythic</option></select></label><label>Demon<select class="detail-demon"><option value="0"${selected(level.starDemon ? level.starDemonDiff : 0, 0)}>None / Hard</option><option value="3"${selected(level.starDemonDiff, 3)}>Easy</option><option value="4"${selected(level.starDemonDiff, 4)}>Medium</option><option value="5"${selected(level.starDemonDiff, 5)}>Insane</option><option value="6"${selected(level.starDemonDiff, 6)}>Extreme</option></select></label><label class="detail-star-coins-control"><input class="detail-star-coins" type="checkbox"${level.starCoins ? ' checked' : ''}> Verified Coins</label><button class="detail-rate" type="button">Save rating</button></div>`;
    $('#level-detail').querySelector('.detail-description').textContent = decodeBase64Url(level.levelDesc) || 'No description';
    currentLevelDetail = data;
    $('#level-detail').querySelector('.detail-actions').insertAdjacentHTML('beforebegin', `<section class="vote-analytics" aria-label="Rating and suggestion charts"><div class="vote-chart-toolbar" role="group" aria-label="Choose chart"><button type="button" class="ghost small active" data-vote-chart="ratings">User ratings</button><button type="button" class="ghost small" data-vote-chart="demons">Demon votes</button><button type="button" class="ghost small" data-vote-chart="advisor-stars">Advisor stars</button><button type="button" class="ghost small" data-vote-chart="advisor-demons">Advisor demons</button></div><div id="vote-chart" aria-live="polite"></div></section>`);
    renderVoteChart('ratings', data);
    const dragHandle = $('#level-detail').querySelector('.detail-heading');
    dragHandle.classList.add('detail-drag-handle');
    dragHandle.title = 'Drag to move';
    $('#level-detail').insertAdjacentHTML('beforeend', `<div class="detail-metadata"><label>Name<input class="detail-level-name" maxlength="20" value="${escapeHtml(level.levelName)}" required></label><label>Description<textarea class="detail-level-description">${escapeHtml(decodeBase64Url(level.levelDesc))}</textarea></label><label class="detail-coins"><input class="detail-star-coins" type="checkbox"${level.starCoins ? ' checked' : ''}> Verified Coins</label><button class="detail-metadata-save" type="button">Save level details</button></div>`);
    $('#level-detail').insertAdjacentHTML('beforeend', `<button class="reject detail-delete-level" type="button" data-level="${level.levelID}">Delete level</button>`);
    syncDemonControl($('#level-detail'));
}

function renderCollections(data) {
    $('#gauntlet-list').innerHTML = Array.from({ length: 62 }, (_, index) => {
        const id = index + 1;
        const gauntlet = data.gauntlets.find(item => item.ID === id);
        const levels = gauntlet ? [1, 2, 3, 4, 5].map(slot => gauntlet[`level${slot}`]).join(',') : '';
        return `<form class="collection-form gauntlet-form" data-id="${id}"><strong>${id}. ${gauntletNames[index]}</strong><input name="levels" value="${levels}" placeholder="Five level IDs" aria-label="${gauntletNames[index]} level IDs" required><button type="submit">${gauntlet ? 'Save' : 'Create'}</button>${gauntlet ? '<button type="button" class="reject delete-gauntlet">Delete</button>' : ''}</form>`;
    }).join('');
    $('#map-pack-list').innerHTML = data.mapPacks.length ? data.mapPacks.map(pack => `<form class="collection-form map-pack-row" data-id="${pack.packID}"><label class="collection-field" data-label="Pack name"><input name="packName" aria-label="Pack name" value="${escapeHtml(pack.packName)}" required></label><label class="collection-field" data-label="Level IDs"><input name="levels" aria-label="Level IDs" value="${escapeHtml(pack.levels)}" required></label><label class="collection-field" data-label="Stars"><input name="stars" type="number" min="0" aria-label="Stars" value="${pack.stars}" required></label><label class="collection-field" data-label="Coins"><input name="coins" type="number" min="0" aria-label="Coins" value="${pack.coins}" required></label><label class="collection-field" data-label="Difficulty"><input name="difficulty" type="number" min="0" max="5" aria-label="Difficulty" value="${pack.difficulty}" required></label><label class="collection-field" data-label="Bar color"><span class="color-control"><input class="color-picker" type="color" value="${rgbToHex(pack.barColor) || '#000000'}" aria-label="Bar color picker"><input name="barColor" aria-label="Bar color RGB" value="${escapeHtml(pack.barColor)}" pattern="[0-9]+,[0-9]+,[0-9]+" required></span></label><label class="collection-field" data-label="Text color"><span class="color-control"><input class="color-picker" type="color" value="${rgbToHex(pack.textColor) || '#000000'}" aria-label="Text color picker"><input name="textColor" aria-label="Text color RGB" value="${escapeHtml(pack.textColor)}" pattern="[0-9]+,[0-9]+,[0-9]+" required></span></label><div class="row-actions"><button type="submit">Save</button><button type="button" class="reject delete-pack">Delete</button></div></form>`).join('') : '<p class="empty">No map packs yet.</p>';
    const lists = data.lists || [];
    $('#level-list-list').innerHTML = lists.length ? lists.map(list => `<form class="collection-form level-list-row" data-id="${list.listID}"><label>List name<input name="listName" maxlength="20" value="${escapeHtml(list.listName)}" required></label><label>Description<input name="listDesc" maxlength="1000" value="${escapeHtml(list.listDesc || '')}"></label><label>Level IDs<input name="listLevels" value="${escapeHtml(list.listLevels)}" required></label><label>Difficulty<input name="starDifficulty" type="number" min="-1" max="10" value="${list.starDifficulty}" required></label><label>Stars reward<input name="starStars" type="number" min="0" max="10" value="${list.starStars}" required></label><label>Featured<select name="featured"><option value="0"${selected(list.featured, 0)}>Not featured</option><option value="1"${selected(list.featured, 1)}>Featured</option></select></label><label>Count for reward<input name="countForReward" type="number" min="0" max="${String(list.listLevels || '').split(',').filter(Boolean).length}" value="${list.countForReward}" required></label><label>Original<select name="original"><option value="0"${selected(list.original, 0)}>Reupload</option><option value="1"${selected(list.original, 1)}>Original</option></select></label><label>Visibility<select name="unlisted"><option value="0"${selected(list.unlisted, 0)}>Listed</option><option value="1"${selected(list.unlisted, 1)}>Friends</option><option value="2"${selected(list.unlisted, 2)}>Unlisted (by ID)</option></select></label><span class="list-meta">#${list.listID} · v${list.listVersion} · ${escapeHtml(list.creator || 'unknown')}</span><button type="submit">Save</button><button type="button" class="reject delete-list">Delete</button></form>`).join('') : '<p class="empty">No level lists yet.</p>';
    $('#level-list-list').querySelectorAll('.level-list-row').forEach(syncFeaturedListVisibility);
    syncColorControls($('#map-pack-list'));
}

function renderAccountResults(users) {
        accountRecords.clear();
        users.forEach(user => accountRecords.set(String(user.accountID), user));
        $('#browse-results').innerHTML = users.length ? users.map(user => {
                const role = ['Player', 'Advisor', 'Mod', 'Leaderboard mod'][user.modLevel] || 'Player';
                const status = user.isDisabled ? 'Disabled' : user.leaderboardBan ? 'Leaderboard banned' : 'Active';
                return `<article class="account-row account-result"><div class="account-main"><strong>${escapeHtml(user.userName || user.profileName || `Account #${user.accountID}`)}</strong><small>#${user.accountID} · ${role} · ${status}</small></div><button class="account-manage" type="button" data-account="${user.accountID}">Manage</button></article>`;
        }).join('') : '<p class="empty">No matching accounts.</p>';
}

function renderAccountManager(user, access) {
        const expiresAt = Number(user.commentBan || 0);
        const activeBan = expiresAt > Math.floor(Date.now() / 1000);
        const roles = ['Player', 'Advisor', 'Mod', 'Leaderboard mod'];
        const roleOptions = roles.map((label, level) => moderatorRank(level) <= moderatorRank(currentModLevel)
                ? `<option value="${level}"${selected(user.modLevel, level)}>${label}</option>`
                : '').join('');
        accountRolePermissions = access.rolePermissions || {};
        accountHasCustomRestrictions = Boolean(access.customRestrictions);
        accountPermissionsChanged = false;
        const activePermissions = accountRolePermissions[user.modLevel] || access.defaults;
        const permissionOptions = access.featureCatalog.map(feature => {
            const included = activePermissions.includes(feature.key);
                return `<label class="permission-check${included ? '' : ' unavailable'}"><input type="checkbox" name="feature" value="${escapeHtml(feature.key)}"${access.features.includes(feature.key) ? ' checked' : ''}${included ? '' : ' disabled'}><span>${escapeHtml(feature.label)}</span></label>`;
        }).join('');

        $('#account-title').textContent = user.userName || user.profileName || `Account #${user.accountID}`;
        $('#account-detail-content').innerHTML = `
            <form id="account-form" class="account-form" data-account="${user.accountID}">
                <p class="account-id">Account #${user.accountID}</p>
                <div class="moderation-grid">
                    <label data-account-feature="accountRole">Moderator role<select name="modLevel">${roleOptions}</select></label>
                    <label data-account-feature="accountDisable">Disabled<select name="isDisabled"><option value="0"${selected(user.isDisabled, 0)}>No</option><option value="1"${selected(user.isDisabled, 1)}>Yes</option></select></label>
                    <label data-account-feature="leaderboardBan">Leaderboard ban<select name="leaderboardBan"><option value="0"${selected(user.leaderboardBan || 0, 0)}>No</option><option value="1"${selected(user.leaderboardBan || 0, 1)}>Yes</option></select></label>
                    <label data-account-feature="commentBan">Comment ban<div class="expiry-stack"><select name="commentBanPreset"><option value="none"${Number(user.commentBan || 0) <= Math.floor(Date.now() / 1000) ? ' selected' : ''}>No temporary ban</option><option value="1d">1 day</option><option value="custom">Custom length</option><option value="7d">7 days</option><option value="30d">30 days</option><option value="90d">90 days</option><option value="365d">365 days</option><option value="date"${activeBan ? ' selected' : ''}>Specific date/time</option></select><div class="comment-ban-duration-fields" hidden><div class="mini-grid"><input name="commentBanDays" type="number" min="0" step="1" value="0" placeholder="days"><input name="commentBanHours" type="number" min="0" max="23" step="1" value="0" placeholder="hours"><input name="commentBanMinutes" type="number" min="0" max="59" step="1" value="0" placeholder="minutes"></div></div><div class="comment-ban-expiry-date" hidden><input name="commentBanExpiresAt" type="datetime-local" step="1" value="${activeBan ? localDateTimeValue(expiresAt) : ''}"></div></div></label>
                    <label data-account-feature="commentBan">Reason<input name="commentBanReason" maxlength="64" value="${escapeHtml(user.commentBanReason || '')}"></label>
                    <label data-account-feature="commentBan">Permanent comment ban<select name="permaCommentBan"><option value="0"${selected(user.permaCommentBan || 0, 0)}>No</option><option value="1"${selected(user.permaCommentBan || 0, 1)}>Yes</option></select></label>
                    <label data-account-feature="creatorBan">Creator ban<select name="creatorBanned"><option value="0"${selected(user.creatorBanned || 0, 0)}>No</option><option value="1"${selected(user.creatorBanned || 0, 1)}>Yes</option></select></label>
                </div>
                <fieldset class="account-permissions" data-account-feature="accountAccess"><legend>Dashboard permissions</legend><p class="muted">Select access within this role's configured limits.</p><div class="permission-checks">${permissionOptions}</div><button class="ghost small account-permissions-reset" type="button">Use role defaults</button></fieldset>
                <div class="window-actions"><button type="submit"${ACCOUNT_ACTION_FEATURES.some(feature => dashboardFeatures.has(feature)) ? '' : ' disabled'}>Save account</button></div>
            </form>`;
        $('#account-form').querySelectorAll('[data-account-feature]').forEach(element => {
            element.hidden = !dashboardFeatures.has(element.dataset.accountFeature);
        });
        updateCommentBanExpiryControls($('#account-form'));
        $('#account-modal').hidden = false;
}

function updateAccountPermissionChoices(modLevel) {
    const available = new Set(accountRolePermissions[modLevel] || []);
    $('#account-form')?.querySelectorAll('.permission-check').forEach(label => {
        const checkbox = label.querySelector('input');
        const enabled = available.has(checkbox.value);
        if (enabled && checkbox.disabled && !accountHasCustomRestrictions) checkbox.checked = true;
        label.classList.toggle('unavailable', !enabled);
        checkbox.disabled = !enabled;
        if (!enabled) checkbox.checked = false;
    });
}

async function openAccountManager(accountId) {
    if (!hasAccountManagementAccess()) throw new Error('Account management is not enabled for your role');
        const user = accountRecords.get(String(accountId));
        if (!user) throw new Error('Account is no longer in this result page');
        const access = dashboardFeatures.has('accountAccess')
            ? await request(`api/access/${accountId}`)
            : { rolePermissions: {}, defaults: [], features: [], featureCatalog: [], customRestrictions: null };
        renderAccountManager(user, access);
}

function renderPermissionSchema(schema) {
        const roleLabels = { 0: 'Player', 1: 'Advisor', 2: 'Mod', 3: 'Leaderboard mod' };
        const headings = Object.keys(roleLabels).map(level => `<th scope="col">${roleLabels[level]}</th>`).join('');
        const rows = schema.features.map(feature => `<tr><th scope="row">${escapeHtml(feature.label)}<small>${escapeHtml(feature.key)}</small></th>${Object.keys(roleLabels).map(level => `<td><label class="schema-cell"><input type="checkbox" data-role="${level}" data-feature="${escapeHtml(feature.key)}"${schema.roles[level].includes(feature.key) ? ' checked' : ''}><span class="sr-only">${roleLabels[level]}: ${escapeHtml(feature.label)}</span></label></td>`).join('')}</tr>`).join('');
        $('#permission-schema-editor').innerHTML = `<div class="schema-table-wrap"><table class="schema-table"><thead><tr><th scope="col">Feature</th>${headings}</tr></thead><tbody>${rows}</tbody></table></div><p class="muted">Each account action grants only its matching control. Account-specific settings can further restrict these role defaults.</p>`;
        $('#permission-modal').hidden = false;
}

async function openPermissionSchema() {
    if (moderatorRank(currentModLevel) < moderatorRank(2)) throw new Error('Only mods can manage the permission schema');
        renderPermissionSchema(await request('api/permissions/schema'));
}

function openPicker(kind) {
    picker.kind = kind;
    picker.query = '';
    picker.offset = 0;
    $('#browse-kind').textContent = kind === 'levels' ? 'Level search' : kind === 'lists' ? 'Level list search' : kind === 'accounts' ? 'Account management' : 'Custom audio';
    $('#browse-title').textContent = kind === 'levels' ? 'Browse levels' : kind === 'lists' ? 'Browse lists' : kind === 'accounts' ? 'Browse accounts' : 'Browse songs';
    $('#browse-query').placeholder = kind === 'levels' ? 'Search by level name or ID' : kind === 'lists' ? 'Search by list name or ID' : kind === 'accounts' ? 'Search by username or account ID' : 'Search by song, artist, or ID';
    $('#browse-query').value = '';
    $('#browse-sort').hidden = kind !== 'levels';
    $('#browse-sort').value = 'id';
    $('#level-detail').hidden = true;
    $('#browse-modal').hidden = false;
    document.body.classList.add('browser-open');
    $('#browse-query').focus();
    loadPickerPage();
}

async function loadPickerPage() {
    const params = new URLSearchParams({ q: picker.query, limit: picker.limit, offset: picker.offset });
    if (picker.kind === 'levels') params.set('sort', $('#browse-sort').value);
    const endpoint = picker.kind === 'levels' ? 'api/levels' : picker.kind === 'lists' ? 'api/lists' : picker.kind === 'accounts' ? 'api/users' : 'api/songs';
    const requestId = (picker.requestId || 0) + 1;
    picker.requestId = requestId;
    try {
        const data = await request(`${endpoint}?${params}`);
        if (requestId !== picker.requestId) return;
        picker.total = data.total;
        if (picker.kind === 'levels') renderLevels(data.levels);
        else if (picker.kind === 'lists') renderLists(data.lists);
        else if (picker.kind === 'accounts') renderAccountResults(data.users);
        else renderSongs(data.songs);
        const page = Math.floor(picker.offset / picker.limit) + 1;
        const pageCount = Math.max(1, Math.ceil(picker.total / picker.limit));
        $('#browse-page-status').textContent = `${page} / ${pageCount} · ${picker.total.toLocaleString()} results`;
        $('#browse-previous').disabled = picker.offset === 0;
        $('#browse-next').disabled = picker.offset + picker.limit >= picker.total;
        $('#browse-modal').scrollTop = 0;
    } catch (error) {
        if (requestId !== picker.requestId) return;
        $('#browse-results').innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
    }
}

function localDateTimeValue(unixTimestamp) {
    const date = new Date(Number(unixTimestamp) * 1000);
    if (Number.isNaN(date.getTime())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}

function renderSchedule(data) {
    const now = Math.floor(Date.now() / 1000);
    scheduleNextSlots = data.nextSlots || scheduleNextSlots;
    updateScheduleSlot(document.getElementById('server-schedule-form'));
    const legacyEntries = [
        ...(data.daily || []).map(item => ({ ...item, type: 'daily', slot: item.dailyNumber, startsAt: now, expiresAt: item.dailyTime || 0 })),
        ...(data.weekly || []).map(item => ({ ...item, type: 'weekly', slot: item.dailyNumber - 100000, startsAt: now, expiresAt: item.dailyTime || 0 })),
        ...(data.event || []).map(item => ({ ...item, type: 'event', slot: item.dailyNumber - 200000, startsAt: now, expiresAt: item.dailyTime || 0 }))
    ];
    scheduleEntries = [...(data.plans || []), ...legacyEntries];
    const formatType = entry => `${entry.type.charAt(0).toUpperCase()}${entry.type.slice(1)} #${entry.slot}`;
    const dateFormat = timestamp => new Date(Number(timestamp) * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    const liveEntries = scheduleEntries.filter(entry => Number(entry.expiresAt) === 0 || Number(entry.expiresAt) > now);
    const display = ['daily', 'weekly', 'event'].map(type => {
        const entries = liveEntries.filter(entry => entry.type === type).sort((a, b) => a.startsAt - b.startsAt);
        const rows = entries.map(entry => {
            const active = entry.startsAt <= now && (!entry.expiresAt || entry.expiresAt > now);
            const remove = entry.scheduleID
                ? `<button type="button" class="ghost small delete-schedule-entry" data-schedule="${entry.scheduleID}">Remove</button>`
                : `<button type="button" class="ghost small delete-schedule-slot" data-type="${entry.type}" data-slot="${entry.slot}">Remove</button>`;
            const start = active ? 'Active now' : `Starts ${dateFormat(entry.startsAt)}`;
            const end = entry.expiresAt ? `Ends ${dateFormat(entry.expiresAt)}` : 'No expiry';
            return `<div class="schedule-item"><div class="schedule-item-header"><strong>${formatType(entry)}</strong>${remove}</div><span>${escapeHtml(entry.levelName)} · #${entry.levelID} · ${escapeHtml(entry.creator || 'unknown')}</span><small>${start} · ${end}</small></div>`;
        }).join('');
        return `<div class="schedule-group"><div class="schedule-header"><strong>${type}</strong><span>${entries.length} scheduled</span></div>${rows || `<p class="empty">No ${type} level scheduled.</p>`}</div>`;
    });
    $('#schedule-display').innerHTML = display.join('');
    renderScheduleCalendar();
}

function renderScheduleCalendar() {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    $('#calendar-month').textContent = calendarMonth.toLocaleDateString([], { month: 'long', year: 'numeric' });
    const firstDay = new Date(year, month, 1);
    const gridStart = new Date(year, month, 1 - firstDay.getDay());
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const now = Math.floor(Date.now() / 1000);
    const headers = weekdays.map(day => `<div class="calendar-weekday" role="columnheader">${day}</div>`).join('');
    const days = Array.from({ length: 42 }, (_, index) => {
        const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
        const dayStart = Math.floor(date.getTime() / 1000);
        const dayEnd = Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() / 1000);
        const entries = scheduleEntries.filter(entry => Number(entry.startsAt) < dayEnd &&
            (!Number(entry.expiresAt) || Number(entry.expiresAt) > dayStart));
        const today = date.toDateString() === new Date().toDateString();
        const chips = entries.slice(0, 3).map(entry => {
            const status = entry.startsAt > now ? 'upcoming' : entry.expiresAt && entry.expiresAt <= now ? 'past' : 'active';
            return `<span class="calendar-event ${entry.type} ${status}" title="${escapeHtml(`${entry.type} #${entry.slot}: ${entry.levelName} · Level #${entry.levelID}`)}">${escapeHtml(entry.type)} #${entry.slot} · ${escapeHtml(entry.levelName)}</span>`;
        }).join('');
        const more = entries.length > 3 ? `<small class="calendar-more">+${entries.length - 3} more</small>` : '';
        return `<div class="calendar-day${date.getMonth() !== month ? ' outside-month' : ''}${today ? ' today' : ''}" role="gridcell" aria-label="${date.toLocaleDateString()} · ${entries.length} scheduled"><strong>${date.getDate()}</strong>${chips}${more}</div>`;
    }).join('');
    $('#schedule-calendar').innerHTML = `${headers}${days}`;
}

function renderNews(data) {
    newsItems = data.items || [];
    newsVersion = Number(data.version) || 1001;
    $('#news-version').textContent = `Version ${newsVersion}`;
    const imageOptions = current => {
        const images = [...newsImages];
        return `<option value="">Choose an uploaded image</option>${images.map(image => `<option value="${escapeHtml(image.filename)}"${image.filename === current ? ' selected' : ''}>${escapeHtml(image.filename)}</option>`).join('')}`;
    };
    const articles = newsItems.length ? newsItems.map(item => {
        const currentImage = newsImages.some(image => image.filename === item.imageFile) ? item.imageFile : '';
        const imageMode = !currentImage ? 'none' : 'existing';
        return `
        <article class="news-article" data-news-id="${item.id}">
            <div class="news-article-heading"><strong>Article #${item.id}</strong><button type="button" class="ghost small remove-news-article">Remove article</button></div>
            <div class="news-article-fields">
                <label>Date<input name="publishDate" maxlength="64" value="${escapeHtml(item.publishDate)}" required></label>
                <label>Title<input name="title" maxlength="120" value="${escapeHtml(item.title)}" required></label>
                <label class="news-body-field">Article text<textarea name="body" maxlength="12000" rows="4" placeholder="Article body">${escapeHtml(item.body)}</textarea></label>
                <section class="news-image-section">
                    <label>Article image
                        <select name="newsImageSource">
                            <option value="none"${imageMode === 'none' ? ' selected' : ''}>No image</option>
                            <option value="upload">Upload an image</option>
                            <option value="existing"${imageMode === 'existing' ? ' selected' : ''}>Choose an uploaded image</option>
                        </select>
                    </label>
                    <input name="imageFile" type="hidden" value="${escapeHtml(currentImage)}">
                    <div class="news-image-source" data-image-source="upload"${imageMode === 'upload' ? '' : ' hidden'}>
                        <label>Choose a JPG or PNG<input name="newsImageUpload" type="file" accept=".jpg,.png,image/jpeg,image/png"></label>
                        <button type="button" class="ghost upload-news-image">Upload and use image</button>
                    </div>
                    <div class="news-image-source" data-image-source="existing"${imageMode === 'existing' ? '' : ' hidden'}>
                        <label>Uploaded image<select name="existingImageFile">${imageOptions(currentImage)}</select></label>
                    </div>
                    <p class="muted">Upload a JPG or PNG to this server, or choose an image already uploaded.</p>
                </section>
                <details class="news-extra-fields"><summary>Image tap behavior, size, and button (optional)</summary>
                    <div class="news-optional-grid">
                        <label>Image destination URL<input name="imageUrl" type="url" maxlength="2048" value="${escapeHtml(item.imageUrl || '')}" placeholder="Optional URL opened when tapped"></label>
                        <label class="news-check"><input name="imageClickable" type="checkbox"${item.imageClickable ? ' checked' : ''}> Is this image a YouTube video?</label>
                        <label>Image width<input name="imageWidth" type="number" min="1" max="8192" value="${Number(item.imageWidth) || 800}"></label>
                        <label>Image height<input name="imageHeight" type="number" min="1" max="8192" value="${Number(item.imageHeight) || 454}"></label>
                        <label>Hyperlink text<input name="buttonLabel" maxlength="120" value="${escapeHtml(item.buttonLabel || '')}" placeholder="Optional hyperlink"></label>
                        <label>Hyperlink URL<input name="buttonUrl" maxlength="2048" value="${escapeHtml(item.buttonUrl || '')}" placeholder="https://..."></label>
                    </div>
                </details>
            </div>
        </article>`;
    }).join('') : '<p class="empty">No news articles. Add one to publish your first post.</p>';
    $('#news-editor').innerHTML = articles;
}

function refreshNewsImageOptions() {
    $('#news-editor').querySelectorAll('select[name="existingImageFile"]').forEach(select => {
        const current = select.closest('.news-article').querySelector('[name="imageFile"]').value;
        const images = [...newsImages];
        select.innerHTML = `<option value="">Choose an uploaded image</option>${images.map(image => `<option value="${escapeHtml(image.filename)}"${image.filename === current ? ' selected' : ''}>${escapeHtml(image.filename)}</option>`).join('')}`;
        select.value = current;
    });
}

function updateNewsImageSource(article) {
    const source = article.querySelector('[name="newsImageSource"]').value;
    article.querySelectorAll('[data-image-source]').forEach(panel => {
        panel.hidden = panel.dataset.imageSource !== source;
    });
    const imageFile = article.querySelector('[name="imageFile"]');
    imageFile.value = source === 'existing'
        ? article.querySelector('[name="existingImageFile"]').value
        : '';
}

$('#news-editor').addEventListener('change', event => {
    const article = event.target.closest('.news-article');
    if (!article) return;
    if (event.target.name === 'newsImageSource') updateNewsImageSource(article);
    if (event.target.name === 'existingImageFile') {
        article.querySelector('[name="imageFile"]').value = event.target.value;
    }
});

function renderSongs(songs) {
    $('#browse-results').innerHTML = songs.length ? songs.map(song => `<div class="song-row"><div><strong>${escapeHtml(song.name)}</strong><span>${escapeHtml(song.artistName)} · #${song.ID} · ${song.size} MB</span></div><a href="${escapeHtml(song.link)}" target="_blank" rel="noreferrer">Open file</a><button type="button" class="reject delete-song" data-song="${song.ID}">Delete</button></div>`).join('') : '<p class="empty">No songs uploaded.</p>';
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
            openPicker('levels');
            $('#browse-query').select();
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
    if (form.classList.contains('level-list-row')) body.original = Number(body.original);
    return body;
}

function syncFeaturedListVisibility(form) {
    const featured = form.querySelector('[name="featured"]');
    const visibility = form.querySelector('[name="unlisted"]');
    if (featured?.value === '1' && visibility) visibility.value = '0';
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
        const access = await request('api/access');
        csrf = access.csrf;
        currentModLevel = Number(access.modLevel || 0);
        dashboardFeatures = new Set(access.features || []);
        renderGreeting(access.username);
        applyDashboardPermissions();
        await refreshOverview();
        if (dashboardFeatures.has('collections')) renderCollections(await request('api/collections'));
        if (dashboardFeatures.has('management')) {
            renderQuests((await request('api/quests')).quests || []);
            renderSecretRewards((await request('api/secret-rewards')).rewards || []);
            const [news, imageData] = await Promise.all([request('api/news'), request('api/news/images')]);
            newsImages = imageData.images || [];
            renderNews(news);
        }
        if (dashboardFeatures.has('schedule')) renderSchedule(await request('api/server-schedule'));
        $('#login-view').hidden = true;
        $('#app-view').hidden = false;
    } catch (error) {
        if (!$('#app-view').hidden) $('#app-error').textContent = error.message;
    }
}

async function refreshOverview() {
    const data = await request('api/bootstrap');
    csrf = data.csrf;
    render(data);
}

async function refreshCollections() {
    renderCollections(await request('api/collections'));
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

function getDurationSecondsFromForm(form, selector = { preset: '[name="durationPreset"]', days: '[name="durationDays"]', hours: '[name="durationHours"]', minutes: '[name="durationMinutes"]', date: '[name="expiresAt"]', never: '[name="neverExpires"]' }, baseTime = Date.now()) {
    const neverInput = selector.never ? form.querySelector(selector.never) : null;
    const neverExpires = !!neverInput?.checked;
    if (neverExpires) return 0;

    const preset = (selector.preset ? form.querySelector(selector.preset)?.value : null) || 'custom';
    if (preset === 'none') return 0;
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
        const duration = Math.max(0, Math.round((expiresAt.getTime() - baseTime) / 1000));
        if (!duration) throw new Error('Expiry date must be later than now');
        return duration;
    }

    const totalSeconds = (customDays * 86400) + (customHours * 3600) + (customMinutes * 60);
    if (totalSeconds <= 0) return 0;
    return totalSeconds;
}

function getScheduleExpiryFromForm(form, startsAt) {
    const expiresAt = getExpiryTimestampFromForm(form, {
        preset: '[name="scheduleExpiryPreset"]',
        days: '[name="scheduleDurationDays"]',
        hours: '[name="scheduleDurationHours"]',
        minutes: '[name="scheduleDurationMinutes"]',
        date: '[name="scheduleExpiresAt"]'
    }, startsAt * 1000);
    if (expiresAt <= 0) throw new Error('Schedule levels must have an expiry');
    return expiresAt;
}

function getExpiryTimestampFromForm(form, selector, baseTime = Date.now()) {
    const preset = form.querySelector(selector.preset)?.value || 'custom';
    if (preset === 'none') return 0;
    const dateValue = selector.date ? form.querySelector(selector.date)?.value : '';
    if (preset === 'date') {
        if (!dateValue) throw new Error('Choose a valid expiry date and time');
        const expiresAt = new Date(dateValue);
        if (Number.isNaN(expiresAt.getTime())) throw new Error('Choose a valid expiry date and time');
        const timestamp = Math.floor(expiresAt.getTime() / 1000);
        if (timestamp * 1000 <= baseTime) throw new Error('Expiry date must be later than its start');
        return timestamp;
    }
    const duration = getDurationSecondsFromForm(form, selector, baseTime);
    return duration > 0 ? Math.floor(baseTime / 1000) + duration : 0;
}

function getSecretRewardDurationFromForm(form) {
    return getDurationSecondsFromForm(form);
}

function updateSecretRewardFormControls(form) {
    updateExpiryControls(form, {
        preset: '[name="durationPreset"]',
        never: '[name="neverExpires"]',
        durationFields: '.secret-duration-fields',
        dateFields: '.secret-expiry-date',
        durationInputs: ['[name="durationDays"]', '[name="durationHours"]', '[name="durationMinutes"]'],
        dateInput: '[name="expiresAt"]'
    });
}

function updateExpiryControls(form, selectors) {
    const preset = form.querySelector(selectors.preset)?.value || 'custom';
    const neverExpires = selectors.never && form.querySelector(selectors.never)?.checked;
    const useCustomLength = !neverExpires && preset === 'custom';
    const useDate = !neverExpires && preset === 'date';
    const durationFields = form.querySelector(selectors.durationFields);
    const dateFields = form.querySelector(selectors.dateFields);
    if (durationFields) durationFields.hidden = !useCustomLength;
    if (dateFields) dateFields.hidden = !useDate;
    for (const inputSelector of selectors.durationInputs || []) {
        const input = form.querySelector(inputSelector);
        if (input) input.disabled = !useCustomLength;
    }
    const dateInput = selectors.dateInput ? form.querySelector(selectors.dateInput) : null;
    if (dateInput) dateInput.disabled = !useDate;
}

$('#queue').addEventListener('click', async event => {
    if (!event.target.classList.contains('approve') && !event.target.classList.contains('reject')) return;
    const item = event.target.closest('.queue-item'); if (!item) return;
    const body = { levelId: Number(item.dataset.level) };
    const url = event.target.classList.contains('approve') ? 'api/rate' : 'api/reject';
    if (url.endsWith('/rate')) { body.stars = Number(item.querySelector('.stars').value); body.feature = Number(item.querySelector('.feature').value); body.demonDiff = Number(item.querySelector('.demon').value); body.starCoins = item.querySelector('.star-coins').checked ? 1 : 0; }
    const button = event.target;
    setBusyState(button, 'Working…', true);
    try { await request(url, { method: 'POST', body: JSON.stringify(body) }); await refreshOverview(); showToast(url.includes('rate') ? 'Suggestion rated' : 'Suggestion rejected', 'success'); }
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

$('#level-detail').addEventListener('pointerdown', event => {
    const detail = event.currentTarget;
    if (!event.target.closest('.detail-drag-handle') || event.target.closest('.close-detail')) return;
    const bounds = detail.getBoundingClientRect();
    detail.dataset.dragOffsetX = String(event.clientX - bounds.left);
    detail.dataset.dragOffsetY = String(event.clientY - bounds.top);
    detail.classList.add('is-dragging');
    detail.setPointerCapture(event.pointerId);
});

$('#level-detail').addEventListener('pointermove', event => {
    const detail = event.currentTarget;
    if (!detail.classList.contains('is-dragging')) return;
    const left = event.clientX - Number(detail.dataset.dragOffsetX);
    const top = event.clientY - Number(detail.dataset.dragOffsetY);
    detail.style.left = `${Math.max(0, Math.min(left, window.innerWidth - detail.offsetWidth))}px`;
    detail.style.top = `${Math.max(0, Math.min(top, window.innerHeight - detail.offsetHeight))}px`;
    detail.style.transform = 'none';
});

$('#level-detail').addEventListener('pointerup', event => {
    event.currentTarget.classList.remove('is-dragging');
});

document.querySelectorAll('.open-browser, .management-launcher[data-browser]').forEach(button => button.addEventListener('click', () => openPicker(button.dataset.browser)));

$('#close-browser').addEventListener('click', () => {
    $('#browse-modal').hidden = true;
    document.body.classList.remove('browser-open');
});

$('#browse-search').addEventListener('submit', event => {
    event.preventDefault();
    picker.query = $('#browse-query').value.trim();
    picker.offset = 0;
    $('#level-detail').hidden = true;
    loadPickerPage();
});

$('#clear-browser-search').addEventListener('click', () => {
    $('#browse-query').value = '';
    picker.query = '';
    picker.offset = 0;
    $('#level-detail').hidden = true;
    loadPickerPage();
});

$('#browse-sort').addEventListener('change', () => {
    picker.offset = 0;
    loadPickerPage();
});

$('#browse-previous').addEventListener('click', () => {
    picker.offset = Math.max(0, picker.offset - picker.limit);
    loadPickerPage();
});

$('#browse-next').addEventListener('click', () => {
    if (picker.offset + picker.limit < picker.total) {
        picker.offset += picker.limit;
        loadPickerPage();
    }
});

$('#browse-results').addEventListener('click', async event => {
    const accountButton = event.target.closest('.account-manage');
    if (accountButton) {
        try { await openAccountManager(accountButton.dataset.account); }
        catch (error) { $('#app-error').textContent = error.message; }
        return;
    }
    const listResult = event.target.closest('.list-result');
    if (listResult) {
        try { renderListEditor((await request(`api/lists/${listResult.dataset.list}`)).list); }
        catch (error) { $('#app-error').textContent = error.message; }
        return;
    }
    const result = event.target.closest('.level-result'); if (!result) return;
    try {
        renderLevelDetail(await request(`api/levels/${result.dataset.level}`));
    }
    catch (error) { $('#app-error').textContent = error.message; }
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !$('#browse-modal').hidden) $('#close-browser').click();
    if (event.key === 'Escape') document.querySelectorAll('.management-modal:not([hidden])').forEach(modal => { modal.hidden = true; });
});

document.querySelectorAll('.close-management-window').forEach(button => button.addEventListener('click', () => {
    button.closest('.management-modal').hidden = true;
}));

document.querySelectorAll('.management-modal').forEach(modal => modal.addEventListener('click', event => {
    if (event.target === modal) modal.hidden = true;
}));

$('#open-permission-schema').addEventListener('click', async () => {
    try { await openPermissionSchema(); }
    catch (error) { $('#app-error').textContent = error.message; }
});

$('#save-permission-schema').addEventListener('click', async () => {
    const roles = {};
    for (const role of [0, 1, 2, 3]) {
        roles[role] = [...$('#permission-schema-editor').querySelectorAll(`input[data-role="${role}"]:checked`)].map(input => input.dataset.feature);
    }
    try {
        await request('api/permissions/schema', { method: 'PUT', body: JSON.stringify({ roles }) });
        $('#permission-modal').hidden = true;
        await load();
        showToast('Permission schema saved', 'success');
    } catch (error) { $('#app-error').textContent = error.message; showToast(error.message, 'error'); }
});

$('#account-detail-content').addEventListener('change', event => {
    if (event.target.name === 'modLevel') updateAccountPermissionChoices(Number(event.target.value));
    if (event.target.name === 'feature') accountPermissionsChanged = true;
    if (event.target.name === 'commentBanPreset') updateCommentBanExpiryControls(event.target.closest('.account-form'));
});

$('#account-detail-content').addEventListener('click', async event => {
    if (!event.target.classList.contains('account-permissions-reset')) return;
    const accountId = $('#account-form').dataset.account;
    try {
        await request(`api/access/${accountId}`, { method: 'PUT', body: JSON.stringify({ inheritDefaults: true }) });
        accountHasCustomRestrictions = false;
        accountPermissionsChanged = false;
        renderAccountManager(accountRecords.get(String(accountId)), await request(`api/access/${accountId}`));
        showToast('Role defaults restored', 'success');
    } catch (error) { $('#app-error').textContent = error.message; }
});

$('#level-detail').addEventListener('click', async event => {
    const detail = event.currentTarget;
    if (event.target.classList.contains('close-detail')) { detail.hidden = true; return; }
    const chartButton = event.target.closest('[data-vote-chart]');
    if (chartButton && currentLevelDetail) {
        renderVoteChart(chartButton.dataset.voteChart, currentLevelDetail);
        return;
    }
    const currentLevel = detail.querySelector('.eyebrow')?.textContent.match(/\d+/)?.[0];
    if (!currentLevel) return;
    try {
        if (event.target.classList.contains('remove-rating')) {
            await request(`api/levels/${currentLevel}/user-ratings/${event.target.dataset.account}`, { method: 'DELETE' });
        } else if (event.target.classList.contains('remove-demon-rating')) {
            await request(`api/levels/${currentLevel}/user-demon-ratings/${event.target.dataset.account}`, { method: 'DELETE' });
        } else if (event.target.classList.contains('detail-difficulty-save')) {
            await request(`api/levels/${currentLevel}/difficulty`, { method: 'POST', body: JSON.stringify({ difficulty: Number(detail.querySelector('.detail-difficulty').value) }) });
        } else if (event.target.classList.contains('detail-rate')) {
            const stars = Number(detail.querySelector('.detail-stars').value);
            if (stars === 0) await request(`api/levels/${currentLevel}/unrate`, { method: 'POST', body: '{}' });
            else await request('api/rate', { method: 'POST', body: JSON.stringify({ levelId: Number(currentLevel), stars, feature: Number(detail.querySelector('.detail-feature').value), demonDiff: Number(detail.querySelector('.detail-demon').value), starCoins: detail.querySelector('.detail-star-coins').checked ? 1 : 0 }) });
        } else if (event.target.classList.contains('detail-metadata-save')) {
            const name = detail.querySelector('.detail-level-name').value.trim();
            const description = detail.querySelector('.detail-level-description').value;
            if (!name) throw new Error('Level name is required');
            await request(`api/levels/${currentLevel}/details`, { method: 'PUT', body: JSON.stringify({ levelName: name, levelDescription: description, starCoins: detail.querySelector('.detail-star-coins').checked ? 1 : 0 }) });
        } else return;
        renderLevelDetail(await request(`api/levels/${currentLevel}`));
    } catch (error) { $('#app-error').textContent = error.message; }
});

document.addEventListener('change', event => {
    const listForm = event.target.closest('.level-list-row');
    if (listForm && ['featured', 'unlisted'].includes(event.target.name)) {
        syncFeaturedListVisibility(listForm);
        return;
    }
    if (!event.target.classList.contains('list-original-mode')) return;
    const form = event.target.closest('.level-list-row');
    const sourceId = form.querySelector('.list-original-id');
    const original = form.querySelector('input[name="original"]');
    const reupload = event.target.value !== '0';
    sourceId.hidden = !reupload;
    sourceId.required = reupload;
    if (reupload && Number(sourceId.value) < 1) sourceId.value = '1';
    original.value = reupload ? sourceId.value : '0';
});

document.addEventListener('input', event => {
    if (!event.target.classList.contains('list-original-id')) return;
    event.target.closest('.level-list-row').querySelector('input[name="original"]').value = event.target.value;
});

$('#logout').addEventListener('click', async () => { try { await request('api/logout', { method: 'POST', body: '{}' }); location.reload(); } catch (error) { $('#app-error').textContent = error.message; } });

$('#add-news-article').addEventListener('click', () => {
    const nextId = Math.max(0, ...newsItems.map(item => Number(item.id) || 0)) + 1;
    newsItems.unshift({
        id: nextId,
        publishDate: new Date().toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' }),
        title: '',
        body: '',
        imageFile: '',
        imageWidth: 800,
        imageHeight: 454,
        imageClickable: 0,
        imageUrl: '',
        buttonLabel: '',
        buttonUrl: '',
    });
    renderNews({ items: newsItems, version: newsVersion });
    $('#news-editor .news-article input[name="title"]').focus();
    touchLastSaved('Unsaved news changes');
});

$('#news-editor').addEventListener('click', event => {
    if (!event.target.classList.contains('remove-news-article')) return;
    const article = event.target.closest('.news-article');
    newsItems = newsItems.filter(item => Number(item.id) !== Number(article.dataset.newsId));
    renderNews({ items: newsItems, version: newsVersion });
    touchLastSaved('Unsaved news changes');
});

$('#news-editor').addEventListener('input', () => touchLastSaved('Unsaved news changes'));
$('#news-editor').addEventListener('change', () => touchLastSaved('Unsaved news changes'));

$('#news-editor').addEventListener('click', async event => {
    const article = event.target.closest('.news-article');
    if (!article) return;
    if (event.target.classList.contains('upload-news-image')) {
        const fileInput = article.querySelector('[name="newsImageUpload"]');
        const file = fileInput.files[0];
        if (!file) {
            showToast('Choose a JPG or PNG image first', 'error');
            return;
        }
        const button = event.target;
        const formData = new FormData();
        formData.append('file', file);
        setBusyState(button, 'Uploading…', true);
        try {
            beginDashboardRequest();
            const response = await fetch('api/news/images/upload', {
                method: 'POST',
                body: formData,
                headers: csrf ? { 'X-CSRF-Token': csrf } : {}
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
            newsImages.push(result.image);
            article.querySelector('[name="imageFile"]').value = result.image.filename;
            refreshNewsImageOptions();
            article.querySelector('[name="existingImageFile"]').value = result.image.filename;
            article.querySelector('[name="newsImageSource"]').value = 'existing';
            updateNewsImageSource(article);
            fileInput.value = '';
            touchLastSaved('News image uploaded');
            showToast('Image uploaded and selected for this article', 'success');
        } catch (error) {
            $('#app-error').textContent = error.message;
            showToast(error.message, 'error');
        } finally {
            endDashboardRequest();
            setBusyState(button, 'Uploading…', false);
        }
    }
});

$('#save-news-articles').addEventListener('click', async () => {
    const unfinishedImage = [...$('#news-editor').querySelectorAll('.news-article')].find(article => {
        const source = article.querySelector('[name="newsImageSource"]').value;
        const filename = article.querySelector('[name="imageFile"]').value;
        if (source === 'upload') return true;
        if (source === 'existing') return !filename;
        return false;
    });
    if (unfinishedImage) {
        showToast('Finish choosing or uploading the image for each article first', 'error');
        unfinishedImage.querySelector('[name="newsImageSource"]').focus();
        return;
    }
    const items = [...$('#news-editor').querySelectorAll('.news-article')].map(article => {
        const value = name => article.querySelector(`[name="${name}"]`);
        return {
            id: Number(article.dataset.newsId),
            publishDate: value('publishDate').value,
            title: value('title').value,
            body: value('body').value,
            imageFile: value('imageFile').value,
            imageWidth: Number(value('imageWidth').value),
            imageHeight: Number(value('imageHeight').value),
            imageClickable: value('imageClickable').checked ? 1 : 0,
            imageUrl: value('imageUrl').value,
            buttonLabel: value('buttonLabel').value,
            buttonUrl: value('buttonUrl').value,
        };
    });
    const button = $('#save-news-articles');
    setBusyState(button, 'Saving news…', true);
    try {
        const result = await request('api/news', { method: 'PUT', body: JSON.stringify({ items }) });
        renderNews(result);
        touchLastSaved('News saved');
        showToast(result.changed ? `News saved · version ${result.version}` : 'News unchanged', 'success');
    } catch (error) {
        $('#app-error').textContent = error.message;
        showToast(error.message, 'error');
    } finally {
        setBusyState(button, 'Saving news…', false);
    }
});

$('#server-schedule-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
        $('#app-error').textContent = '';
        let startValue = String(formData.get('scheduleStartsAt') || '');
        let startsAtDate = new Date(startValue);
        if (Number.isNaN(startsAtDate.getTime())) throw new Error('Choose a valid schedule start date and time');
        let startsAt = Math.floor(startsAtDate.getTime() / 1000);
        if (startsAt < Math.floor(Date.now() / 1000) && startValue === scheduleDefaultStartValue) {
            setDefaultScheduleStart(form);
            startValue = form.querySelector('[name="scheduleStartsAt"]').value;
            startsAtDate = new Date(startValue);
            startsAt = Math.floor(startsAtDate.getTime() / 1000);
        }
        if (startsAt < Math.floor(Date.now() / 1000)) throw new Error('Schedule start must be now or later');
        const payload = {
            levelId: Number(formData.get('levelId')),
            slot: Number(formData.get('slot')),
            type: formData.get('type'),
            startsAt,
            expiresAt: getScheduleExpiryFromForm(form, startsAt)
        };
        await request('api/server-schedule', { method: 'POST', body: JSON.stringify(payload) });
        form.reset();
        scheduleSlotManuallyEdited = false;
        setDefaultScheduleStart(form);
        updateScheduleExpiryControls(form);
        renderSchedule(await request('api/server-schedule'));
        showToast('Level scheduled', 'success');
    } catch (error) { $('#app-error').textContent = error.message; showToast(error.message, 'error'); }
});

function setDefaultScheduleStart(form) {
    const start = form.querySelector('[name="scheduleStartsAt"]');
    if (!start) return;
    const defaultStart = new Date();
    defaultStart.setMinutes(defaultStart.getMinutes() + 2, 0, 0);
    scheduleDefaultStartValue = localDateTimeValue(Math.floor(defaultStart.getTime() / 1000)).slice(0, 16);
    start.value = scheduleDefaultStartValue;
}

function updateScheduleSlot(form, force = false) {
    if (!form) return;
    const type = form.querySelector('[name="type"]')?.value;
    const slot = form.querySelector('[name="slot"]');
    if (type && slot && (force || !scheduleSlotManuallyEdited)) slot.value = String(scheduleNextSlots[type] || 1);
}

$('#calendar-previous').addEventListener('click', () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
    renderScheduleCalendar();
});

$('#calendar-next').addEventListener('click', () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    renderScheduleCalendar();
});

$('#calendar-today').addEventListener('click', () => {
    calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    renderScheduleCalendar();
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

function applyDashboardPermissions() {
    document.querySelectorAll('#app-view [data-feature]').forEach(element => {
        element.hidden = !dashboardFeatures.has(element.dataset.feature);
    });
    document.querySelector('[data-browser="accounts"]').hidden = !hasAccountManagementAccess();
    document.querySelectorAll('#app-view [data-min-mod-level]').forEach(element => {
        element.hidden = moderatorRank(currentModLevel) < moderatorRank(Number(element.dataset.minModLevel));
    });

    $('#server-schedule-form').closest('.panel').hidden = !dashboardFeatures.has('schedule');
    $('#quest-form').closest('.panel').hidden = !dashboardFeatures.has('management');
    $('#secret-reward-form').closest('.panel').hidden = !dashboardFeatures.has('management');
    $('#song-form').closest('.panel').hidden = !dashboardFeatures.has('management');
    const canManage = ['schedule', 'management'].some(feature => dashboardFeatures.has(feature)) ||
        hasAccountManagementAccess() || moderatorRank(currentModLevel) >= moderatorRank(2);
    document.querySelector('[data-tab="levels"]').hidden = !dashboardFeatures.has('levels');
    document.querySelector('[data-tab="collections"]').hidden = !dashboardFeatures.has('collections');
    document.querySelector('[data-tab="management"]').hidden = !canManage;
    const availableTabs = [...document.querySelectorAll('.tab')].filter(tab => !tab.hidden);
    const activeTab = document.querySelector('.tab.active');
    const selectedTab = availableTabs.find(tab => tab.dataset.tab === activeTab?.dataset.tab) || availableTabs[0];
    if (selectedTab) showTab(selectedTab.dataset.tab);
}

function hasAccountManagementAccess() {
    return dashboardFeatures.has('users') || ACCOUNT_ACTION_FEATURES.some(feature => dashboardFeatures.has(feature));
}

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
    if (form.id === 'account-form') {
        event.preventDefault();
        try {
            const accountId = form.dataset.account;
            const formData = new FormData(form);
            const payload = {};
            if (dashboardFeatures.has('accountRole')) payload.modLevel = Number(formData.get('modLevel'));
            if (dashboardFeatures.has('accountDisable')) payload.isDisabled = Number(formData.get('isDisabled'));
            if (dashboardFeatures.has('leaderboardBan')) payload.leaderboardBan = Number(formData.get('leaderboardBan')) || 0;
            if (dashboardFeatures.has('commentBan')) Object.assign(payload, {
                commentBan: getExpiryTimestampFromForm(form, {
                    preset: '[name="commentBanPreset"]',
                    days: '[name="commentBanDays"]',
                    hours: '[name="commentBanHours"]',
                    minutes: '[name="commentBanMinutes"]',
                    date: '[name="commentBanExpiresAt"]'
                }),
                commentBanReason: String(formData.get('commentBanReason') || '').trim(),
                permaCommentBan: Number(formData.get('permaCommentBan')) || 0
            });
            if (dashboardFeatures.has('creatorBan')) payload.creatorBanned = Number(formData.get('creatorBanned')) || 0;
            const features = [...form.querySelectorAll('input[name="feature"]:checked')].map(input => input.value);
            if (Object.keys(payload).length) await request(`api/users/${accountId}`, { method: 'PUT', body: JSON.stringify(payload) });
            if (dashboardFeatures.has('accountAccess') && (accountHasCustomRestrictions || accountPermissionsChanged)) {
                await request(`api/access/${accountId}`, { method: 'PUT', body: JSON.stringify({ features }) });
            }
            $('#account-modal').hidden = true;
            await refreshOverview();
            if (picker.kind === 'accounts' && !$('#browse-modal').hidden) await loadPickerPage();
            showToast('Account changes saved', 'success');
        } catch (error) { $('#app-error').textContent = error.message; showToast(error.message, 'error'); }
    } else if (form.id === 'map-pack-form' || form.classList.contains('map-pack-row')) {
        event.preventDefault();
        try { await request(form.dataset.id ? `api/map-packs/${form.dataset.id}` : 'api/map-packs', { method: form.dataset.id ? 'PUT' : 'POST', body: JSON.stringify(formBody(form)) }); await refreshCollections(); }
        catch (error) { $('#app-error').textContent = error.message; }
    } else if (form.classList.contains('level-list-row')) {
        event.preventDefault();
        try {
            await request(`api/lists/${form.dataset.id}`, { method: 'PUT', body: JSON.stringify(formBody(form)) });
            $('#level-detail').hidden = true;
            await loadPickerPage();
        }
        catch (error) { $('#app-error').textContent = error.message; }
    } else if (form.classList.contains('gauntlet-form')) {
        event.preventDefault();
        try {
            await request(`api/gauntlets/${form.dataset.id}`, { method: 'PUT', body: JSON.stringify(formBody(form)) });
            $('#app-error').textContent = '';
            await refreshCollections();
            showToast('Gauntlet saved', 'success');
        } catch (error) {
            $('#app-error').textContent = error.message;
            showToast(error.message, 'error');
        }
    } else if (form.id === 'song-form') {
        event.preventDefault();
        try {
            beginDashboardRequest();
            const response = await fetch('api/songs', { method: 'POST', body: new FormData(form), headers: csrf ? { 'X-CSRF-Token': csrf } : {} });
            if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `Request failed (${response.status})`);
            form.reset();
            if (picker.kind === 'songs' && !$('#browse-modal').hidden) {
                picker.offset = 0;
                await loadPickerPage();
            }
            showToast('Song uploaded', 'success');
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
            const uses = formData.get('usesInfinite') === 'on' || formData.get('usesInfinite') === '1' ? -1 : Number(formData.get('uses'));
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
    if (event.target.matches('.level-list-row [name="listLevels"]')) {
        const rewardCount = event.target.form.elements.countForReward;
        rewardCount.max = String(event.target.value.split(',').filter(level => level.trim()).length);
    }
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
    if (event.target.matches('[name="scheduleExpiryPreset"]')) {
        const form = event.target.closest('#server-schedule-form');
        if (form) updateScheduleExpiryControls(form);
    }
    if (event.target.matches('[name="commentBanPreset"]')) {
        const form = event.target.closest('.account-row');
        if (form) updateCommentBanExpiryControls(form);
    }
});

function updateScheduleExpiryControls(form) {
    updateExpiryControls(form, {
        preset: '[name="scheduleExpiryPreset"]',
        durationFields: '.schedule-duration-fields',
        dateFields: '.schedule-expiry-date',
        durationInputs: ['[name="scheduleDurationDays"]', '[name="scheduleDurationHours"]', '[name="scheduleDurationMinutes"]'],
        dateInput: '[name="scheduleExpiresAt"]'
    });
}

function updateCommentBanExpiryControls(form) {
    updateExpiryControls(form, {
        preset: '[name="commentBanPreset"]',
        durationFields: '.comment-ban-duration-fields',
        dateFields: '.comment-ban-expiry-date',
        durationInputs: ['[name="commentBanDays"]', '[name="commentBanHours"]', '[name="commentBanMinutes"]'],
        dateInput: '[name="commentBanExpiresAt"]'
    });
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
    scheduleForm.querySelector('[name="slot"]')?.addEventListener('input', () => { scheduleSlotManuallyEdited = true; });
    scheduleForm.querySelector('[name="type"]')?.addEventListener('change', () => {
        scheduleSlotManuallyEdited = false;
        updateScheduleSlot(scheduleForm, true);
    });
    setDefaultScheduleStart(scheduleForm);
    updateScheduleSlot(scheduleForm);
    updateScheduleExpiryControls(scheduleForm);
}

setInterval(async () => {
    if ($('#app-view').hidden || $('#management-tab').hidden || !dashboardFeatures.has('schedule')) return;
    try {
        renderSchedule(await request('api/server-schedule'));
    } catch (error) {
        $('#app-error').textContent = error.message;
    }
}, 60_000);

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
    if (event.target.classList.contains('delete-schedule-entry')) {
        const scheduleId = Number(event.target.dataset.schedule);
        if (!Number.isInteger(scheduleId) || scheduleId < 1) return;
        if (!confirm('Remove this scheduled level?')) return;
        try {
            await request(`api/server-schedule/entry/${scheduleId}`, { method: 'DELETE' });
            renderSchedule(await request('api/server-schedule'));
            showToast('Schedule entry removed', 'success');
        } catch (error) { $('#app-error').textContent = error.message; showToast(error.message, 'error'); }
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
    if (event.target.classList.contains('detail-delete-level')) {
        const levelId = Number(event.target.dataset.level);
        if (!Number.isInteger(levelId) || levelId < 1) return;
        if (!confirm(`Delete level #${levelId}? This cannot be undone.`)) return;
        try {
            await request(`api/levels/${levelId}`, { method: 'DELETE' });
            await refreshOverview();
            $('#level-detail').hidden = true;
            if (picker.kind === 'levels') {
                if (picker.offset >= picker.total - 1 && picker.offset > 0) picker.offset -= picker.limit;
                await loadPickerPage();
            }
            showToast('Level deleted', 'success');
        } catch (error) {
            $('#app-error').textContent = error.message;
            showToast(error.message, 'error');
        }
        return;
    }
    if (event.target.classList.contains('delete-song')) {
        if (!confirm('Delete this song?')) return;
        try {
            await request(`api/songs/${event.target.dataset.song}`, { method: 'DELETE' });
            if (picker.offset >= picker.total - 1 && picker.offset > 0) picker.offset -= picker.limit;
            await loadPickerPage();
            showToast('Song deleted', 'success');
        }
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
    try {
        await request(`api/${isList ? 'lists' : isGauntlet ? 'gauntlets' : 'map-packs'}/${form.dataset.id}`, { method: 'DELETE' });
        if (isList) {
            $('#level-detail').hidden = true;
            await loadPickerPage();
        } else await refreshCollections();
        showToast('Collection item deleted', 'success');
    }
    catch (error) { $('#app-error').textContent = error.message; showToast(error.message, 'error'); }
});

addSecretRewardItem();
setupDashboardUX();
load();
