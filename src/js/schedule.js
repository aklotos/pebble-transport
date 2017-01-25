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
let scheduleInfo = {regular: [], park: {count: 0}};
let notifyInfo;
let notifyBackground = notifyInfoBackgroundRect();

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
            const preprocessed = preprocess(data);
            console.log(`schedule updated: ${now()}`);

            // extract all non park routes (used in menu of following transport)
            updateRoutes(preprocessed.data);

            // update title
            stopTitle.text(`${now()}: ${data.StopName}`);

            // update schedule info skeleton
            craftScheduleInfoSkeleton(preprocessed);
            // update schedule info content
            const textLines = scheduleTextLines(preprocessed.data);
            for (let i = 0; i < textLines.regular.length; i++) {
                scheduleInfo.regular[i].schedule.text(textLines.regular[i].schedule);
                scheduleInfo.regular[i].endStop.text(textLines.regular[i].endStop);
            }
            if (scheduleInfo.park.text) {
                scheduleInfo.park.text.text(textLines.park);
            }

            // find next from following and notify if changed
            if (following.length > 0) {
                console.log('Looking for nearest transport from following');

                let next = findNextFromFollowing(preprocessed.data);
                console.log(`Previous nearest: ${previousNext.route}:${previousNext.time}, current nearest: ${next.route}:${next.time}`);

                if (next.route && !dirtyEquals(previousNext, next)) {
                    previousNext = next;

                    console.log('notification: vibro & light!');
                    vibe.vibrate('short');
                    light.trigger();

                    showNotification(next, config.notificationFadeTimeout);
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

function showNotification(next, timeout) {
    scheduleWindow.add(notifyBackground);
    notifyInfo.text(notificationTextContent(next));
    scheduleWindow.add(notifyInfo);
    setTimeout(function () {
        scheduleWindow.remove(notifyInfo);
        scheduleWindow.remove(notifyBackground);
    }, timeout);
}

function notificationTextContent(min) {
    const route = min.route.replace('А', 'A').replace('Т', 'T').replace('с', 'c').replace('а', 'a');
    let time = min.time.replace('D', 'Delay');
    time = ~['A','D','-'].indexOf(min.time) ? time : `${time} min`;
    return `${route}\n${time}`;
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
    const count = {regular: 0, park: 0};
    data.Routes.forEach(r => {
        const toPark = ~r.EndStop.indexOf('Троллейбусный парк');
        toPark ? count.park++ : count.regular++;
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

    return {data: preprocessed, count};
}

function clearScheduleInfoSkeleton(alterRegular) {
    if (scheduleInfo.regular.length > 0 || scheduleInfo.park.count > 0) {
        console.log('Clear schedule info text fields skeleton');
        if (alterRegular) {
            scheduleInfo.regular.forEach(r => {
                scheduleWindow.remove(r.schedule);
                scheduleWindow.remove(r.endStop);
            });
        }
        scheduleWindow.remove(scheduleInfo.park.text);
    }
}

function createNewScheduleInfoModel(preprocessed, alterRegular) {
    console.log(`Creating new schedule info text fields skeleton: ${preprocessed.count.regular} regular routes, ${preprocessed.count.park} routes in park`);

    const FSMALL = SCHEDULE_FONT_SIZE_SMALL;
    const FBIG = SCHEDULE_FONT_SIZE_BIG;
    const padding = 4;

    let pos = SCHEDULE_START_POS_Y;
    for (let i = 0; i < preprocessed.count.regular; i++) {
        if (alterRegular) {
            scheduleInfo.regular.push({
                schedule: scheduleInfoText(pos, FBIG, FBIG, true),
                endStop: scheduleInfoText(pos + FBIG, FSMALL, FSMALL, false)
            });
        }
        pos += FBIG + FSMALL;
    }
    scheduleInfo.park.count = preprocessed.count.park;
    scheduleInfo.park.text = scheduleInfoText(pos, FSMALL, FSMALL * preprocessed.count.park + padding, false);
}

function showScheduleInfoSkeleton(alterRegular) {
    console.log('Show schedule info text fields skeleton');
    if (alterRegular) {
        scheduleInfo.regular.forEach(r => {
            scheduleWindow.add(r.schedule);
            scheduleWindow.add(r.endStop);
        });
    }
    scheduleWindow.add(scheduleInfo.park.text);
}

function clearScheduleInfoModel(alterRegular) {
    console.log('Clear schedule info model');
    if (alterRegular) {
        scheduleInfo.regular = [];
    }
    scheduleInfo.park = {count: 0};
}

function craftScheduleInfoSkeleton(preprocessed) {
    if (preprocessed.count.regular === scheduleInfo.regular.length && preprocessed.count.park === scheduleInfo.park.count) {
        return;
    }

    const alterRegular = preprocessed.count.regular !== scheduleInfo.regular.length;
    clearScheduleInfoSkeleton(alterRegular);
    clearScheduleInfoModel(alterRegular);
    createNewScheduleInfoModel(preprocessed, alterRegular);
    showScheduleInfoSkeleton(alterRegular);
}

function scheduleTextLines(preprocessedData) {
    const elements = {regular: []};
    const parkLines = [];
    preprocessedData.forEach(e => {
        if (e.park) {
            parkLines.push(`${e.route} [${e.endStop}]: ${e.schedule.join(',')}`);
        } else {
            elements.regular.push({
                schedule: `${e.route}: ${e.schedule.join(',')}`,
                endStop: `${e.endStop}`
            });
        }
    });
    elements.park = parkLines.join('\n');
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
        textAlign: 'left',
        textOverflow: 'ellipsis'
    });
}

function scheduleInfoText(yPos, fontSize, elementSize, bold) {
    return new UI.Text({
        position: new Vector2(0, yPos),
        size: new Vector2(144, elementSize),
        font: bold ? `gothic-${fontSize}-bold` : `gothic-${fontSize}`,
        color: 'black',
        textAlign: 'left'
    });
}

function notifyInfoText() {
    return new UI.Text({
        position: new Vector2(0, 40),
        size: new Vector2(144, 100),
        font: 'bitham-42-bold',
        color: 'black',
        textAlign: 'center'
    });
}

function notifyInfoBackgroundRect() {
    return new UI.Rect({
        position: new Vector2(2, 40),
        size: new Vector2(140, 100),
        borderWidth: 3,
        backgroundColor: 'white',
        borderColor: 'black'
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
