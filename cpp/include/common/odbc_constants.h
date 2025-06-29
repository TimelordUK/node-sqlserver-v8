#pragma once

namespace mssql
{
  namespace OdbcConstants
  {
    // Buffer sizes
    static const size_t MSSQL_MAX_SERVER_NAME = 128;
    static const size_t MSSQL_MAX_ERROR_MSG = 1024;
    static const size_t MSSQL_MAX_COLUMN_NAME = 256;

    // SQL Server defaults
    static const int MSSQL_DEFAULT_YEAR = 1900;
    static const int MSSQL_DEFAULT_MONTH = 1; // JS months are 0 based, SQL Server months are 1 based
    static const int MSSQL_DEFAULT_DAY = 1;
    static const int MSSQL_JS_EPOCH_YEAR = 1970;
  }
} // namespace mssql