#!/bin/bash

# D:\Documents\VAST.js\test\Testing Scripts

PASSWORD="raspberry"
USERNAME="pi"
DIR_NAME="Documents"
TIME_BETWEEN_HOSTS=0

# Copy my own to new results directory
cd /home/pi/Documents
sudo rm -r results
mkdir results
cd /home/pi/Documents/VAST.js/results
sudo cp -R * /home/pi/Documents/results

# Delete old results directory
cd /home/pi/Documents
sudo rm -r ./VAST.js/results


for HOST in `cat /home/pi/Documents/VAST.js/test/scripts/hosts.txt`; do
	# Copy results to our current directly
    	echo "Collecting Data from $HOST";
    	sshpass -p $PASSWORD scp -o StrictHostKeyChecking=no -r $USERNAME@$HOST:Documents/VAST.js/results .
    	
	# Delete old results
	sshpass -p $PASSWORD ssh -o StrictHostKeyChecking=no $USERNAME@$HOST "sudo rm -r /home/pi/Documents/VAST.js/results"

	sleep $TIME_BETWEEN_HOSTS
done
