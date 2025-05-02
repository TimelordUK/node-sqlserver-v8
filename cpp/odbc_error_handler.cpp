#include "odbc_error_handler.h"
#include <Logger.h>

namespace mssql
{

  OdbcErrorHandler::OdbcErrorHandler(std::shared_ptr<ConnectionHandles> connectionHandles)
      : _connectionHandles(connectionHandles)
  {
    _errors = std::make_shared<std::vector<std::shared_ptr<OdbcError>>>();
  }

  bool OdbcErrorHandler::CheckOdbcError(const SQLRETURN ret)
  {
    if (!SQL_SUCCEEDED(ret))
    {
      return ReturnOdbcError();
    }
    return true;
  }

  bool OdbcErrorHandler::ReturnOdbcError()
  {
    _errors->clear();

    if (_connectionHandles)
    {
      const auto connection = _connectionHandles->connectionHandle();
      if (connection)
      {
        connection->read_errors(_errors);
      }
    }

    return false;
  }

  const std::vector<std::shared_ptr<OdbcError>> &OdbcErrorHandler::GetErrors() const
  {
    return *_errors;
  }

  void OdbcErrorHandler::ClearErrors()
  {
    _errors->clear();
  }

} // namespace mssql