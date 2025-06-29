WITH t_name_cte(id, full_name, table_name) AS
(SELECT  TOP (1)
	0 AS id,
	TABLE_CATALOG + '..' + TABLE_NAME AS full_name,
	TABLE_NAME
	FROM
		<table_catalog>.INFORMATION_SCHEMA.COLUMNS sc
		inner join <table_catalog>.sys.objects so
		on so.name = sc.TABLE_NAME
  	WHERE object_id = OBJECT_ID('<table_catalog>.<table_schema>.<table_name>')
    ),
    primary_keys AS
    (SELECT COLUMN_NAME,
    TABLE_NAME,
    1 AS is_primary_key
FROM
        <table_catalog>.INFORMATION_SCHEMA.KEY_COLUMN_USAGE sk
    join <table_catalog>.sys.objects so
on sk.CONSTRAINT_NAME = so.name
WHERE so.type = 'PK'),
    foreign_keys AS
    (SELECT COLUMN_NAME,
    TABLE_NAME,
    1 AS is_foreign_key
FROM <table_catalog>.INFORMATION_SCHEMA.KEY_COLUMN_USAGE sk
    join <table_catalog>.sys.objects so
on sk.CONSTRAINT_NAME = so.name
WHERE so.type = 'F')
SELECT
  distinct
  sc.ordinal_position,
  sc.table_catalog,
	sc.table_schema,
	sc.table_name,
  sc.column_default,
  c.name name,
  t.Name type,
  c.max_length,
  c.precision,
  c.scale,
  c.is_nullable,
  c.is_computed,
  c.is_identity,
  c.object_id,
  0 as generated_always_type,
  'NOT_APPLICABLE' as generated_always_type_desc,
  0 as is_hidden,
    COALESCE(pk.is_primary_key, 0) AS is_primary_key,
    COALESCE(fk.is_foreign_key, 0) AS is_foreign_key
FROM <table_catalog>.INFORMATION_SCHEMA.TABLES st
  INNER JOIN <table_catalog>.INFORMATION_SCHEMA.COLUMNS sc
    ON sc.TABLE_CATALOG = st.TABLE_CATALOG
       AND sc.TABLE_SCHEMA = st.TABLE_SCHEMA
       AND sc.TABLE_NAME = st.TABLE_NAME
  LEFT JOIN <table_catalog>.INFORMATION_SCHEMA.KEY_COLUMN_USAGE u
    ON sc.TABLE_CATALOG = u.TABLE_CATALOG
       AND sc.TABLE_SCHEMA = u.TABLE_SCHEMA
       AND sc.TABLE_NAME = u.TABLE_NAME
       AND sc.COLUMN_NAME = u.COLUMN_NAME
    LEFT JOIN primary_keys pk
    ON sc.COLUMN_NAME = pk.COLUMN_NAME
    AND sc.TABLE_NAME = pk.TABLE_NAME
    LEFT JOIN foreign_keys fk
    ON sc.COLUMN_NAME = fk.COLUMN_NAME
    AND sc.TABLE_NAME = fk.TABLE_NAME
  cross join t_name_cte r
  INNER JOIN 
  <table_catalog>.sys.columns c ON c.name = sc.column_name
  INNER JOIN
  <table_catalog>.sys.types t ON c.user_type_id = t.user_type_id
  INNER JOIN
  <table_catalog>.sys.tables ta ON ta.name = r.table_name
  LEFT OUTER JOIN
  <table_catalog>.sys.index_columns ic ON ic.object_id = c.object_id AND ic.column_id = c.column_id
  LEFT OUTER JOIN
  <table_catalog>.sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
WHERE
  c.object_id = ta.object_id
  AND TABLE_TYPE = 'BASE TABLE'
  AND sc.TABLE_NAME = r.table_name
  AND (sc.TABLE_SCHEMA = '<table_schema>' or '<table_schema>' = '')
  AND (ta.schema_id = SCHEMA_ID('<table_schema>') or '<table_schema>' = '')
  
