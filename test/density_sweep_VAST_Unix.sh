#!/bin/bash

TEST_SCRIPT=/mnt/c/Users/Miguel\ Smith/Documents/Varsity\ Work/Masters/GitHub/Vast.js/test
CLIENT_SCRIPT=/mnt/c/Users/Miguel\ Smith/Documents/Varsity\ Work/Masters/Pseudo\ MC\ client
GATEWAY=10.110.117.14
CLIENTS=40
#POSX=(0 700 500 700 300 500 500 100 900 300 700 500 500 400 600 400 600)
#POSY=(0 700 500 300 700 100 900 500 500 500 500 300 700 400 400 600 600)
CLIENT_THRESHOLD=(200 110 70 55 45 35 30 28 25 23 20 18 17 16 15 14 14)
SUB_THRESHOLD=(220 120 80 60 50 40 35 33 30 27 24 22 21 20 19 18 18)

for RADIUS in {16..16..16}; do
    	echo "Starting test for $RADIUS"
	for CLIENTS in {50..500..50}; do
		echo "Starting test for $CLIENTS"
		for MATCHERS in {5..50..5}; do
			echo "Starting test for $MATCHERS"

            echo "$TEST_SCRIPT/Movement/$RADIUS/$MATCHERS/$CLIENTS"

            mkdir -p "$TEST_SCRIPT/Movement/$RADIUS/$MATCHERS/$CLIENTS"
            mkdir -p "$CLIENT_SCRIPT/Movement/$RADIUS/$MATCHERS/$CLIENTS"

            echo "Folder created. Starting entry server"

    		screen -S entryServer -d -m bash -c "./entryServerStarterUnix.sh 2999 > entryServer.txt"
            sleep 1

            echo "Entry server screen created. Creating gateway"

            screen -S VASTNode_0 -d -m bash -c "./vast_client_gateway_unix.sh $GATEWAY 37700 100 ${CLIENT_THRESHOLD[$MATCHERS]} ${SUB_THRESHOLD[$MATCHERS]} 0"
            sleep 1

            echo "Gateway created. Creating matchers"

			for ((c=1; c<=$((MATCHERS-1)); c++)) do
                echo "Creating matcher $c"
                echo "vast_client_unix.sh $GATEWAY 37700 100 undefined undefined ${CLIENT_THRESHOLD[$MATCHERS]} ${SUB_THRESHOLD[$MATCHERS]}"
                screen -S VASTNode_"$c" -d -m bash -c "./vast_client_unix.sh $GATEWAY 37700 100 undefined undefined ${CLIENT_THRESHOLD[$MATCHERS]} ${SUB_THRESHOLD[$MATCHERS]} $c"
                sleep 1
            done

            echo "Matcher creation done. Connecting clients"

            for ((d=1; d<=10; d++)) do
                echo "Creating client $d"
                ((client=$CLIENTS/10))
                echo "Clients per script: $client"
                echo "test_client_unix.sh $client 1 $d 2999 $MATCHERS $CLIENTS $RADIUS"
                screen -S Clients_"$d" -d -m bash -c " cd ../../../Pseudo\ MC\ client; ./test_client_unix.sh $client 1 $d 2999 $MATCHERS $CLIENTS $RADIUS"
                sleeptime=$(echo "$client*0.2" | bc)
                sleep $sleeptime
            done

    		echo "all clients started. waiting 1 minute until close"
    		sleep 60

    		echo "Waiting time complete. Stopping all scripts"

    		echo "All scripts stopped. Closing screens"
            screen -X -S entryServer quit
            for ((c=0; c<=$((MATCHERS-1)); c++)) do
                screen -X -S VASTNode_"$c" quit
                sleep 0.01
            done

            for ((d=1; d<=10; d++)) do
                screen -X -S Clients_"$d" quit
                sleep 0.01
            done
            sleep 1
		done
	done
done

cd "../../../Pseudo\ MC\ client"
./parser_unix.sh
