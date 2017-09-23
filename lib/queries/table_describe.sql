SELECT
	sc.table_catalog,
	sc.table_schema,
	sc.table_name,
  c.name name,
  t.Name type,
  c.max_length,
  c.precision,
  c.scale,
  c.is_nullable,
  c.is_computed,
  c.is_identity,
  c.object_id,

  CASE
  WHEN CONSTRAINT_NAME IN (SELECT NAME
                           FROM <table_catalog>.sys.objects
                           WHERE TYPE = 'PK')
    THEN 1
  ELSE 0
  END AS is_primary_key,
  CASE
  WHEN CONSTRAINT_NAME IN (SELECT NAME
                           FROM <table_catalog>.sys.objects
                           WHERE TYPE = 'F')
    THEN 1
  ELSE 0
  END AS is_foreign_key
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
  INNER JOIN 
  <table_catalog>.sys.columns c ON c.name = sc.column_name
  INNER JOIN
  <table_catalog>.sys.types t ON c.user_type_id = t.user_type_id
  LEFT OUTER JOIN
  <table_catalog>.sys.index_columns ic ON ic.object_id = c.object_id AND ic.column_id = c.column_id
  LEFT OUTER JOIN
  <table_catalog>.sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
WHERE
   c.object_id = OBJECT_ID('<escaped_table_name>')
  AND TABLE_TYPE = 'BASE TABLE'
  AND sc.TABLE_NAME = '<table_name>'
  AND (sc.TABLE_SCHEMA = '<table_schema>' or '<table_schema>' = '')
  