#!/bin/bash

PASSWORD="raspberry"
USERNAME="pi"

TEST_SCRIPT=/home/$USERNAME/Documents/VAST/VAST.js/test
TIME_BETWEEN_HOSTS=24000
GATEWAY=10.10.11.207
CLIENTS=40

for RADIUS IN 50 55 60 65 70 75 80 85 90 95 100; do
    echo "Starting test for $RADIUS"

    sshpass -p $PASSWORD ssh $USERNAME@$GATEWAY "screen -S gateway -d -m bash $TEST_SCRIPT/test_VON_scale.sh $HOST $RADIUS true 1"

    for HOST in `cat herobrine_ips.txt`; do

    echo "Starting test for density sweep on $HOST";
    sshpass -p $PASSWORD ssh $USERNAME@$HOST "mkdir $TEST_SCRIPT"
    sshpass -p $PASSWORD ssh $USERNAME@$HOST "screen -S herobrine -d -m bash $TEST_SCRIPT/test_VON_scale.sh $HOST $RADIUS false $CLIENTS"
    sleep $TIME_BETWEEN_HOSTS

    done

    echo "all clients started. waiting 1 minute until close"
    sleep 60000

    echo "Waiting time complete. Stopping all scripts"

    for HOST in 'cat herobrine_ips.txt'; do

    sshpass -p $PASSWORD ssh $USERNAME@$HOST "screen -r herobrine -X stuff '^C'"

    done

    echo "All scripts stopped. Closing screens"
    sshpass -p $PASSWORD ssh $USERNAME@$HOST "screen -X -S herobrine quit"
    sshpass -p $PASSWORD ssh $USERNAME@$HOST "screen -X -S gateway quit"

done
