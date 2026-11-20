# PAGASA iHeatMAP fixtures

Real answers from `https://iheatmap.pagasa.dost.gov.ph/internal/api/`, saved on 2026-11-20
(about 22:55 PHT), one request each:

- `current-date.json`: `current-date` (latest forecast 2026-11-21)
- `tif-files.json`: `tif-files` (70 paths: 35 `YYYYMMDD/…_cog.tif` plus 35 `YYYYMMDD/extracted/…`)
- `presigned.json`: `presigned-tif?date=20261121&file=20261121_1200_cog.tif`. The signed link
  is short-lived, so `X-Amz-Signature` and `X-Amz-Credential` are replaced with `REDACTED`.
  Host and path are as PAGASA sent them (the path points at `…/extracted/…`).
- `20261121_1200_cog.tif`: one real forecast file (2026-11-21 12:00 PHT, 147 KB), downloaded
  on 2026-11-20 (about 22:58 PHT) with `fetchPagasaFile`, from the S3 bucket
  `iheatmap.s3.ap-southeast-1.amazonaws.com`. PAGASA's link for the plain file name points at
  the `20261121/extracted/…` copy, so this is the `extracted/` copy.
