#!/bin/bash

# D:\Documents\VAST.js\test\Testing Scripts

PASSWORD="raspberry"
USERNAME="pi"
DIR_NAME="Documents"
TIME_BETWEEN_HOSTS=0

# Kill my own
sudo killall screen
sudo killall node

for HOST in `cat /home/pi/Documents/VAST.js/test/scripts/hosts.txt`; do

    	echo "Killing matchers and clients on $HOST";
    	sshpass -p $PASSWORD ssh -o StrictHostKeyChecking=no $USERNAME@$HOST "
		sudo killall screen
		sudo killall node
		"
    	sleep $TIME_BETWEEN_HOSTS

done
