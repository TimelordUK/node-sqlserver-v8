#pragma once

#include <js/workers/odbc_async_worker.h>
#include <odbc/parameter_set.h>

namespace mssql {
class QueryWorker : public OdbcAsyncWorker {
 public:
  QueryWorker(Napi::Function& callback,
              IOdbcConnection* connection,
              const std::u16string& sqlText,
              const Napi::Array& params);

  void Execute() override;
  void OnOK() override;

 private:
  std::u16string sqlText_;
  std::shared_ptr<ParameterSet> parameters_;
};
}  // namespace mssql