#!/bin/bash

# D:\Documents\VAST.js\test\Testing Scripts

PASSWORD="raspberry"
USERNAME="pi"
DIR_NAME="Documents"
TIME_BETWEEN_HOSTS=1

for HOST in `cat /home/pi/Documents/VAST.js/test/scripts/hosts.txt`; do

    	echo "STARTING ON $HOST";
	echo "------------------------------------------------------"
    	if [ "$HOST" != "localhost" ]; then	
		sshpass -p $PASSWORD ssh -o StrictHostKeyChecking=no $USERNAME@$HOST "	
		echo "Pulling Git VAST.js"
		cd /home/pi/Documents/VAST.js
		git pull
		"
	fi

   	sleep $TIME_BETWEEN_HOSTS

done
