#!/usr/bin/env bash

# COLORS
BLUE='\033[1;34m'
GREEN='\033[1;32m'
NC='\033[0m' # No Color

BUILD_DIR="/Users/akli/own/workspace/pebble/pebble-build"
PEBBLEJS_DIR="/Users/akli/own/workspace/pebble/pebblejs"
CURRENT_DIR=`pwd`

# create/clean build directory
if [ -d $BUILD_DIR ]; then
    echo -e "${BLUE}--> Clear build directory${NC}"
    rm -rf $BUILD_DIR/*
else
    echo -e "${BLUE}--> Create build directory${NC}"
    mkdir $BUILD_DIR
fi

# transpiling sources
echo -e "${BLUE}--> Transpiling sources${NC}"
npm run build

# copy files
echo -e "${BLUE}--> Copy Pebble.js files${NC}"
rsync -av -q $PEBBLEJS_DIR/ $BUILD_DIR/ --exclude .git
echo -e "${BLUE}--> Copy project files${NC}"
rsync -av -q ./src-es5/ $BUILD_DIR/src/
rsync -av -q ./ $BUILD_DIR/ --exclude .git --exclude src --exclude src-es5 --exclude node_modules --exclude package.json

cd $BUILD_DIR

# build
pebble build

cd $CURRENT_DIR

# create/clean local build directory
if [ -d build ]; then
    echo -e "${BLUE}--> Clear local build directory${NC}"
    rm -rf build/*
    mkdir build/src
else
    echo -e "${BLUE}--> Create local build directory${NC}"
    mkdir -p build/src
fi

# copy app
echo -e "${BLUE}--> Copy pebble app (*.pbw)${NC}"
cp $BUILD_DIR/build/*.pbw build/
# copy source
echo -e "${BLUE}--> Copy pebble app source (*.js)${NC}"
cp $BUILD_DIR/build/src/js/*.js build/src/

echo -e "${GREEN}Done.${NC}"

# install and run app
PBW=`find build/*.pbw | head -n 1`
pebble install --emulator aplite $PBW && pebble logs