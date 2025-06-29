#pragma once

#include <js/workers/odbc_async_worker.h>
#include <odbc/parameter_set.h>
#include <odbc/odbc_state_notifier.h>
#include <js/js_state_notifier.h>

namespace mssql {
class BoundDatumSet;

class QueryWorker : public OdbcAsyncWorker {
 public:
  QueryWorker(Napi::Function& callback,
              IOdbcConnection* connection,
              const std::shared_ptr<QueryOperationParams> q,
              const Napi::Array& params,
              Napi::Function stateChangeCallback = Napi::Function());

  void Execute() override;
  void OnOK() override;

 private:
  std::shared_ptr<QueryOperationParams> queryParams_;
  std::shared_ptr<BoundDatumSet> parameters_;
  bool has_error_ = false;
  std::shared_ptr<IOdbcStateNotifier> stateNotifier_;
};
}  // namespace mssql