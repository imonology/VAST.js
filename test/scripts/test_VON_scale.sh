#!/bin/bash

IP=$1
RADIUS=$2
GATEWAY=$3
CLIENTS=$4
TEST_DIR=Documents/VAST/VAST.js/test

cd $TEST_DIR
node --max-old-space-size=1536 test_VON_scale.js 10.10.11.207:37700 $CLIENTS $GATEWAY $IP $RADIUS
