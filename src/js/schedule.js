'use strict';

const UI = require('ui');
const ajax = require('ajax');
const clock = require('clock');
const moment = require('moment');
const Vector2 = require('vector2');
const vibe = require('ui/vibe');
const light = require('ui/light');
const config = require('./config');
const log = require('./log');

const MAX_SUBSEQUENT_ATTEMPTS = 5;
const SCHEDULE_START_POS_Y = 36;
const SCHEDULE_FONT_SIZE_BIG = 18;
const SCHEDULE_FONT_SIZE_SMALL = 14;

let scheduleWindow;
let stopTitle;
let scheduleInfo = [];
let notifyInfo;

let updateTimeout;
let routes = [];
let following = [];
let previousNext = {};
let updateFunc;
let attempt = 0;

module.exports.showSchedule = function (stopId) {
    scheduleWindow = new UI.Window({
        scrollable: true,
        clear: true,
        backgroundColor: 'white'
    });
    scheduleWindow.customName = 'schedule window';

    stopTitle = stopTitleText();
    notifyInfo = notifyInfoText();

    scheduleWindow.status(true);
    scheduleWindow.add(stopTitle);
    scheduleWindow.show();

    scheduleWindow.on('click', 'select', function () {
        console.log('Select clicked: updating schedule');
        updateFunc();
    });

    scheduleWindow.on('longClick', 'select', () => {
        const routesMenu = new UI.Menu({
            sections: [{
                items: routes.map(r => ({
                    title: `${r.route} ${~following.indexOf(r.route) ? '+' : ''}`,
                    subtitle: r.endStop,
                    id: r.route,
                    follow: ~following.indexOf(r.route)
                }))
            }]
        });
        routesMenu.show();

        routesMenu.on('select', e => {
            console.log('Selected stop to follow/unfollow: ', e.item.id);

            routesMenu.item(e.sectionIndex, e.itemIndex, {
                id: e.item.id,
                title: `${e.item.id} ${e.item.follow ? '' : '+'}`,
                subtitle: e.item.subtitle,
                follow: !e.item.follow
            });
        });

        routesMenu.on('hide', () => {
            following = routesMenu._getSection({sectionIndex: 0}).items
                .filter(item => item.follow)
                .map(item => item.id);
            console.log('Routes to follow: ', following);

            updateWithTimeout(updateFunc, config.updateInterval);
        })
    });

    scheduleWindow.on('hide', () => {
        console.log('Hide window: clear timeout, clear previousNext');
        clearTimeout(updateTimeout);
        previousNext = {};
    });

    updateFunc = function (refresh) {
        ajax({
            url: config.api.url.schedule.replace(':stopId', stopId).replace(':maxRetry', config.maxRetry),
            type: 'json'
        }, function (data) {

            attempt = 0;
            const preprocessedData = preprocess(data);
            console.log(`schedule updated: ${now()}`);

            // extract all non park routes (used in menu of following transport)
            updateRoutes(preprocessedData);

            // update title
            stopTitle.text(`${now()}: ${data.StopName}`);

            // update schedule content:
            // 1. Clear old schedule elements
            scheduleInfo.forEach(text => scheduleWindow.remove(text));
            scheduleInfo = [];
            // 2. Create new schedule elements
            const textLines = scheduleTextLines(preprocessedData);
            let pos = SCHEDULE_START_POS_Y;
            textLines.forEach(e => {
                const size = e.bold ? SCHEDULE_FONT_SIZE_BIG : SCHEDULE_FONT_SIZE_SMALL;
                scheduleInfo.push(scheduleInfoText(pos, size, e.bold, e.title));
                pos += size;
            });
            // 3. Add new schedule elements
            scheduleInfo.forEach(text => scheduleWindow.add(text));

            if (following.length > 0) {
                console.log('Looking for nearest transport from following');

                let next = findNextFromFollowing(preprocessedData);
                console.log(`Previous nearest: ${previousNext.route}:${previousNext.time}, current nearest: ${next.route}:${next.time}`);

                if (next.route && !dirtyEquals(previousNext, next)) {
                    previousNext = next;

                    console.log('notification: vibro & light!');
                    vibe.vibrate('short');
                    light.trigger();

                    notifyInfo.text(notificationTextContent(next));
                    showNotification(config.notificationFadeTimeout);
                }
            }

            if (refresh) {
                updateWithTimeout(updateFunc, config.updateInterval);
            }
        }, function scheduleErrorCallback(err) {
            console.log('error: ', err);

            if (!err && attempt < MAX_SUBSEQUENT_ATTEMPTS) {
                attempt++;

                console.log('FAILED ATTEMPT #', attempt);
                return updateFunc(refresh);
            }

            const subtitle = err && err.error ? 'Minsktrans fail' : 'Fail';
            const body = err ? log(err) : 'Please, check your internet connection and make sure proxy server is alive';
            const errCard = errorCard('Error loading schedule', subtitle, body);
            errCard.show();

            if (refresh) {
                console.log('Error occurred: updating with timeout');
                updateWithTimeout(function (refresh) {
                    errCard.hide();
                    updateFunc(refresh);
                }, config.updateIntervalOnFail);
            }
        });
    };
    updateFunc(true);
};

