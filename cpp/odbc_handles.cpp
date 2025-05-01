#include "odbc_error.h"
#include "odbc_handles.h"

namespace mssql
{
  // Define the factory implementations with default lambdas
  EnvironmentHandleFactory create_environment_handle = []()
  {
    return std::make_shared<OdbcEnvironmentHandleImpl>();
  };

  ConnectionHandleFactory create_connection_handle = []()
  {
    return std::make_shared<OdbcConnectionHandleImpl>();
  };

  StatementHandleFactory create_statement_handle = []()
  {
    return std::make_shared<OdbcStatementHandleImpl>();
  };

  DescriptorHandleFactory create_descriptor_handle = []()
  {
    return std::make_shared<OdbcDescriptorHandleImpl>();
  };
}