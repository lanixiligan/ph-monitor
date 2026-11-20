# PAGASA iHeatMAP fixtures

Real answers from `https://iheatmap.pagasa.dost.gov.ph/internal/api/`, saved on 2026-11-20
(about 22:55 PHT), one request each:

- `current-date.json`: `current-date` (latest forecast 2026-11-21)
- `tif-files.json`: `tif-files` (70 paths: 35 `YYYYMMDD/…_cog.tif` plus 35 `YYYYMMDD/extracted/…`)
- `presigned.json`: `presigned-tif?date=20261121&file=20261121_1200_cog.tif`. The signed link
  is short-lived, so `X-Amz-Signature` and `X-Amz-Credential` are replaced with `REDACTED`.
  Host and path are as PAGASA sent them (the path points at `…/extracted/…`).
