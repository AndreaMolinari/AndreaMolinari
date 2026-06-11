# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is the GitHub profile repository for `AndreaMolinari` (`github.com/AndreaMolinari/AndreaMolinari`). It has a single purpose: auto-generating and committing `github-metrics.svg` to display on the GitHub profile page.

## How it works

`.github/workflows/metrics.yml` runs daily (plus on push to `main` and manually via `workflow_dispatch`) using the [`lowlighter/metrics`](https://github.com/lowlighter/metrics) action. It generates `github-metrics.svg` and commits it back with the message `Update github-metrics.svg - [Skip GitHub Action]`.

The `METRICS_TOKEN` secret (a GitHub PAT) must be set in the repository secrets for the workflow to authenticate.

## Customization

All configuration lives in `.github/workflows/metrics.yml` under the `with:` block. The enabled plugins are:

- `plugin_achievements` — compact display, threshold B
- `plugin_fortune` — random dev fortune
- `plugin_habits` — last 14 days, classic charts
- `plugin_introduction` — profile intro with title
- `plugin_isocalendar` — full-year contribution calendar
- `plugin_languages` — top 8 languages by bytes, recent 14 days

To add or remove plugins, edit the `with:` block and push to `main` — the workflow will regenerate the SVG.
