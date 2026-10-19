# Source publication gate. Runtime build instructions remain in each engine.
verify:
    python3 scripts/verify-publication.py

push *ARGS: verify
    git push {{ ARGS }}
