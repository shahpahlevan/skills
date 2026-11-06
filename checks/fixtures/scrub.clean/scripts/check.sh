#!/bin/sh
# A shell bracket class is not a wikilink.
sed -e "s/^[[:space:]]*//" "$1" | grep -v "^[[:digit:]]"
