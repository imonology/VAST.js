#!/bin/bash

PASSWORD="raspberry"
USERNAME="pi"
DIR_NAME="Documents"
TIME_BETWEEN_HOSTS=1

# Number of clients
CLIENTS=$1

# Client AoI radius
R=$2

# Pub / Sub AoI
X2=$3
Y2=$4
R2=$5
WAITFOR=$6
REFRESH=$7
PUBLISHER=$8

COUNT=0
LOCALHOST="localhost"

cd /home/pi/Documents/VAST.js

echo "Creating $MATCHERS matchers"
while [[ $COUNT -le $MATCHERS ]]
do
	for HOST in `cat /home/pi/Documents/VAST.js/test/scripts/hosts.txt`
	do
		((COUNT++))
		if [[ COUNT -gt MATCHERS ]]; then
			((COUNT--))
			echo "Done with $COUNT"
			break 2
		fi
		
		# Generate random coords and set aoi radius
		X=$((1 + $RANDOM % 1000))
		Y=$((1 + $RANDOM % 1000))

		if [[ "$HOST" == "localhost" ]]; then
                        echo "Starting client $COUNT on supernode"
screen -S client -d -m node /home/pi/Documents/VAST.js/test/new_client.js $X $Y $R $X2 $Y2 $R2 $PUBLISHER $WAITFOR $REFRESH
			screen -ls
                else
			# create random matcher in a new screen on current host
    			echo "Starting matcher $COUNT on $HOST";
    			sshpass -p $PASSWORD ssh -o StrictHostKeyChecking=no $USERNAME@$HOST "
			cd /home/pi/Documents/VAST.js
screen -S client -d -m node /home/pi/Documents/VAST.js/test/new_client.js $X $Y $R $X2 $Y2 $R2 $PUBLISHER $WAITFOR $REFRESH
			screen -ls
			"
		fi

    		sleep $TIME_BETWEEN_HOSTS

    	done
done
