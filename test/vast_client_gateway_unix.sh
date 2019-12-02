#!/bin/bash

HOST=$1
PORT=$2
RADIUS=$3
CLIENT=$4
SUB=$5

node test_VAST_client.js false $HOST $PORT $RADIUS $HOST 300 300 1 $CLIENT $SUB
