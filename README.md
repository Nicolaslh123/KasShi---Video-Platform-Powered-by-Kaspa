# Mocha App Export

This archive contains the code and production data exported for your Mocha app.

- App name: KasShi - Video Platform Powered by Kaspa
- App id: 019c0f5d-4b05-7157-9c49-90a9187d1eb1
- Subdomain: hbmeqpb6eoeiu
- Deployed URL: https://hbmeqpb6eoeiu.mocha.app
- Exported at: 2026-04-29T11:52:53Z

## What's In This Zip

- `.env`: the app's exported secrets. This file is sensitive and must be kept secret.
- `code/`: the app's source code as stored in Mocha.
- `d1_dump.sql`: a copy of the app's production database in SQLite / Cloudflare D1 SQL format.
- `users.json`: exported user records for the app from Mocha's authentication system.
- `public_asset_links.json`: links to the files the app is currently using from Mocha's file storage.

## Important To Know

- `.env` contains sensitive secrets. Do not commit it, share it publicly, or expose it to end users.
- The code is complete, but it is connected to parts of Mocha's platform. Because of that, it will not run out of the box in a new environment.
- The code was written to run on Mocha's Cloudflare account. Specifically, Mocha's Workers For Platforms. To run in other environments will require some engineering effort.
- The biggest dependency is sign-in and user accounts. Authentication for the app is tied to Mocha's Users Service, so moving the app will require engineering work to replace or migrate that system.
- The asset links in `public_asset_links.json` point to files currently stored in Mocha's R2 storage. They work today, but they will stop working after Mocha shuts down.
- Before Mocha shuts down, those asset files should be downloaded, uploaded somewhere new, and the app's code should be updated to use the new URLs.
- `d1_dump.sql` uses SQLite / Cloudflare D1 SQL. If you want to move to another database such as Postgres or MySQL, some parts of the SQL may need to be changed first.
- Some functionality, such as Mocha email and Mocha analytics will not work outside of Mocha's platform. If your app relies on those, you'll need to replace that functionality with other services before the app will work in a new environment.
