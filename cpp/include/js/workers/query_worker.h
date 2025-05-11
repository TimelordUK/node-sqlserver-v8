#pragma once
#include <napi.h>
#include <memory>
#include <string>
#include "odbc_connection.h"
#include "parameter_set.h"
#include "query_result.h"
#include "js_object_mapper.h"

namespace mssql
{

  /**
   * @brief Worker for executing queries asynchronously
   */
  class QueryWorker : public Napi::AsyncWorker
  {
  public:
    QueryWorker(Napi::Function &callback,
                IOdbcConnection *connection,
                const std::string &sqlText,
                const Napi::Array &params);

    void Execute() override;
    void OnOK() override;

  private:
    IOdbcConnection *connection_;
    std::u16string sqlText_;
    std::shared_ptr<ParameterSet> parameters_;
    std::shared_ptr<QueryResult> result_;
  };

} // namespace mssql