#pragma once

#include <memory>
#include "odbc_handles.h"

namespace mssql
{
  class IOdbcStatementHandle;

  class OdbcStatementFactory
  {
  public:
    static std::shared_ptr<IOdbcStatementHandle> createStatement();
  };

} // namespace mssql