function updateWithTimeout(fn, timeout) {
    updateTimeout = setTimeout(function () {
        fn(true);
    }, timeout);
}

function showNotification(timeout) {
    scheduleWindow.add(notifyInfo);
    scheduleInfo.forEach(scheduleWindow.remove.bind(scheduleWindow));
    setTimeout(function () {
        scheduleWindow.remove(notifyInfo);
        scheduleInfo.forEach(scheduleWindow.add.bind(scheduleWindow));
    }, timeout);
}

function notificationTextContent(min) {
    const route = min.route.replace('А', 'A').replace('Т', 'T').replace('с', 'c').replace('а', 'a');
    return `${route}: ${min.time}`;
}

function now() {
    return moment().format('HH:mm:ss');
}

function updateRoutes(data) {
    routes = data.filter(r => !r.park).map(r => ({route: r.route, endStop: r.endStop}));
}

function findNextFromFollowing(preprocessedData) {
    let min = {};
    preprocessedData.forEach(r => {
        if (!r.park && ~following.indexOf(r.route) && (!min.time || r.next < min.intTime)) {
            console.log(`Trying to find next: route = ${r.route}, schedule = ${r.schedule}`);
            console.log('before: ', min.intTime, 'now: ', r.next);
            min = {
                route: r.route,
                time: r.schedule[0],
                intTime: r.next
            };
        }
    });
    return min;
}

function preprocess(data) {
    const preprocessed = [];
    data.Routes.forEach(r => {
        const toPark = ~r.EndStop.indexOf('Троллейбусный парк');
        preprocessed.push({
            route: r.Type + r.Number,
            park: toPark,
            schedule: r.Info,
            next: parseInt(r.Info[0].replace('-', '1000').replace('D', '100').replace('<1', '0').replace('A', '-1')),
            endStop: r.EndStop.replace('Троллейбусный парк', 'ТП').replace('№', 'N')
        });
    });
    preprocessed.sort((e1, e2) => {
        const next1 = e1.next + (e1.park ? 10000 : 0);
        const next2 = e2.next + (e2.park ? 10000 : 0);
        return next1 - next2;
    });

    return preprocessed;
}

function scheduleTextLines(preprocessedData) {
    const elements = [];
    preprocessedData.forEach(e => {
        if (e.park) {
            elements.push({title: `${e.route} [${e.endStop}]: ${e.schedule.join(',')}`, bold: false});
        } else {
            elements.push({title: `${e.route}: ${e.schedule.join(',')}`, bold: true});
            elements.push({title: `${e.endStop}`, bold: false});
        }
    });
    return elements;
}

function dirtyEquals(obj1, obj2) {
    for (let prop in obj1) {
        if (obj1[prop] !== obj2[prop]) {
            return false;
        }
    }
    for (let prop in obj2) {
        if (obj1[prop] !== obj2[prop]) {
            return false;
        }
    }
    return true;
}

function stopTitleText() {
    return new UI.Text({
        position: new Vector2(0, 0),
        size: new Vector2(144, SCHEDULE_START_POS_Y),
        font: 'gothic-18-bold',
        color: 'black',
        textOverflow: 'ellipsis'
    });
}

function scheduleInfoText(yPos, size, bold, text) {
    return new UI.Text({
        position: new Vector2(0, yPos),
        size: new Vector2(144, size),
        font: bold ? `gothic-${size}-bold` : `gothic-${size}`,
        color: 'black',
        text: text,
        textAlign: 'left'
    });
}

function notifyInfoText() {
    return new UI.Text({
        position: new Vector2(0, 50),
        size: new Vector2(144, 128),
        font: 'bitham-42-bold',
        color: 'black',
        textAlign: 'center'
    });
}

function errorCard(title, subtitle, message) {
    return new UI.Card({
        title: title,
        subtitle: subtitle,
        scrollable: true,
        style: 'small',
        body: message
    });
}
