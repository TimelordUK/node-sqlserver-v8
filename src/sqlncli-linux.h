#pragma once

#include <sqltypes.h>
#include <sqlspi.h>
#include <sqlext.h>
#include <sql.h>

// SQLColAttributes driver specific defines.
// SQLSetDescField/SQLGetDescField driver specific defines.
// Microsoft has 1200 thru 1249 reserved for Microsoft SQL Server Native Client driver usage.
#define SQL_CA_SS_BASE                              1200
#define SQL_CA_SS_COLUMN_SSTYPE                     (SQL_CA_SS_BASE+0)   //  dbcoltype/dbalttype
#define SQL_CA_SS_COLUMN_UTYPE                      (SQL_CA_SS_BASE+1)   //  dbcolutype/dbaltutype
#define SQL_CA_SS_NUM_ORDERS                        (SQL_CA_SS_BASE+2)   //  dbnumorders
#define SQL_CA_SS_COLUMN_ORDER                      (SQL_CA_SS_BASE+3)   //  dbordercol
#define SQL_CA_SS_COLUMN_VARYLEN                    (SQL_CA_SS_BASE+4)   //  dbvarylen
#define SQL_CA_SS_NUM_COMPUTES                      (SQL_CA_SS_BASE+5)   //  dbnumcompute
#define SQL_CA_SS_COMPUTE_ID                        (SQL_CA_SS_BASE+6)   //  dbnextrow status return
#define SQL_CA_SS_COMPUTE_BYLIST                    (SQL_CA_SS_BASE+7)   //  dbbylist
#define SQL_CA_SS_COLUMN_ID                         (SQL_CA_SS_BASE+8)   //  dbaltcolid
#define SQL_CA_SS_COLUMN_OP                         (SQL_CA_SS_BASE+9)   //  dbaltop
#define SQL_CA_SS_COLUMN_SIZE                       (SQL_CA_SS_BASE+10)  //  dbcollen
#define SQL_CA_SS_COLUMN_HIDDEN                     (SQL_CA_SS_BASE+11)  //  Column is hidden (FOR BROWSE)
#define SQL_CA_SS_COLUMN_KEY                        (SQL_CA_SS_BASE+12)  //  Column is key column (FOR BROWSE)
//#define SQL_DESC_BASE_COLUMN_NAME_OLD             (SQL_CA_SS_BASE+13)  //  This is defined at another location.
#define SQL_CA_SS_COLUMN_COLLATION                  (SQL_CA_SS_BASE+14)  //  Column collation (only for chars)
#define SQL_CA_SS_VARIANT_TYPE                      (SQL_CA_SS_BASE+15)
#define SQL_CA_SS_VARIANT_SQL_TYPE                  (SQL_CA_SS_BASE+16)
#define SQL_CA_SS_VARIANT_SERVER_TYPE               (SQL_CA_SS_BASE+17)

// SQLSetStmtAttr SQL Server Native Client driver specific defines.
// Statement attributes
#define SQL_SOPT_SS_BASE                            1225
#define SQL_SOPT_SS_TEXTPTR_LOGGING                 (SQL_SOPT_SS_BASE+0) // Text pointer logging
#define SQL_SOPT_SS_CURRENT_COMMAND                 (SQL_SOPT_SS_BASE+1) // dbcurcmd SQLGetStmtOption only
#define SQL_SOPT_SS_HIDDEN_COLUMNS                  (SQL_SOPT_SS_BASE+2) // Expose FOR BROWSE hidden columns
#define SQL_SOPT_SS_NOBROWSETABLE                   (SQL_SOPT_SS_BASE+3) // Set NOBROWSETABLE option
#define SQL_SOPT_SS_REGIONALIZE                     (SQL_SOPT_SS_BASE+4) // Regionalize output character conversions
#define SQL_SOPT_SS_CURSOR_OPTIONS                  (SQL_SOPT_SS_BASE+5) // Server cursor options
#define SQL_SOPT_SS_NOCOUNT_STATUS                  (SQL_SOPT_SS_BASE+6) // Real vs. Not Real row count indicator
#define SQL_SOPT_SS_DEFER_PREPARE                   (SQL_SOPT_SS_BASE+7) // Defer prepare until necessary
#define SQL_SOPT_SS_QUERYNOTIFICATION_TIMEOUT       (SQL_SOPT_SS_BASE+8) // Notification timeout
#define SQL_SOPT_SS_QUERYNOTIFICATION_MSGTEXT       (SQL_SOPT_SS_BASE+9) // Notification message text
#define SQL_SOPT_SS_QUERYNOTIFICATION_OPTIONS       (SQL_SOPT_SS_BASE+10)// SQL service broker name
#define SQL_SOPT_SS_PARAM_FOCUS                     (SQL_SOPT_SS_BASE+11)// Direct subsequent calls to parameter related methods to set properties on constituent columns/parameters of container types
#define SQL_SOPT_SS_NAME_SCOPE                      (SQL_SOPT_SS_BASE+12)// Sets name scope for subsequent catalog function calls
#define SQL_SOPT_SS_MAX_USED                        SQL_SOPT_SS_NAME_SCOPE
// Define old names
#define SQL_TEXTPTR_LOGGING                         SQL_SOPT_SS_TEXTPTR_LOGGING
#define SQL_COPT_SS_BASE_EX                         1240
#define SQL_COPT_SS_BROWSE_CONNECT                  (SQL_COPT_SS_BASE_EX+1) // Browse connect mode of operation
#define SQL_COPT_SS_BROWSE_SERVER                   (SQL_COPT_SS_BASE_EX+2) // Single Server browse request.
#define SQL_COPT_SS_WARN_ON_CP_ERROR                (SQL_COPT_SS_BASE_EX+3) // Issues warning when data from the server had a loss during code page conversion.
#define SQL_COPT_SS_CONNECTION_DEAD                 (SQL_COPT_SS_BASE_EX+4) // dbdead SQLGetConnectOption only. It will try to ping the server. Expensive connection check
#define SQL_COPT_SS_BROWSE_CACHE_DATA               (SQL_COPT_SS_BASE_EX+5) // Determines if we should cache browse info. Used when returned buffer is greater then ODBC limit (32K)
#define SQL_COPT_SS_RESET_CONNECTION                (SQL_COPT_SS_BASE_EX+6) // When this option is set, we will perform connection reset on next packet
#define SQL_COPT_SS_APPLICATION_INTENT              (SQL_COPT_SS_BASE_EX+7) // Application Intent
#define SQL_COPT_SS_MULTISUBNET_FAILOVER            (SQL_COPT_SS_BASE_EX+8) // Multi-subnet Failover
#define SQL_COPT_SS_EX_MAX_USED                     SQL_COPT_SS_MULTISUBNET_FAILOVER
#define SQL_CA_SS_UDT_CATALOG_NAME                  (SQL_CA_SS_BASE+18) //  UDT catalog name
#define SQL_CA_SS_UDT_SCHEMA_NAME                   (SQL_CA_SS_BASE+19) //  UDT schema name
#define SQL_CA_SS_UDT_TYPE_NAME                     (SQL_CA_SS_BASE+20) //  UDT type name
#define SQL_CA_SS_UDT_ASSEMBLY_TYPE_NAME            (SQL_CA_SS_BASE+21) //  Qualified name of the assembly containing the UDT class
#define SQL_CA_SS_XML_SCHEMACOLLECTION_CATALOG_NAME (SQL_CA_SS_BASE+22) //  Name of the catalog that contains XML Schema collection
#define SQL_CA_SS_XML_SCHEMACOLLECTION_SCHEMA_NAME  (SQL_CA_SS_BASE+23) //  Name of the schema that contains XML Schema collection
#define SQL_CA_SS_XML_SCHEMACOLLECTION_NAME         (SQL_CA_SS_BASE+24) //  Name of the XML Schema collection
#define SQL_CA_SS_CATALOG_NAME                      (SQL_CA_SS_BASE+25) //  Catalog name
#define SQL_CA_SS_SCHEMA_NAME                       (SQL_CA_SS_BASE+26) //  Schema name
#define SQL_CA_SS_TYPE_NAME                         (SQL_CA_SS_BASE+27) //  Type name

