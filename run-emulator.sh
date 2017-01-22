#!/usr/bin/env bash

# COLORS
BLUE='\033[1;34m'
GREEN='\033[1;32m'
NC='\033[0m' # No Color

# install and run app
PBW=`find build/*.pbw | head -n 1`
pebble install --emulator aplite $PBW && pebble logs