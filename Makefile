SHELL := /bin/bash

DIST ?= dist
MIRROR_DIR ?= build/career-data

.PHONY: build test mirror check-mirror clean

build:
	./scripts/build.sh $(DIST)

test:
	node --test tests/*.test.mjs

mirror:
	MIRROR_DIR=$(MIRROR_DIR) ./scripts/career-data.sh

check-mirror:
	MIRROR_DIR=$(MIRROR_DIR) ./scripts/check-mirror.sh

clean:
	rm -rf $(DIST)
