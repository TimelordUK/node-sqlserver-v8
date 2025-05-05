#include "platform.h"
#include "odbc_common.h"
#include "odbc_connection.h"
#include "odbc_connection_factory.h"
#include "iodbc_api.h"
// Removed unnecessary #pragma once which should only be used in header files

namespace mssql
{
  IdFactory OdbcConnectionFactory::idFactory_;

  std::shared_ptr<IOdbcConnection> OdbcConnectionFactory::CreateConnection(
      std::shared_ptr<IOdbcEnvironment> environment)
  {
    return std::make_shared<OdbcConnection>(environment, std::make_shared<RealOdbcApi>(), idFactory_.getNextId());
  }
}