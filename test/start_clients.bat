@REM start node new_client.js 100 100 100200 200 200 true
@REM start node new_client.js 100 100 100 200 200 200 false


@REM @REM start node new_client.js aoi=(x=10, y=15, r=100), RequestType=(pub)

start node start_GW.js

start node start_matcher.js 10 80 5
@REM start node start_matcher.js 40 50 5
@REM start node start_matcher.js 90 20 5

start node test_client.js 10 10 35 subscribe 10 10 35 
start node test_client.js 28 35 28 subscribe 28 35 28

start node test_client.js 28 35 28 publish 28 35 28

start node test_client.js 17 25 22 publish 17 25 22
start node test_client.js 17 25 22 publish 17 25 22

@REM start node test_client.js 17 25 22 publish
@REM start node test_client.js 12 9 13 publish

@REM start node test_client.js 17 0 8 publish
@REM start node test_client.js 7 18 1 publish
@REM start node test_client.js 14 6 25 publish
@REM start node test_client.js 18 22 15 publish
@REM start node test_client.js 12 22 9 publish
@REM start node test_client.js 18 10 23 publish
@REM start node test_client.js 13 11 14 publish
@REM start node test_client.js 25 8 8 publish
@REM start node test_client.js 22 6 17 publish
@REM start node test_client.js 16 23 7 publish
@REM start node test_client.js 13 9 20 publish
@REM start node test_client.js 13 5 23 publish
@REM start node test_client.js 12 7 10 publish
@REM start node test_client.js 5 16 10 publish
@REM start node test_client.js 25 15 4 publish
@REM start node test_client.js 24 2 21 publish
@REM start node test_client.js 3 8 17 publish
@REM start node test_client.js 14 19 11 publish
@REM start node test_client.js 9 10 17 publish
@REM start node test_client.js 10 10 7 publish
@REM start node test_client.js 2 14 24 publish
@REM start node test_client.js 3 8 20 publish
@REM start node test_client.js 18 0 1 publish


@REM start node test_client.js 39 29 46 subscribe
@REM start node test_client.js 46 30 45 subscribe
@REM start node test_client.js 43 37 47 subscribe
@REM start node test_client.js 38 35 50 subscribe
@REM start node test_client.js 30 29 47 subscribe
@REM start node test_client.js 26 36 46 subscribe
@REM start node test_client.js 41 44 32 subscribe
@REM start node test_client.js 45 28 41 subscribe
@REM start node test_client.js 44 43 49 subscribe
@REM start node test_client.js 35 43 30 subscribe
@REM start node test_client.js 49 50 49 subscribe
@REM start node test_client.js 34 34 29 subscribe
@REM start node test_client.js 34 36 32 subscribe
@REM start node test_client.js 38 38 30 subscribe
@REM start node test_client.js 33 42 28 subscribe
@REM start node test_client.js 41 36 26 subscribe
@REM start node test_client.js 40 39 46 subscribe
@REM start node test_client.js 40 29 50 subscribe
@REM start node test_client.js 49 36 40 subscribe
@REM start node test_client.js 39 26 32 subscribe
@REM start node test_client.js 43 48 41 subscribe
@REM start node test_client.js 47 35 31 subscribe
@REM start node test_client.js 48 42 37 subscribe