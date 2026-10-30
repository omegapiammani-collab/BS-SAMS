CREATE INDEX people_name_page ON people(deleted_at, (json_extract(data,'$.first') || ' ' || json_extract(data,'$.last')), id);
CREATE INDEX people_village_page ON people(deleted_at, village, (json_extract(data,'$.first') || ' ' || json_extract(data,'$.last')), id);
