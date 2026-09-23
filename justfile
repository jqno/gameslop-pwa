# Run the logic tests (they load the game straight out of index.html)
test:
    node tools/test.mjs
    node tools/test-crowd.mjs

# Serve the app so the service worker and manifest work
serve port="8000":
    @echo "http://localhost:{{port}}/"
    python3 -m http.server {{port}}

# Redraw the app icons
icons:
    node tools/make-icons.mjs
