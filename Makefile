SHELL := /bin/bash

DIST ?= dist

.PHONY: build test clean

build:
	./scripts/build.sh $(DIST)

test:
	node --test tests/*.test.mjs

clean:
	rm -rf $(DIST)
