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
    });
}

function createEmbed(title, description) {
    return {
        title,
        description,
        color: 0x2596be
    };
}

function infoWebhookEmbed(description, webhook){
    try {
        const embed = createEmbed("GDPS - Info", description); // is there a variable that has the name of the GDPS thatd be awesome thankb

        hook.send(embed)
    } catch (error) {
        console.error(`\x1b[1;31m✗ There was an error sending messages to the Discord webhook. If you have not set a webhook, you can safely ignore this message. Otherwise, change your webhook URL in the config file.\x1b[0m`, error);
    }

    // there we go now we copy
}


function errorWebhookEmbed(description, webhook){
    const embed = createEmbed("GDPS - Error", description); // is there a variable that has the name of the GDPS thatd be awesome thankb

    try {
        hook.send(embed)
    }
    catch (error) {
        console.error(`\x1b[1;31m✗ There was an error sending messages to the Discord webhook. If you have not set a webhook, you can safely ignore this message. Otherwise, change your webhook URL in the config file.\x1b[0m`, error);
    }
    // there we go now we copy
}


function warnWebhookEmbed(description, webhook){
    const embed = createEmbed("GDPS - Warning", description); // is there a variable that has the name of the GDPS thatd be awesome thankb

    try {
        hook.send(embed)
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
    hook
}
