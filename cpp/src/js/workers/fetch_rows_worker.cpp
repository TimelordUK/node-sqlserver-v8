#include "platform.h"
#include "odbc_common.h"
#include "workers/fetch_rows_worker.h"
#include "js_object_mapper.h"
#include "odbc_row.h"
#include "Logger.h"

namespace mssql
{

  FetchRowsWorker::FetchRowsWorker(Napi::Function &callback,
                                   IOdbcConnection *connection,
                                   const StatementHandle &statementHandle,
                                   size_t rowCount)
      : Napi::AsyncWorker(callback),
        connection_(connection),
        statementHandle_(statementHandle),
        rowCount_(rowCount)
  {
    SQL_LOG_DEBUG_STREAM("FetchRowsWorker constructor for statement: " << statementHandle_.toString());
    result_ = std::make_shared<QueryResult>(statementHandle_);
  }

  void FetchRowsWorker::Execute()
  {

    try
    {
      SQL_LOG_DEBUG_STREAM("Executing FetchRowsWorker for statement: " << statementHandle_.toString());

      if (!statementHandle_.isValid())
      {
        SetError("Invalid statement handle");
        return;
      }

      // This is a stub implementation for now
      // In a real implementation, we would:
      // 1. Get the statement from a statement cache
      // 2. Call methods to fetch rows
      // 3. Process the result set
      const auto statement = GetStatement();
      if (!statement)
      {
        SetError("Statement not found");
        return;
      }
      statement->TryReadRows(result_, rowCount_);
      // For now, just set endOfRows_ to true to simulate end of result set
      endOfRows_ = true;
    }
    catch (const std::exception &e)
    {
      SQL_LOG_ERROR("Exception in FetchRowsWorker::Execute: " + std::string(e.what()));
      SetError("Exception occurred: " + std::string(e.what()));
    }
    catch (...)
    {
      SQL_LOG_ERROR("Unknown exception in FetchRowsWorker::Execute");
      SetError("Unknown exception occurred");
    }
  }

