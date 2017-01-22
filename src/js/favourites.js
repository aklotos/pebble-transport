'use strict';

const UI = require('ui');
const schedule = require('./schedule');
const config = require('./config');

module.exports.showFavourites = function () {

    const favouritesMenu = new UI.Menu({
        sections: [{
            items: favouriteStopItems()
        }]
    });

    favouritesMenu.on('select', e => {
        console.log('Selected stop: ', e.item.id);
        schedule.showSchedule(e.item.id);
    });

    favouritesMenu.show();
};

function favouriteStopItems() {
    return config.favourites.map(s => ({
        id: s.id,
        title: s.name,
        subtitle: s.description
    }));
}