const UI = require('ui');
const favourites = require('./favourites');
const nearest = require('./nearest');

const ID_FAVOURITES = 'FAVOURITES';
const ID_NEAREST = 'NEAREST';

const mainMenu = new UI.Menu({
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

mainMenu.on('select', e => {
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