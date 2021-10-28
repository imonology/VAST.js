#!/bin/bash

# D:\Documents\VAST.js\test\Testing Scripts

PASSWORD="raspberry"
USERNAME="pi"
DIR_NAME="Documents"
TIME_BETWEEN_HOSTS=1

for HOST in `cat hosts.txt`; do

	if [ "$HOST" != "localhost" ]; then
    	echo "Starting script on $HOST";
    		sshpass -p $PASSWORD ssh -o StrictHostKeyChecking=no $USERNAME@$HOST "
			mkdir $DIR_NAME
			sudo rm -r Documents/VAST.js
		"

		sshpass -p $PASSWORD scp -o StrictHostKeyChecking=no -r ../../../VAST.js $USERNAME@$HOST:Documents
	fi

    	sleep $TIME_BETWEEN_HOSTS

    done
