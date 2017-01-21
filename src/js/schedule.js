const UI = require('ui');
const ajax = require('ajax');
const util = require('util2');
const clock = require('clock');
const moment = require('moment');
const Vector2 = require('vector2');
const config = require('./config');
const vibe = require('ui/vibe');
const light = require('ui/light');

const MAX_SUBSEQUENT_ATTEMPTS = 5;

var scheduleWindow;
var stopTitle;
var scheduleInfo;
var routesInfo;
var notifyInfo;

var updateTimeout;
var routes = [];
var following = [];
var currentMin = {};
var updateFunc;
var attempt = 0;

module.exports.showSchedule = function (stopId) {
    scheduleWindow = new UI.Window({
        scrollable: true,
        clear: true,
        backgroundColor: 'white'
    });

    stopTitle = stopTitleText();
    scheduleInfo = scheduleInfoText();
    routesInfo = routesInfoText();
    notifyInfo = notifyInfoText();

    scheduleWindow.status(true);
    scheduleWindow.add(stopTitle);
    scheduleWindow.add(scheduleInfo);
    scheduleWindow.add(routesInfo);
    scheduleWindow.show();

    scheduleWindow.on('click', 'select', function () {
        console.log('selected!');
        updateFunc();
    });

    scheduleWindow.on('longClick', 'select', function () {
        const routesMenu = new UI.Menu({
            sections: [{
                items: routes.map(function (r) {
                    return {title: r + (~following.indexOf(r) ? ' +' : ''), id: r, follow: ~following.indexOf(r) };
                })
            }]
        });
        routesMenu.show();

        routesMenu.on('select', function (e) {
            console.log('Selected stop to follow/unfollow: ', e.item.id);

            routesMenu.item(e.sectionIndex, e.itemIndex, {
                id: e.item.id,
                title: e.item.id + (e.item.follow ? '' : ' +'),
                follow: !e.item.follow
            });
        });

        routesMenu.on('hide', function () {
            following = routesMenu._getSection({sectionIndex: 0}).items.filter(function (item) {
                return item.follow;
            }).map(function (item) {
                return item.id;
            });
            console.log('following routes: ', following);
            updateWithTimeout(updateFunc, config.updateInterval);
        })
    });

    scheduleWindow.on('hide', function () {
        console.log('Clear timeout');
        clearTimeout(updateTimeout);
        currentMin = {};
    });

    updateFunc = function (refresh) {
        ajax({
            url: config.api.url.schedule.replace(':stopId', stopId).replace(':maxRetry', config.maxRetry),
            type: 'json',
        }, function (data) {
            attempt = 0;
            console.log('updated: ', moment().format('HH:mm:ss'));

            stopTitle.text(stopTitleContent(data));
            scheduleInfo.text(scheduleDataContent(data));
            routesInfo.text(routesDataContent(data));

            updateRoutes(data);
            if (following.length > 0) {
                console.log('Looking for nearest from following...');

                var min = findFollowingMin(data);
                console.log('Current nearest: ', util.toString(currentMin));
                console.log('Found nearest: ', util.toString(min));

                if (min.route && min.time && !(currentMin.route === min.route && currentMin.time === min.time)) {
                    console.log('vibro & light!');

                    currentMin = min;

                    vibe.vibrate('short');
                    light.trigger();

                    notifyInfo.text(notificationTextContent(currentMin));
                    showNotification(config.notificationFadeTimeout);
                }
            }

            if (refresh) {
                updateWithTimeout(updateFunc, config.updateInterval);
            }
        }, function scheduleErrorCallback(err) {
            if (!err && attempt < MAX_SUBSEQUENT_ATTEMPTS) {
                attempt++;
                console.log('FAILED ATTEMPT #', attempt);

                return updateFunc(refresh);
            }

            const subtitle = err && err.error ? 'Minsktrans fail' : 'Proxy or app fail';
            const body = err && err.error ? JSON.stringify(err.error) : 'Please, check your internet connection and make sure proxy server is alive';
            const errCard = errorCard('Error loading schedule', subtitle, body);
            errCard.show();

            if (refresh) {
                console.log('Error occurred: updating with timeout');
                updateWithTimeout(function(refresh) {
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
    scheduleWindow.remove(scheduleInfo);
    setTimeout(function () {
        scheduleWindow.remove(notifyInfo);
        scheduleWindow.add(scheduleInfo);
    }, timeout);
}

function notificationTextContent(min) {
    return min.route.replace('А', 'A').replace('Т', 'T').replace('с', 'c').replace('а', 'a') + ': ' + min.time;
}

function stopTitleContent(data) {
    const now = moment().format('HH:mm:ss');
    return now + ': ' + data.StopName;
}

function updateRoutes(data) {
    routes = [];
    data.Routes.forEach(function(r) {
        if (!~r.EndStop.indexOf('Троллейбусный парк')) {
            routes.push(r.Type + r.Number);
        }
    });
}

function findFollowingMin(data) {
    var min = {};
    data.Routes.forEach(function(r) {
        if (!~r.EndStop.indexOf('Троллейбусный парк')) {
            if (following.indexOf(r.Type + r.Number) !== -1 && (!min.route || compareTimes(min.time, r.Info[0]) > 0)) {
                console.log('min from: ', r.Type + r.Number);
                min = {route: r.Type + r.Number, time: r.Info[0]};
            }
        }
    });
    return min;
}

function compareTimes(t1, t2) {
    if (t1 === t2) {
        return 0;
    } else {
        const parseTime = function (t) {
            return parseInt(
                t.replace('-', '1000')
                .replace('D', '100')
                .replace('<1', '0')
                .replace('A', '-1')
            );
        };
        return parseTime(t1) - parseTime(t2);
    }
}

function scheduleDataContent(data) {
    return data.Routes.map(function (r) {
        if (~r.EndStop.indexOf('Троллейбусный парк')) {
            const endStop = r.EndStop.replace('Троллейбусный парк', 'ТП').replace('№', 'N');
            return r.Type + r.Number + ' [' + endStop + ']: ' + r.Info.join(',');
        }
        return r.Type + r.Number + ': ' + r.Info.join(',');
    }).join('\n');
}

function routesDataContent(data) {
    const routesInfo = data.Routes.map(function (r) {
        if (r.EndStop.indexOf('Троллейбусный парк')) {
            return r.Type + r.Number + ': ' + r.EndStop;
        }
    }).filter(function(r) { return r; }).join('\n');

    return '----------------------\n' + routesInfo;
}

function stopTitleText() {
    return new UI.Text({
        position: new Vector2(0, 0),
        size: new Vector2(144, 40),
        font: 'gothic-18-bold',
        color: 'black',
        textOverflow: 'ellipsis'
    });
}

function scheduleInfoText() {
    return new UI.Text({
        position: new Vector2(0, 40),
        size: new Vector2(144, 200),
        font: 'gothic-18-bold',
        color: 'black'
    });
}

function routesInfoText() {
    return new UI.Text({
        position: new Vector2(0, 240),
        size: new Vector2(110, 200),
        font: 'gothic-14',
        color: 'black'
    });
}

function notifyInfoText() {
    return new UI.Text({
        position: new Vector2(0, 50),
        size: new Vector2(144, 128),
        font: 'bitham-42-bold',
        color: 'black'
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
