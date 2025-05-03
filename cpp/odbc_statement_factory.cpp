#include "odbc_statement_factory.h"
#include "odbc_handles.h"
#include "odbc_error.h"

namespace mssql
{
  std::shared_ptr<IOdbcStatementHandle> OdbcStatementFactory::createStatement()
  {
    return std::make_shared<OdbcStatementHandleImpl>();
  }
} // namespace mssql