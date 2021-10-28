#!/bin/bash
PASSWORD="raspberry"
USERNAME="pi"
DIR_NAME="Documents"
TIME_BETWEEN_HOSTS=2

# Number of matchers
MATCHERS=$1
R=$2
COUNT=1
LOCALHOST="localhost"

#Start GW on supernode
echo "Creating Gateway"
cd /home/pi/Documents/VAST.js 
screen -S gw -d -m node /home/pi/Documents/VAST.js/test/random_GW.js 500 500 $R
screen -ls 

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

		# Generate random coords
                X=$((1 + $RANDOM % 1000))
                Y=$((1 + $RANDOM % 1000))
		
		if [[ "$HOST" == "localhost" ]]; then 
                        echo "Starting matcher on supernode" 
			screen -S matcher -d -m node /home/pi/Documents/VAST.js/test/random_matcher.js $X $Y $R
			screen -ls 
		else
			# create random matcher in a new screen on current host
    			echo "Starting matcher $COUNT on $HOST"; sshpass -p $PASSWORD ssh -o 
    			StrictHostKeyChecking=no $USERNAME@$HOST "
			cd /home/pi/Documents/VAST.js screen -S matcher -d -m node /home/pi/Documents/VAST.js/test/random_matcher.js screen -ls "
		fi 
		sleep $TIME_BETWEEN_HOSTS 
	done 
done
