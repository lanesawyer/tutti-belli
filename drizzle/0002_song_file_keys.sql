-- SongFile.url held full Backblaze B2 URLs (https://<host>/<bucket>/<key>); it now holds just
-- the object key in the Tigris bucket. Strip the scheme, host, and bucket from uploaded files.
-- Links keep their external URL. The old B2 objects were not copied to Tigris, so these rows
-- download as 404 until the file is uploaded again.
UPDATE `SongFile`
SET `url` = substr(
  substr(substr(`url`, 9), instr(substr(`url`, 9), '/') + 1),
  instr(substr(substr(`url`, 9), instr(substr(`url`, 9), '/') + 1), '/') + 1
)
WHERE `category` != 'link' AND `url` LIKE 'https://%/%/%';
