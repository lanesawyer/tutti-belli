#!/bin/bash
# Secrets (database, storage, JWT) are Fly secrets read at runtime; nothing is passed to the build.
fly deploy