// table valued parameter related metadata
#define SQL_CA_SS_COLUMN_COMPUTED                   (SQL_CA_SS_BASE+29) //  column is computed
#define SQL_CA_SS_COLUMN_IN_UNIQUE_KEY              (SQL_CA_SS_BASE+30) //  column is part of a unique key
#define SQL_CA_SS_COLUMN_SORT_ORDER                 (SQL_CA_SS_BASE+31) //  column sort order
#define SQL_CA_SS_COLUMN_SORT_ORDINAL               (SQL_CA_SS_BASE+32) //  column sort ordinal
#define SQL_CA_SS_COLUMN_HAS_DEFAULT_VALUE          (SQL_CA_SS_BASE+33) //  column has default value for all rows of the table valued parameter

// sparse column related metadata
#define SQL_CA_SS_IS_COLUMN_SET                     (SQL_CA_SS_BASE+34) //  column is a column-set column for sparse columns

// Legacy datetime related metadata
#define SQL_CA_SS_SERVER_TYPE                       (SQL_CA_SS_BASE+35) //  column type to send on the wire for datetime types

#define SQL_CA_SS_MAX_USED                          (SQL_CA_SS_BASE+36)

#define SQL_SS_VARIANT                      (-150)
#define SQL_SS_UDT                          (-151)
#define SQL_SS_XML                          (-152)
#define SQL_SS_TABLE                        (-153)
#define SQL_SS_TIME2                        (-154)
#define SQL_SS_TIMESTAMPOFFSET              (-155)

#define SQL_DIAG_SS_BASE                    (-1150)
#define SQL_DIAG_SS_MSGSTATE                (SQL_DIAG_SS_BASE)
#define SQL_DIAG_SS_SEVERITY                (SQL_DIAG_SS_BASE-1)
#define SQL_DIAG_SS_SRVNAME                 (SQL_DIAG_SS_BASE-2)
#define SQL_DIAG_SS_PROCNAME                (SQL_DIAG_SS_BASE-3)
#define SQL_DIAG_SS_LINE                    (SQL_DIAG_SS_BASE-4)

// max SQL Server identifier length
#define SQL_MAX_SQLSERVERNAME                       128

typedef SQLULEN			SQLROWSETSIZE;

// New Date Time Structures
// New Structure for TIME2
typedef struct tagSS_TIME2_STRUCT
{
        SQLUSMALLINT   hour;
        SQLUSMALLINT   minute;
        SQLUSMALLINT   second;
        SQLUINTEGER    fraction;
} SQL_SS_TIME2_STRUCT;
// New Structure for TIMESTAMPOFFSET
typedef struct tagSS_TIMESTAMPOFFSET_STRUCT
{
        SQLSMALLINT    year;
        SQLUSMALLINT   month;
        SQLUSMALLINT   day;
        SQLUSMALLINT   hour;
        SQLUSMALLINT   minute;
        SQLUSMALLINT   second;
        SQLUINTEGER    fraction;
        SQLSMALLINT    timezone_hour;
        SQLSMALLINT    timezone_minute;
} SQL_SS_TIMESTAMPOFFSET_STRUCT;
