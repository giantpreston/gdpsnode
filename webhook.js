// oh wow

let /* make it let because i can just do that. also make a comment inbetween cuz i can just do that */ webhookurl = require('./config').webhook;
if (webhookurl === 'https://discord.com/api/webhooks/tung/dihh') webhookurl = null; // ignore unset!
const https = require('node:https');
const hook = { send: sendWebhook };

function sendWebhook(embed) {
    if (!webhookurl) return Promise.resolve();

    const payload = JSON.stringify({ embeds: [embed] });
    return new Promise((resolve, reject) => {
        const request = https.request(webhookurl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, response => {
            response.resume();
            if (response.statusCode < 200 || response.statusCode >= 300) {
                reject(new Error(`Discord webhook returned status ${response.statusCode}`));
                return;
            }
            resolve();
        });

        request.on('error', reject);
        request.end(payload);
    }).catch(error => {
        console.error(`\x1b[1;31m✗ There was an error sending messages to the Discord webhook. If you have not set a webhook, you can safely ignore this message. Otherwise, change your webhook URL in the config file.\x1b[0m`, error);

        // there we go now we copy
    });
}

function createEmbed(title, description, color) {
    return {
        title,
        description,
        color,
        timestamp: new Date().toISOString(),
        footer: { text: 'GDPS Notifications' } // is there a variable that has the name of the GDPS thatd be awesome thankb
    };
}

function levelRatingWebhookEmbed(level, webhook = hook) {
    const tier = level.starEpic >= 3 ? 'mythic' : level.starEpic === 2 ? 'legendary' :
        level.starEpic === 1 ? 'epic' : level.featured ? 'feature' : 'none';
    const demonDifficulties = { 3: 'easyDemon', 4: 'mediumDemon', 0: 'hardDemon', 5: 'insaneDemon', 6: 'extremeDemon' };
    const difficulties = ['na', 'easy', 'normal', 'hard', 'harder', 'insane'];
    const difficulty = level.starDemon ? demonDifficulties[level.starDemonDiff] || 'hardDemon' :
        level.starAuto ? 'auto' : difficulties[level.starDifficulty] || 'na';
    const coins = level.coins > 0 ? `${level.coins}${level.starCoins ? 'v' : 'u'}` : 'none';
    const rating = level.starStars > 0 ? `${level.starStars}${level.levelLength >= 5 ? 'm' : 's'}` : 'none';
    const faceUrl = `https://autonick.github.io/diff-faces/levels/${tier}/${difficulty}/${coins}/${rating}.png`;
    const tierColors = { mythic: 0xe74c3c, legendary: 0xf1c40f, epic: 0x9b59b6, feature: 0x3498db, none: 0x2596be };
    const fields = [
        { name: 'Level', value: `${level.levelName} (#${level.levelID})`, inline: true },
        { name: 'Rating', value: `${level.starStars} ${level.starStars === 1 ? 'star' : 'stars'}`, inline: true },
        { name: 'Difficulty', value: difficulty.replace(/([A-Z])/g, ' $1').replace(/^./, char => char.toUpperCase()), inline: true },
        { name: 'Tier', value: tier[0].toUpperCase() + tier.slice(1), inline: true },
        { name: 'Coins', value: level.coins > 0 ? `${level.coins} ${level.starCoins ? 'verified' : 'unverified'}` : 'None', inline: true }
    ];
    if (level.creator) fields.push({ name: 'Creator', value: level.creator, inline: true });

    const embed = {
        title: 'Level rated',
        color: tierColors[tier],
        fields,
        thumbnail: { url: faceUrl },
        timestamp: new Date().toISOString(),
        footer: { text: 'GDPS Level Rating' } // is there a variable that has the name of the GDPS thatd be awesome thankb
    };
    return webhook.send(embed);
}

function infoWebhookEmbed(description, webhook = hook){
    try {
        return webhook.send(createEmbed('GDPS - Info', description, 0x3498db)); // is there a variable that has the name of the GDPS thatd be awesome thankb
    } catch (error) {
        console.error(`\x1b[1;31m✗ There was an error sending messages to the Discord webhook. If you have not set a webhook, you can safely ignore this message. Otherwise, change your webhook URL in the config file.\x1b[0m`, error);
    }

    // there we go now we copy
}


function errorWebhookEmbed(description, webhook = hook){
    try {
        return webhook.send(createEmbed('GDPS - Error', description, 0xe74c3c)); // is there a variable that has the name of the GDPS thatd be awesome thankb
    }
    catch (error) {
        console.error(`\x1b[1;31m✗ There was an error sending messages to the Discord webhook. If you have not set a webhook, you can safely ignore this message. Otherwise, change your webhook URL in the config file.\x1b[0m`, error);
    }

    // there we go now we copy
}


function warnWebhookEmbed(description, webhook = hook){
    try {
        return webhook.send(createEmbed('GDPS - Warning', description, 0xf1c40f)); // is there a variable that has the name of the GDPS thatd be awesome thankb
    }
    catch (error) {
        console.error(`\x1b[1;31m✗ There was an error sending messages to the Discord webhook. If you have not set a webhook, you can safely ignore this message. Otherwise, change your webhook URL in the config file.\x1b[0m`, error);
    }

    // there we go now we copy
}

module.exports = {
    warnWebhookEmbed,
    infoWebhookEmbed,
    errorWebhookEmbed,
    levelRatingWebhookEmbed,
    hook
}
