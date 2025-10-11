# The Heist – Web Client

Collision authoring (no Tiled)
- Place your background at `client/assets/images/map_base_8192.png` (8192x8192).
- Add collisions via either:
  - `client/assets/maps/collision.svg` with <rect> shapes aligned to the background; or
  - `client/assets/maps/collision.json` using `{ rects: [{ x,y,w,h }, ...] }` in world pixels (0–8192).

Run locally
- Server: `node server/index.js`, open `http://localhost:3000/game.html`.
- Debug overlay: add `?debug=1` to the URL; press F3 to see collision boxes, F4 for player hitbox.
