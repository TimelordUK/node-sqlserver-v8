
#pragma once

#include "platform.h"
#include <common/odbc_common.h>
#include <vector>
#include <set>
#include <memory>
#include <functional> // For std::function

namespace mssql
{

  class ConnectionHandles
  {
  public:
    ConnectionHandles(std::shared_ptr<IOdbcEnvironmentHandle> env)
        : envHandle_(env),
          connectionHandle_(create_connection_handle())
    {
      connectionHandle_->alloc(env->get_handle());
    }

    ~ConnectionHandles()
    {
      clear();
    }

    void clear()
    {
      if (connectionHandle_)
      {
        connectionHandle_->free();
      }
    }

    // Return the interface pointer
    std::shared_ptr<IOdbcConnectionHandle> connectionHandle()
    {
      return connectionHandle_;
    }

  private:
    std::shared_ptr<IOdbcEnvironmentHandle> envHandle_;
    std::shared_ptr<IOdbcConnectionHandle> connectionHandle_;
  };
}