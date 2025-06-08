#include <odbc/odbc_error_handler.h>
#include <odbc/connection_handles.h>
#include <odbc/odbc_environment.h>
#include <odbc/odbc_error.h>

namespace mssql {

OdbcErrorHandler::OdbcErrorHandler(std::shared_ptr<ConnectionHandles> connectionHandles,
                                   std::shared_ptr<IOdbcEnvironment> environment,
                                   std::shared_ptr<IOdbcApi> odbcApiPtr)
    : _connectionHandles(connectionHandles), _environment(environment), _odbcApi(odbcApiPtr) {
  _errors = std::make_shared<std::vector<std::shared_ptr<OdbcError>>>();
}

bool OdbcErrorHandler::CheckOdbcError(const SQLRETURN ret) {
  if (!SQL_SUCCEEDED(ret)) {
    return ReturnOdbcError();
  }
  return true;
}

bool OdbcErrorHandler::ReturnOdbcError() {
  _errors->clear();

  if (_connectionHandles) {
    const auto connection = _connectionHandles->connectionHandle();
    if (connection) {
      connection->read_errors(_odbcApi, _errors);
    }
    if (_errors->empty()) {
      _environment->ReadErrors(_odbcApi, _errors);
    }
  }

  return false;
}

bool OdbcErrorHandler::HasErrors() const {
  return !_errors->empty();
}

const std::vector<std::shared_ptr<OdbcError>>& OdbcErrorHandler::GetErrors() const {
  return *_errors;
}

void OdbcErrorHandler::ClearErrors() {
  _errors->clear();
}

}  // namespace mssql