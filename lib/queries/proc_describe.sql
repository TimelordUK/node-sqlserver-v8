with proc_exist_cte(object_id, proc_name, type_desc) as
(
	SELECT object_id, name as proc_name, type_desc  
		FROM sys.objects WHERE type = 'P' AND object_id = object_id('<schema_name>.<escaped_procedure_name>')
), 
proc_params_cte(object_id,has_default_value,default_value,is_output,[name],type_id,max_length,[order],collation,is_user_defined) as
( 
select
	object_id,
    has_default_value,
    default_value,
    is_output,
    sp.name,
    type_id   = type_name(sp.user_type_id),
    sp.max_length,
    'order'  = parameter_id,
    'collation'   = convert(sysname,
        case
            when sp.system_type_id in (35, 99, 167, 175, 231, 239)
                then ServerProperty('collation') end),
    ty.is_user_defined
 from
	sys.parameters sp
	left outer join sys.table_types ty
	    on ty.name=type_name(sp.user_type_id)
		and ty.schema_id = schema_id('<schema_name>')
	where
	    object_id = object_id('<schema_name>.<escaped_procedure_name>')
) select 
	r.proc_name, r.type_desc, 
    p.* 
        from proc_exist_cte r
	outer apply 
    proc_params_cte p
