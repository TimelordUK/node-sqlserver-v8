#include "platform.h"
#include <atomic>
#include <cstdint>
#include <iostream>

namespace mssql
{
  class IdFactory
  {
  private:
    std::atomic<int> next_id{0};

  public:
    // Get the next available ID
    int getNextId()
    {
      return next_id.fetch_add(1, std::memory_order_relaxed);
    }

    // Reset the counter (if needed)
    void reset()
    {
      next_id.store(0, std::memory_order_relaxed);
    }

    // Singleton pattern (optional)
    static IdFactory &getInstance()
    {
      static IdFactory instance;
      return instance;
    }
  };
}