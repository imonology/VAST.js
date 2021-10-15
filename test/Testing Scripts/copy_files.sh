#!/bin/bash

# D:\Documents\VAST.js\test\Testing Scripts

PASSWORD="raspberry"
USERNAME="pi"
DIR_NAME = "Documents"

for HOST in `cat hosts.txt`; do

    echo "Starting script on $HOST";
    sshpass -p $PASSWORD ssh $USERNAME@$HOST "mkdir $DIR_NAME"
	sshpass -p $PASSWORD ssh $USERNAME@$HOST "mkdir $DIR_NAME"

    sleep $TIME_BETWEEN_HOSTS

    done
