#pragma once
#include <memory>
#include <vector>
#include "odbc/odbc_handles.h"
#include "odbc/odbc_error.h"

namespace mssql {
class IOdbcApi;
class IOdbcEnvironment;

class OdbcErrorHandler {
 public:
  explicit OdbcErrorHandler(std::shared_ptr<ConnectionHandles> connectionHandles,
                            std::shared_ptr<IOdbcEnvironment> environment,
                            std::shared_ptr<IOdbcApi> odbcApiPtr);
  virtual ~OdbcErrorHandler() = default;

  virtual bool CheckOdbcError(SQLRETURN ret);
  virtual bool ReturnOdbcError();
  virtual const std::vector<std::shared_ptr<OdbcError>>& GetErrors() const;
  virtual bool HasErrors() const;
  virtual void ClearErrors();
  virtual void AddError(std::shared_ptr<OdbcError> error) {
    _errors->push_back(error);
  }

 private:
  std::shared_ptr<ConnectionHandles> _connectionHandles;
  std::shared_ptr<IOdbcEnvironment> _environment;
  std::shared_ptr<IOdbcApi> _odbcApi;
  std::shared_ptr<std::vector<std::shared_ptr<OdbcError>>> _errors;
};

}  // namespace mssql