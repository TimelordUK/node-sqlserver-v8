// In query_parameter.cpp
#include <platform.h>
#include "query_parameter.h"
#include <Logger.h>

namespace mssql
{
  // QueryParameter implementation

  QueryParameter::QueryParameter(int index, std::shared_ptr<DatumStorage> storage)
      : index_(index),
        param_type_(SQL_PARAM_INPUT),
        param_size_(0),
        decimal_digits_(0),
        storage_(storage)
  {
    if (!storage_)
    {
      throw std::invalid_argument("DatumStorage cannot be null");
    }
  }

  SQLRETURN QueryParameter::bind(SQLHSTMT hstmt)
  {
    if (!storage_)
    {
      SQL_LOG_ERROR("No storage available for parameter binding");
      return SQL_ERROR;
    }

    // Get the SQL type and C type from storage

    // Get the parameter size and buffer
    param_size_ = storage_->size();
    void *buffer = storage_->getBuffer();

    // Resize indicators vector if needed (for array binding)
    indicators_.resize(1);
    indicators_[0] = storage_->getIndicator();

    // Bind the parameter
    return SQLBindParameter(
        hstmt,             // Statement handle
        index_,            // Parameter number
        param_type_,       // Input/Output type
        c_type,            // C data type
        sql_type,          // SQL data type
        param_size_,       // Column size
        decimal_digits_,   // Decimal digits
        buffer,            // Parameter value ptr
        0,                 // Buffer length
        indicators_.data() // Str len or Ind ptr
    );
  }
}