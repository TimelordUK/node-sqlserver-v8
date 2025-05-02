#pragma once
#include <memory>
#include <vector>
#include "odbc_handles.h"
#include "odbc_error.h"

namespace mssql
{

  class OdbcErrorHandler
  {
  public:
    explicit OdbcErrorHandler(std::shared_ptr<ConnectionHandles> connectionHandles);

    bool CheckOdbcError(SQLRETURN ret);
    bool ReturnOdbcError();
    const std::vector<std::shared_ptr<OdbcError>> &GetErrors() const;
    void ClearErrors();

  private:
    std::shared_ptr<ConnectionHandles> _connectionHandles;
    std::shared_ptr<std::vector<std::shared_ptr<OdbcError>>> _errors;
  };

} // namespace mssql