  void FetchRowsWorker::OnOK()
  {
    const Napi::Env env = Env();
    Napi::HandleScope scope(env);
    SQL_LOG_DEBUG("FetchRowsWorker::OnOK");

    try
    {
      // Create a JavaScript array of rows
      Napi::Array rows = Napi::Array::New(env);
      const auto &statement = GetStatement();
      auto &nativeData = statement->GetRows();
      auto &columnDefs = *statement->GetMetaData();

      // vector of iodbcrow
      for (size_t i = 0; i < nativeData.size(); ++i)
      {
        const auto &row = nativeData[i];
        Napi::Object jsRow = Napi::Object::New(env);

        // Iterate through each column in the row
        for (size_t colIdx = 0; colIdx < row->columnCount(); ++colIdx)
        {
          const auto &column = row->getColumn(colIdx);
          const auto &colDef = columnDefs.get(colIdx);
          const auto colName = StringUtils::WideToUtf8(colDef.colName, colDef.colNameLen);

          // Check for NULL
          if (column.isNull())
          {
            jsRow.Set(colName, env.Null());
            continue;
          }

          // Handle different data types based on column.getType()
          switch (column.getType())
          {
          case mssql::DatumStorage::SqlType::NChar:
          case mssql::DatumStorage::SqlType::NVarChar:
          case mssql::DatumStorage::SqlType::NText:
          {
            // Handle Unicode strings (SQLWCHAR)
            auto wcharVec = const_cast<mssql::DatumStorage &>(column).getTypedVector<uint16_t>();
            if (wcharVec && !wcharVec->empty())
            {
              jsRow.Set(colName, Napi::String::New(
                                     env,
                                     reinterpret_cast<const char16_t *>(wcharVec->data()),
                                     wcharVec->size()));
            }
            else
            {
              jsRow.Set(colName, Napi::String::New(env, ""));
            }
            break;
          }

          case mssql::DatumStorage::SqlType::Char:
          case mssql::DatumStorage::SqlType::VarChar:
          case mssql::DatumStorage::SqlType::Text:
          {
            // Handle ASCII strings
            auto charVec = const_cast<mssql::DatumStorage &>(column).getTypedVector<char>();
            if (charVec && !charVec->empty())
            {
              std::string str(charVec->data(), charVec->size());
              // Remove null terminator if present
              if (!str.empty() && str.back() == '\0')
              {
                str.pop_back();
              }
              jsRow.Set(colName, Napi::String::New(env, str));
            }
            else
            {
              jsRow.Set(colName, Napi::String::New(env, ""));
            }
            break;
          }

          // Add cases for other types as needed:
          case mssql::DatumStorage::SqlType::Integer:
          {
            auto intVec = const_cast<mssql::DatumStorage &>(column).getTypedVector<int32_t>();
            if (intVec && !intVec->empty())
            {
              jsRow.Set(colName, Napi::Number::New(env, (*intVec)[0]));
            }
            break;
          }

          case mssql::DatumStorage::SqlType::BigInt:
          {
            auto bigintVec = const_cast<mssql::DatumStorage &>(column).getTypedVector<int64_t>();
            if (bigintVec && !bigintVec->empty())
            {
              // For BigInt, depending on the value, you might need to use BigInt in JS
              // For now, we'll use Number, but be cautious about precision loss
              jsRow.Set(colName, Napi::Number::New(env, static_cast<double>((*bigintVec)[0])));
            }
            break;
          }

          case mssql::DatumStorage::SqlType::Double:
          case mssql::DatumStorage::SqlType::Float:
          case mssql::DatumStorage::SqlType::Real:
          {
            auto doubleVec = const_cast<mssql::DatumStorage &>(column).getTypedVector<double>();
            if (doubleVec && !doubleVec->empty())
            {
              jsRow.Set(colName, Napi::Number::New(env, (*doubleVec)[0]));
            }
            break;
          }

          case mssql::DatumStorage::SqlType::Bit:
          {
            auto bitVec = const_cast<mssql::DatumStorage &>(column).getTypedVector<int8_t>();
            if (bitVec && !bitVec->empty())
            {
              jsRow.Set(colName, Napi::Boolean::New(env, (*bitVec)[0] != 0));
            }
            break;
          }

            // Add more cases for other types

          default:
            // For unsupported types, convert to string representation
            jsRow.Set(colName, Napi::String::New(env, "[Unsupported type]"));
            break;
          }
        }

        rows.Set(i, jsRow);
      }

      // Create a result object
      Napi::Object result = Napi::Object::New(env);
      result.Set("rows", rows);
      result.Set("endOfRows", Napi::Boolean::New(env, endOfRows_));

      // Call the callback with the result
      Callback().Call({env.Null(), result});
    }
    catch (const std::exception &e)
    {
      // Call the callback with an error
      Callback().Call({Napi::Error::New(env, e.what()).Value(), env.Null()});
    }
  }

  void FetchRowsWorker::OnError(const Napi::Error &error)
  {
    const Napi::Env env = Env();
    Napi::HandleScope scope(env);

    // Create a detailed error object with ODBC specifics
    Napi::Object errorObj = Napi::Object::New(env);
    errorObj.Set("message", error.Message());

    if (!errorDetails_.empty())
    {
      // Add SQLSTATE and native error code from the first error
      errorObj.Set("sqlState", Napi::String::New(env, errorDetails_[0]->sqlstate));
      errorObj.Set("code", Napi::Number::New(env, errorDetails_[0]->code));

      // Add all errors as an array of details
      Napi::Array details = Napi::Array::New(env);
      for (size_t i = 0; i < errorDetails_.size(); i++)
      {
        const auto &err = errorDetails_[i];
        Napi::Object detail = Napi::Object::New(env);
        detail.Set("sqlState", Napi::String::New(env, err->sqlstate));
        detail.Set("message", Napi::String::New(env, err->message));
        detail.Set("code", Napi::Number::New(env, err->code));
        details.Set(i, detail);
      }
      errorObj.Set("details", details);
    }

    // Call the callback with the enhanced error object and null result
    Callback().Call({errorObj, env.Null()});
  }

} // namespace mssql