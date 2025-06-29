#include <odbc/odbc_environment.h>

#include <utils/Logger.h>

namespace mssql {

OdbcEnvironment::OdbcEnvironment() : environment_(create_environment_handle()) {
  // Environment handle is created but not allocated yet
}

OdbcEnvironment::~OdbcEnvironment() {
  // The environment handle will be freed automatically through shared_ptr
}

bool OdbcEnvironment::Initialize(std::shared_ptr<IOdbcApi> odbcApiPtr) {
  // Quick check without lock
  if (initialized_.load()) {
    SQL_LOG_DEBUG("ODBC environment already initialized");
    return true;
  }

  // Thread-safe initialization
  std::lock_guard<std::mutex> lock(init_mutex_);
  
  // Double-check pattern
  if (initialized_.load()) {
    SQL_LOG_DEBUG("ODBC environment already initialized (double-check)");
    return true;
  }

  SQL_LOG_INFO("Initializing ODBC environment");

  // Set up connection pooling - using nullptr directly as it's a global attribute
  auto ret = odbcApiPtr->SQLSetEnvAttr(
      nullptr, SQL_ATTR_CONNECTION_POOLING, reinterpret_cast<SQLPOINTER>(SQL_CP_ONE_PER_HENV), 0);
  if (!SQL_SUCCEEDED(ret)) {
    SQL_LOG_ERROR("Failed to set connection pooling attribute");
    return false;
  }

  // Allocate environment handle
  if (!environment_->alloc()) {
    SQL_LOG_ERROR("Failed to allocate environment handle");
    return false;
  }

  // Set ODBC version - using the handle through the interface's get_handle() method
  ret = odbcApiPtr->SQLSetEnvAttr(environment_->get_handle(),
                                  SQL_ATTR_ODBC_VERSION,
                                  reinterpret_cast<SQLPOINTER>(SQL_OV_ODBC3),
                                  0);
  if (!SQL_SUCCEEDED(ret)) {
    SQL_LOG_ERROR("Failed to set ODBC version");
    return false;
  }

  // Set connection pooling match
  ret = odbcApiPtr->SQLSetEnvAttr(environment_->get_handle(),
                                  SQL_ATTR_CP_MATCH,
                                  reinterpret_cast<SQLPOINTER>(SQL_CP_RELAXED_MATCH),
                                  0);
  if (!SQL_SUCCEEDED(ret)) {
    SQL_LOG_ERROR("Failed to set connection pooling match");
    return false;
  }

  initialized_.store(true);
  SQL_LOG_INFO("ODBC environment successfully initialized");
  return true;
}

std::shared_ptr<IOdbcEnvironmentHandle> OdbcEnvironment::GetEnvironmentHandle() {
  return environment_;
}

void OdbcEnvironment::ReadErrors(std::shared_ptr<IOdbcApi> odbcApiPtr,
                                 std::shared_ptr<std::vector<std::shared_ptr<OdbcError>>> errors) {
  if (environment_) {
    environment_->read_errors(odbcApiPtr, errors);
  }
}

// Factory implementation
std::shared_ptr<IOdbcEnvironment> OdbcEnvironmentFactory::CreateEnvironment() {
  return std::make_shared<OdbcEnvironment>();
}

}  // namespace mssql