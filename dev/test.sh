#!/bin/bash

../gauntlet -h localhost \
	-p 49883 \
	-f ./gauntlet.json \
	-d ./tests \
	-u "http://unicity.github.io/jsondiffpatch/demo" \
	--shortener "./shortener.js"
