CREATE OR REPLACE TEMP VIEW raw_flows AS
SELECT
    CAST(i AS INTEGER) AS exporter_id,
    CAST(j AS INTEGER) AS importer_id,
    left(CAST(k AS VARCHAR), 2) AS hs2,
    left(CAST(k AS VARCHAR), 4) AS hs4,
    CAST(v AS DOUBLE) AS value_thousand_usd
FROM read_csv(
    '{csv_path}',
    header = true,
    columns = {{
        't': 'INTEGER',
        'i': 'INTEGER',
        'j': 'INTEGER',
        'k': 'VARCHAR',
        'v': 'DOUBLE',
        'q': 'DOUBLE'
    }}
);

CREATE OR REPLACE TEMP TABLE hs2_exports AS
SELECT
    exporter_id AS country_id,
    hs2,
    CAST(round(sum(value_thousand_usd) * 1000) AS BIGINT) AS exports
FROM raw_flows
GROUP BY exporter_id, hs2;

CREATE OR REPLACE TEMP TABLE hs2_bilateral_flows AS
SELECT
    exporter_id,
    importer_id,
    hs2,
    CAST(round(sum(value_thousand_usd) * 1000) AS BIGINT) AS trade_value
FROM raw_flows
GROUP BY exporter_id, importer_id, hs2;

CREATE OR REPLACE TEMP TABLE hs2_imports AS
SELECT
    importer_id AS country_id,
    hs2,
    CAST(round(sum(value_thousand_usd) * 1000) AS BIGINT) AS imports
FROM raw_flows
GROUP BY importer_id, hs2;

CREATE OR REPLACE TEMP TABLE country_product_base AS
SELECT
    coalesce(x.country_id, m.country_id) AS country_id,
    coalesce(x.hs2, m.hs2) AS hs2,
    coalesce(x.exports, 0) AS exports,
    coalesce(m.imports, 0) AS imports
FROM hs2_exports x
FULL OUTER JOIN hs2_imports m USING (country_id, hs2);

CREATE OR REPLACE TEMP TABLE country_totals AS
SELECT
    country_id,
    sum(exports)::BIGINT AS exports,
    sum(imports)::BIGINT AS imports,
    sum(exports - imports)::BIGINT AS net
FROM country_product_base
GROUP BY country_id;

CREATE OR REPLACE TEMP TABLE hs4_exports AS
SELECT
    exporter_id AS country_id,
    hs4,
    CAST(round(sum(value_thousand_usd) * 1000) AS BIGINT) AS exports
FROM raw_flows
GROUP BY exporter_id, hs4;

CREATE OR REPLACE TEMP TABLE hs4_bilateral_flows AS
SELECT
    exporter_id,
    importer_id,
    hs4,
    CAST(round(sum(value_thousand_usd) * 1000) AS BIGINT) AS trade_value
FROM raw_flows
GROUP BY exporter_id, importer_id, hs4;

CREATE OR REPLACE TEMP TABLE hs4_imports AS
SELECT
    importer_id AS country_id,
    hs4,
    CAST(round(sum(value_thousand_usd) * 1000) AS BIGINT) AS imports
FROM raw_flows
GROUP BY importer_id, hs4;

CREATE OR REPLACE TEMP TABLE hs4_country_product_base AS
SELECT
    coalesce(x.country_id, m.country_id) AS country_id,
    coalesce(x.hs4, m.hs4) AS hs4,
    coalesce(x.exports, 0) AS exports,
    coalesce(m.imports, 0) AS imports
FROM hs4_exports x
FULL OUTER JOIN hs4_imports m USING (country_id, hs4);

CREATE OR REPLACE TEMP TABLE hs4_lens_metrics AS
SELECT
    p.country_id,
    p.hs4,
    p.exports,
    CASE WHEN c.exports > 0 THEN p.exports::DOUBLE / c.exports ELSE 0 END AS export_share
FROM hs4_country_product_base p
JOIN country_totals c USING (country_id)
WHERE p.exports > 0;

CREATE OR REPLACE TEMP TABLE leading_destinations AS
WITH destinations AS (
    SELECT
        exporter_id AS country_id,
        importer_id AS destination_id,
        CAST(round(sum(value_thousand_usd) * 1000) AS BIGINT) AS exports
    FROM raw_flows
    GROUP BY exporter_id, importer_id
)
SELECT country_id, destination_id, exports
FROM destinations
QUALIFY row_number() OVER (
    PARTITION BY country_id
    ORDER BY exports DESC, destination_id
) = 1;
