#!/bin/bash

startPort=%1

node entryServerStarter.js $startPort 1> entryServer.txt
