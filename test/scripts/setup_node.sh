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
		
		#echo "Getting Update"
		#sudo apt-get update -y
		#echo "Getting Upgrade"
		#sudo apt-get upgrade -y
		#echo "Installing Screen"
		#sudo apt-get install screen -y

		echo "installing git"
		sudo apt-get install git -y
		cd /home/pi
		mkdir Documents
		
		echo "Cloning VAST.js"
		cd /home/pi/Documents
		sudo rm -r VAST.js
		git clone https://github.com/cfmarais-eng/VAST.js.git --branch dev_CFM --single-branch
		cd /home/pi/Documents/VAST.js
	
		echo "installing node modules"
		npm install socket.io
		npm install socket.io-client
		npm install object-sizeof
		"
	fi

   	sleep $TIME_BETWEEN_HOSTS

done
