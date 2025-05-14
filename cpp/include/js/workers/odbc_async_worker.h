#pragma once

#include <napi.h>
#include "common/odbc_common.h"
#include "core/query_result.h"
#include "odbc/odbc_connection.h"

namespace mssql
{
  class OdbcAsyncWorker : public Napi::AsyncWorker
  {
  public:
    OdbcAsyncWorker(Napi::Function &callback, IOdbcConnection *connection)
        : Napi::AsyncWorker(callback), connection_(connection)
    {
      result_ = std::make_shared<QueryResult>();
    }

    virtual ~OdbcAsyncWorker() = default;

  protected:
    IOdbcConnection *connection_;
    std::shared_ptr<QueryResult> result_;
    std::vector<std::shared_ptr<OdbcError>> errorDetails_;

    void OnError(const Napi::Error &error) override;

    Napi::Object GetMetadata();

    // Pure virtual method that derived classes must implement
    virtual void Execute() = 0;

    // Common implementation of OnOK that can be overridden if needed
    virtual void OnOK() = 0;

    // Common implementation of OnError that can be overridden if needed
  };
} // namespace mssql