const db = require('./database');
const utils = require('./utils');

const PAGE_SIZE = 10;
const MESSAGE_PAGE_SIZE = 50;
const REQUEST_TTL_SECONDS = 14 * 24 * 60 * 60;
const SYSTEM_ACCOUNT_ID = 71;
const SYSTEM_ACCOUNT_NAME = 'GDPSnode Notifications';
const iconLoadoutFields = [
    [21, 'accIcon'],
    [22, 'accShip'],
    [23, 'accBall'],
    [24, 'accBird'],
    [25, 'accDart'],
    [26, 'accRobot'],
    [28, 'accGlow'],
    [43, 'accSpider'],
    [48, 'accExplosion'],
    [53, 'accSwing'],
    [54, 'accJetpack']
];

function parseInteger(value, fallback = 0) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = parseInt(utils.number(value), 10);
    return Number.isNaN(parsed) ? fallback : parsed;
}

function expireThreadRequests() {
    const expiredBefore = Math.floor(Date.now() / 1000) - REQUEST_TTL_SECONDS;
    const expiredDMThreads = db.prepare(`
        SELECT DISTINCT t.threadID
        FROM threads t
        JOIN thread_members m ON m.threadID = t.threadID
        WHERE t.isDM = 1 AND m.status = 0 AND m.invitedAt > 0 AND m.invitedAt <= ?
    `).all(expiredBefore);

    db.transaction(() => {
        for (const thread of expiredDMThreads) {
            db.prepare('DELETE FROM thread_messages WHERE threadID = ?').run(thread.threadID);
            db.prepare('DELETE FROM thread_members WHERE threadID = ?').run(thread.threadID);
            db.prepare('DELETE FROM threads WHERE threadID = ?').run(thread.threadID);
        }
        db.prepare(`
            DELETE FROM thread_members
            WHERE status = 0 AND invitedAt > 0 AND invitedAt <= ?
                AND threadID IN (SELECT threadID FROM threads WHERE isDM = 0)
        `).run(expiredBefore);
    })();
}

function authenticate(body) {
    const accountID = parseInteger(body?.accountID);
    const gjp2 = utils.remove(body?.gjp2 || '');
    if (!accountID || gjp2.length !== 40) return null;

    const account = db.prepare('SELECT * FROM accounts WHERE accountID = ?').get(accountID);
    if (!account || account.gjp2 !== gjp2 || account.isDisabled === 1) return null;
    expireThreadRequests();
    const profile = db.prepare('SELECT modLevel FROM profiles WHERE accountID = ?').get(accountID);
    return { accountID, account: { ...account, modLevel: profile?.modLevel || 0 } };
}

