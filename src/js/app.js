var UI = require('ui');
var favourites = require('./favourites');
var nearest = require('./nearest');

var ID_FAVOURITES = 'FAVOURITES';
var ID_NEAREST = 'NEAREST';

var mainMenu = new UI.Menu({
    sections: [{
        items: [
            {
                id: ID_FAVOURITES,
                title: 'Favourites',
                icon: 'images/heart.png'
            },
            {
                id: ID_NEAREST,
                title: 'Nearest',
                icon: 'images/gps.png'
            }
        ]
    }]
});

mainMenu.on('select', function (e) {
    switch (e.item.id) {
        case ID_FAVOURITES: {
            favourites.showFavourites();
            break;
        }
        case ID_NEAREST: {
            nearest.showNearest();
            console.log('Selected NEAREST menu item');
            break;
        }
    }
});

mainMenu.show();