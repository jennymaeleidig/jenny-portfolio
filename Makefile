SHELL := /bin/bash

DIST ?= dist

# SKY_LEVERS=1 adds the sky's tuning panel to the build. `make dev` is the
# shorthand; production and CI run plain `make build`, which leaves it out.
export SKY_LEVERS

.PHONY: build dev test clean

build:
	./scripts/build.sh $(DIST)

dev:
	SKY_LEVERS=1 ./scripts/build.sh $(DIST)

test:
	node --test tests/*.test.mjs

clean:
	rm -rf $(DIST)
