.PHONY: dev test deploy data

node_modules: package.json
	npm install
	@touch node_modules

PORT ?= 8787

dev: node_modules
	npx wrangler dev --port $(PORT)

test:
	node --test

deploy: node_modules test
	npx wrangler deploy

data:
	node scripts/build-data.mjs
