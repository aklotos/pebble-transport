var UI = require('ui');
var schedule = require('./schedule');
var config = require('./config');

module.exports.showFavourites = function () {

    var favouritesMenu = new UI.Menu({
        sections: [{
            items: favouriteStopItems()
        }]
    });

    favouritesMenu.on('select', function (e) {
        console.log('Selected stop: ', e.item.id);
        schedule.showSchedule(e.item.id);
    });

    favouritesMenu.show();
};

function favouriteStopItems() {
    return config.favourites.map(function (s) {
        return {
            id: s.id,
            title: s.name,
            subtitle: s.description
        };
    });
}