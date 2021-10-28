#!/bin/bash

# D:\Documents\VAST.js\test\Testing Scripts

PASSWORD="raspberry"
USERNAME="pi"
DIR_NAME="Documents"
TIME_BETWEEN_HOSTS=1

for HOST in `cat hosts.txt`; do

    	echo "STARTING ON $HOST";
	echo "------------------------------------------------------"
    	sshpass -p $PASSWORD ssh -o StrictHostKeyChecking=no $USERNAME@$HOST "
		echo "Getting Update"
		sudo apt-get update -y
		echo "Getting Upgrade"
		#sudo apt-get upgrade -y
		echo "Installing Screen"
		sudo apt-get install screen -y
		"

    	sleep $TIME_BETWEEN_HOSTS

    done
