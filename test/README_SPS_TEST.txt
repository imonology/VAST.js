README_SPS_TEST

many_matcher_start.bat
------------------------
    This file runs many_matcher.js, which sets up 9 matchers in an equal square grid of x(0..1000) and y(0..1000);
    All matchers are set up under one process so that there aren't too many terminal windows open at the same time.
    It currently uses a setTimeout between connecting matchers, so wait until the console outputs 'matchers have been set up'


client_start.bat
------------------------
    This file runs client1_start, client2_start and client3_start. They should all be assigned to the same matcher (probably matcher[5])
    They subscribe to areas, wait a bit, and then publish some messages.