function decode(value, allowEmpty = false) {
    if (typeof value !== 'string') return null;
    if (value === '' && allowEmpty) return '';
    if (!utils.isURLBase64(value)) return null;
    return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function encode(value) {
    return Buffer.from(String(value ?? ''), 'utf8').toString('base64');
}

function getIconLoadout(profile) {
    return iconLoadoutFields.map(([, field]) => profile?.[field] ?? 0);
}

function serializeIconLoadout(profile) {
    return iconLoadoutFields.map(([key, field]) => `${key}:${profile?.[field] ?? 0}`).join(':');
}

function getProfile(accountID) {
    return db.prepare(`
        SELECT p.*, a.isDisabled
        FROM profiles p
        JOIN accounts a ON a.accountID = p.accountID
        WHERE p.accountID = ?
    `).get(accountID);
}

function getThreadProfile(accountID) {
    if (accountID === SYSTEM_ACCOUNT_ID) {
        return {
            accountID: SYSTEM_ACCOUNT_ID,
            userName: SYSTEM_ACCOUNT_NAME,
            stars: 0,
            demons: 0,
            creatorPoints: 0,
            icon: 0,
            color1: 0,
            color2: 0,
            color3: 0,
            coins: 0,
            userCoins: 0,
            iconType: 0,
            special: 0,
            diamonds: 0,
            moons: 0,
            modLevel: 0,
            mS: 0
        };
    }
    return getProfile(accountID);
}

function isFriend(accountID, targetAccountID) {
    return Boolean(db.prepare(`
        SELECT 1 FROM friendships
        WHERE (person1 = ? AND person2 = ?) OR (person1 = ? AND person2 = ?)
    `).get(accountID, targetAccountID, targetAccountID, accountID));
}

function isBlocked(accountID, targetAccountID) {
    return Boolean(db.prepare(`
        SELECT 1 FROM blocks
        WHERE (person1 = ? AND person2 = ?) OR (person1 = ? AND person2 = ?)
    `).get(accountID, targetAccountID, targetAccountID, accountID));
}

function canInvite(accountID, targetAccountID) {
    if (!targetAccountID || accountID === targetAccountID || isBlocked(accountID, targetAccountID)) return false;
    const account = db.prepare('SELECT isDisabled FROM accounts WHERE accountID = ?').get(targetAccountID);
    const profile = getProfile(targetAccountID);
    if (!account || account.isDisabled === 1 || !profile) return false;
    if (profile.gF === 2) return false;
    if ((profile.gF === 1 || (profile.gF === 0 && Number(profile.modLevel || 0) === 0)) && !isFriend(accountID, targetAccountID)) return false;
    return true;
}

function canStartDM(accountID, targetAccountID) {
    if (!targetAccountID || accountID === targetAccountID || isBlocked(accountID, targetAccountID)) return false;
    const account = db.prepare('SELECT isDisabled FROM accounts WHERE accountID = ?').get(targetAccountID);
    const profile = getProfile(targetAccountID);
    if (!account || account.isDisabled === 1 || !profile) return false;
    if (profile.mS === 2) return false;
    if ((profile.mS === 1 || (profile.mS === 0 && Number(profile.modLevel || 0) === 0)) && !isFriend(accountID, targetAccountID)) return false;
    return true;
}

function getThreadAccess(threadID, accountID) {
    return db.prepare(`
        SELECT t.*, m.status, m.invitedBy, m.invitedAt, m.joinedAt, m.lastReadMessageID,
            m.clearedBeforeID, m.removedAtMessageID, m.ignoredInvite, m.muted, m.pinned, m.hidden
        FROM threads t
        JOIN thread_members m ON m.threadID = t.threadID
        WHERE t.threadID = ? AND m.accountID = ?
    `).get(threadID, accountID);
}

function addMessage(threadID, accountID, content, isSystem = false) {
    const timestamp = Math.floor(Date.now() / 1000);
    const result = db.prepare(`
        INSERT INTO thread_messages (threadID, accountID, content, timestamp, isSystem)
        VALUES (?, ?, ?, ?, ?)
    `).run(threadID, accountID, content, timestamp, isSystem ? 1 : 0);
    db.prepare('UPDATE threads SET updatedAt = ?, mv = mv + 1 WHERE threadID = ?').run(timestamp, threadID);
    return { messageID: Number(result.lastInsertRowid), timestamp };
}

function revealHiddenDMRecipients(threadID, senderAccountID, historyCursor) {
    return db.prepare(`
        UPDATE thread_members
        SET hidden = 0,
            clearedBeforeID = MAX(clearedBeforeID, ?),
            lastReadMessageID = MAX(lastReadMessageID, ?)
        WHERE threadID = ? AND accountID != ? AND status = 1 AND hidden = 1
    `).run(historyCursor, historyCursor, threadID, senderAccountID).changes;
}

function addSystemMessage(threadID, type, user1ID, user2ID = 0) {
    const user1 = user1ID ? db.prepare('SELECT userName FROM accounts WHERE accountID = ?').get(user1ID) : null;
    const user2 = user2ID ? db.prepare('SELECT userName FROM accounts WHERE accountID = ?').get(user2ID) : null;
    const content = encode([
        type,
        user1ID || '',
        user1?.userName || '',
        user2ID || '',
        user2?.userName || ''
    ].join(','));
    return addMessage(threadID, 0, content, true);
}

function getLatestMessage(threadID) {
    return db.prepare('SELECT * FROM thread_messages WHERE threadID = ? ORDER BY messageID DESC LIMIT 1').get(threadID);
}

function serializeMessage(message) {
    return `${message.messageID}:${message.accountID}:${message.content}:${message.timestamp}:0`;
}

function serializeUser(profile, friendsSince = 0) {
    if (!profile) return '';
    return `1:${profile.userName}:2:${profile.accountID + 1}:3:${profile.stars}:4:${profile.demons}:8:${Math.round(profile.creatorPoints)}:9:${profile.icon}:10:${profile.color1}:11:${profile.color2}:13:${profile.coins}:14:${profile.iconType}:15:${profile.special}:16:${profile.accountID}:17:${profile.userCoins}:41:0:46:${profile.diamonds}:51:${profile.color3}:52:${profile.moons}:64:${friendsSince}:${serializeIconLoadout(profile)}`;
}

function serializeFormerUser(profile) {
    if (!profile) return '';
    return [
        profile.accountID,
        profile.accountID + 1,
        encode(profile.userName),
        profile.icon,
        profile.color1,
        profile.color2,
        profile.color3,
        profile.iconType,
        profile.special
    ].join(':');
}

function serializeInvite(member) {
    const profile = getProfile(member.accountID);
    if (!profile) return '';
    return [
        member.accountID,
        member.accountID + 1,
        encode(profile.userName),
        member.invitedBy,
        profile.icon,
        profile.color1,
        profile.color2,
        profile.color3,
        profile.iconType,
        profile.special,
        profile.stars,
        profile.moons,
        profile.demons,
        profile.coins,
        profile.userCoins,
        profile.diamonds,
        member.invitedAt,
        ...getIconLoadout(profile)
    ].join(':');
}

function getCounterpart(thread, accountID) {
    const member = thread.isDM
        ? db.prepare(`
            SELECT accountID, status FROM thread_members
            WHERE threadID = ? AND accountID != ? AND status IN (0, 1)
        `).get(thread.threadID, accountID)
        : null;
    const accountIDForCounterpart = member?.accountID || 0;
    return {
        member,
        accountID: accountIDForCounterpart,
        profile: accountIDForCounterpart ? getThreadProfile(accountIDForCounterpart) : null
    };
}

function getClientThreadStatus(thread, accountID, counterpartMember, counterpartID, counterpart) {
    if (!thread.isDM && thread.status === 2) return 8;
    if (thread.isDM && thread.ownerID === accountID && (thread.status === 0 || counterpartMember?.status === 0)) return 2;
    if (thread.isDM && thread.status === 1 && thread.ownerID !== accountID && counterpartMember?.accountID === thread.ownerID && counterpartMember.status === 0) return 0;
    if (counterpart && isBlocked(accountID, counterpartID)) return 7;
    if (counterpart && counterpart.mS === 2) return 5;
    if (counterpart && (counterpart.mS === 1 || (counterpart.mS === 0 && Number(counterpart.modLevel || 0) === 0)) && !isFriend(accountID, counterpartID)) return 4;
    return 0;
}

function serializeThread(thread, accountID) {
    const lastMessage = getLatestMessage(thread.threadID);
    const activeMembers = db.prepare(`
        SELECT accountID FROM thread_members
        WHERE threadID = ? AND status = 1
        ORDER BY joinedAt, accountID
    `).all(thread.threadID);
    const memberIDs = activeMembers.map(member => member.accountID);
    const { member: counterpartMember, accountID: counterpartID, profile: counterpart } = getCounterpart(thread, accountID);
    const lastSenderID = lastMessage?.accountID || 0;
    const lastSender = lastSenderID === SYSTEM_ACCOUNT_ID
        ? { userName: SYSTEM_ACCOUNT_NAME }
        : lastSenderID ? db.prepare('SELECT userName FROM accounts WHERE accountID = ?').get(lastSenderID) : null;
    const unread = thread.muted ? 0 : lastMessage
        ? db.prepare(`
            SELECT COUNT(*) AS count FROM thread_messages
            WHERE threadID = ? AND messageID > ? AND accountID != ?
                AND (? = 0 OR messageID <= ?)
        `).get(
            thread.threadID,
            Math.max(thread.lastReadMessageID, thread.clearedBeforeID || 0),
            accountID,
            thread.status === 2 ? 1 : 0,
            thread.removedAtMessageID || 0
        ).count
        : 0;
    const status = getClientThreadStatus(thread, accountID, counterpartMember, counterpartID, counterpart);

    return [
        thread.threadID,
        counterpartID,
        counterpart ? encode(counterpart.userName) : '',
        thread.isDM ? '' : encode(thread.title),
        unread,
        lastSenderID,
        utils.getRelative(lastMessage?.timestamp || thread.updatedAt),
        memberIDs.length,
        lastSender ? encode(lastSender.userName) : '',
        thread.ownerID,
        thread.muted,
        thread.invitePermission,
        thread.isDM,
        0,
        thread.pinned,
        counterpart?.icon || 0,
        counterpart?.color1 || 0,
        counterpart?.color2 || 0,
        counterpart?.color3 || 0,
        counterpart?.iconType || 0,
        counterpart?.special || 0,
        thread.isDM ? '' : encode(thread.description),
        thread.isDM ? '' : thread.emote,
        lastMessage?.timestamp || thread.updatedAt,
        counterpart?.modLevel || 0,
        status
    ].join(':');
}

function serializeMetadata(thread, memberCount, accountID) {
    const { member: counterpartMember, accountID: counterpartID, profile: counterpart } = getCounterpart(thread, accountID);
    const status = getClientThreadStatus(thread, accountID, counterpartMember, counterpartID, counterpart);
    return [thread.threadID, thread.invitePermission, memberCount, encode(thread.description), thread.mv, 0, 0, 0, encode(thread.title), thread.locked, status].join(':');
}

module.exports = {
    PAGE_SIZE,
    MESSAGE_PAGE_SIZE,
    REQUEST_TTL_SECONDS,
    SYSTEM_ACCOUNT_ID,
    expireThreadRequests,
    parseInteger,
    authenticate,
    decode,
    encode,
    getIconLoadout,
    serializeIconLoadout,
    getProfile,
    getThreadProfile,
    isFriend,
    isBlocked,
    canInvite,
    canStartDM,
    getThreadAccess,
    addMessage,
    revealHiddenDMRecipients,
    addSystemMessage,
    getLatestMessage,
    serializeMessage,
    serializeUser,
    serializeFormerUser,
    serializeInvite,
    serializeThread,
    serializeMetadata
};