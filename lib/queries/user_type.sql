	SELECT USER_NAME(TYPE.schema_id) + '.' + TYPE.name      AS type_name,
       COL.column_id,
       SUBSTRING(CAST(COL.column_id + 100 AS char(3)), 2, 2)  + ': ' + COL.name   AS ordered_column,
	   COL.name                                         AS column_name,
       ST.name                                          AS data_type,
       ST.name                                          AS type_id,
       ST.name                                          AS declaration,
       CASE COL.Is_Nullable
       WHEN 1 THEN ''
       ELSE        'NOT NULL'
       END                                              AS nullable,
       COL.max_length                                   AS length,
       COL.[precision]                                  AS precision,
       COL.scale                                        AS scale,
       ST.collation                                     AS collation,
       0                                                As is_output,
	   COL.system_type_id,
	   COL.column_id

FROM sys.table_types TYPE
JOIN sys.columns     COL
    ON TYPE.type_table_object_id = COL.object_id
JOIN sys.systypes AS ST
ON  ST.xtype = COL.system_type_id  and st.xusertype=col.user_type_id
where
	TYPE.is_user_defined = 1
	and type.name = '<user_type_name>'

ORDER BY type_name,
         COL.column_id
