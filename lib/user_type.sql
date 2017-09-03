SELECT USER_NAME(TYPE.schema_id) + '.' + TYPE.name      AS "Type Name",
       COL.column_id,
       SUBSTRING(CAST(COL.column_id + 100 AS char(3)), 2, 2)  + ': ' + COL.name   AS "Column",
       ST.name                                          AS "Data Type",
       CASE COL.Is_Nullable
       WHEN 1 THEN ''
       ELSE        'NOT NULL'
       END                                              AS "Nullable",
       COL.max_length                                   AS "Length",
       COL.[precision]                                  AS "Precision",
       COL.scale                                        AS "Scale",
       ST.collation                                     AS "Collation"
FROM sys.table_types TYPE
JOIN sys.columns     COL
    ON TYPE.type_table_object_id = COL.object_id
JOIN sys.systypes AS ST
    ON ST.xtype = COL.system_type_id
where TYPE.is_user_defined = 1
ORDER BY "Type Name",
         COL.column_id