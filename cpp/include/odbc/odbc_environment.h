#pragma once
#include <atomic>
#include <memory>
#include <mutex>
#include <vector>
#include <odbc/odbc_handles.h>
#include <odbc/odbc_error.h>

namespace mssql {
class IOdbcApi;
// Interface for ODBC environment functionality that can be mocked
class IOdbcEnvironment {
 public:
  virtual ~IOdbcEnvironment() = default;
  virtual bool Initialize(std::shared_ptr<IOdbcApi> odbcApiPtr) = 0;
  virtual std::shared_ptr<IOdbcEnvironmentHandle> GetEnvironmentHandle() = 0;
  virtual void ReadErrors(std::shared_ptr<IOdbcApi> odbcApiPtr,
                          std::shared_ptr<std::vector<std::shared_ptr<OdbcError>>> errors) = 0;
};

// Concrete implementation of the ODBC environment interface
class OdbcEnvironment : public IOdbcEnvironment {
 public:
  OdbcEnvironment();
  ~OdbcEnvironment() override;

  bool Initialize(std::shared_ptr<IOdbcApi> odbcApiPt) override;
  std::shared_ptr<IOdbcEnvironmentHandle> GetEnvironmentHandle() override;
  void ReadErrors(std::shared_ptr<IOdbcApi> odbcApiPtr,
                  std::shared_ptr<std::vector<std::shared_ptr<OdbcError>>> errors) override;

 private:
  std::shared_ptr<IOdbcEnvironmentHandle> environment_;
  std::atomic<bool> initialized_{false};
  std::mutex init_mutex_;
};

// Factory for creating environment instances
class OdbcEnvironmentFactory {
 public:
  static std::shared_ptr<IOdbcEnvironment> CreateEnvironment();
};

}  // namespace mssql