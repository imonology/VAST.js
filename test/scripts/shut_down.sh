#!/bin/bash

# D:\Documents\VAST.js\test\Testing Scripts

PASSWORD="raspberry"
USERNAME="pi"
DIR_NAME="Documents"
TIME_BETWEEN_HOSTS=1

for HOST in `cat hosts.txt`; do

    	echo "SHUTTING DOWN $HOST";
	echo "------------------------------------------------------"
    	sshpass -p $PASSWORD ssh -o StrictHostKeyChecking=no $USERNAME@$HOST "
		sudo shutdown -h now
		"

    	sleep $TIME_BETWEEN_HOSTS

done

echo "shut down supernode"
sudo shutdown -h now
