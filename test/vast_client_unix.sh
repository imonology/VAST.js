#!/bin/bash

HOST=$1
PORT=$2
RADIUS=$3
X=$4
Y=$5
CLIENT=$6
SUB=$7
NUM=$8

node test_VAST_client.js true $HOST $PORT $RADIUS $HOST $X $Y 1 $CLIENT $SUB
