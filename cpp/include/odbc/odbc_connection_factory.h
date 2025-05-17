#include <atomic>
#include <cstdint>
#include <iostream>

#include "id_factory.h"
#include "platform.h"

namespace mssql {
class IOdbcConnection;
class IOdbcEnvironment;

class OdbcConnectionFactory {
 public:
  static std::shared_ptr<IOdbcConnection> CreateConnection(
      std::shared_ptr<IOdbcEnvironment> environment = nullptr);

 private:
  OdbcConnectionFactory() = default;  // Prevent instantiation
  static IdFactory idFactory_;        // ID factory for generating unique IDs
};
}  // namespace mssql