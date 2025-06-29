#pragma once

#include <js/workers/odbc_async_worker.h>
#include <odbc/parameter_set.h>
#include <odbc/odbc_state_notifier.h>
#include <js/js_state_notifier.h>

namespace mssql {
class BoundDatumSet;

class BindQueryWorker : public OdbcAsyncWorker {
 public:
  BindQueryWorker(Napi::Function& callback,
                  IOdbcConnection* connection,
                  const int queryId,
                  const Napi::Array& params);

  void Execute() override;
  void OnOK() override;

 private:
  int queryId_;
  std::shared_ptr<BoundDatumSet> parameters_;
  bool has_error_ = false;
};
}  // namespace mssql