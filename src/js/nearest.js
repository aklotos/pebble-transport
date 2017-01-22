'use strict';

const UI = require('ui');
const stops = require('./config/stop-info.json');
const util = require('util2');
const config = require('./config');
const schedule = require('./schedule');

const locationOptions = {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 10000
};

module.exports.showNearest = function () {

    navigator.geolocation.getCurrentPosition(pos => {
        const filteredStops = filterStops(pos.coords);

        const items = filteredStops.map(stop => ({
            id: stop.id,
            title: stop.name,
            subtitle: stop.routes.join(',')
        }));

        const nearestMenu = new UI.Menu({
            sections: [{
                items: items
            }]
        });

        nearestMenu.on('select', e => {
            console.log('Selected stop: ', e.item.id);
            schedule.showSchedule(e.item.id);
        });

        nearestMenu.show();

    }, err => {
        console.log('Location error: ', util.toString(err));
        const errorCard = new UI.Card({
            title: 'Error',
            subtitle: 'Receiving geo data',
            scrollable: true,
            style: 'small',
            body: JSON.stringify(err)
        });
        errorCard.show();

        setTimeout(errorCard.hide.bind(errorCard), 5000);
    }, locationOptions);

};

function filterStops(position) {
    const lat = position.latitude;
    const lon = position.longitude;

    const filteredStops = stops.reduce(function (result, stop) {
        const distance = approximateDistance(lat, lon, stop.coords.lat, stop.coords.lon);
        if (distance <= config.maxDistance) {
            stop.distance = Math.floor(distance);
            result.push(stop);
        }
        return result;
    }, []);

    filteredStops.sort(function (s1, s2) {
        return s1.distance - s2.distance;
    });

    return filteredStops;
}

function approximateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Radius of the earth in m
    const x = (lon2 - lon1) * Math.cos(lat1 * Math.PI / 180) * Math.PI / 180;
    const y = (lat2 - lat1) * Math.PI / 180;
    const d = R * Math.sqrt(x * x + y * y);
    return d;
}
