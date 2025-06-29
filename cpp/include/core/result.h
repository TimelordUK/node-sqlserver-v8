#pragma once

#include <memory>
#include <vector>
#include <core/column_buffer.h>
#include <core/query_result.h>
#include <platform.h>
#include <utils/Logger.h>
#include <core/datum_storage.h>
#include "js/js_time_utils.h"

namespace mssql {

class Result {
 public:
  void addTypedRow(const std::vector<std::shared_ptr<DatumStorage>>& row) {
    Napi::Env env = env_;
    Napi::Array jsRow = Napi::Array::New(env, row.size());

    for (size_t i = 0; i < row.size(); i++) {
      const auto& datum = row[i];
      switch (datum->getType()) {
        case DatumStorage::SqlType::Bit:
          jsRow[i] = Napi::Boolean::New(env, datum->getBool());
          break;

        case DatumStorage::SqlType::TinyInt:
        case DatumStorage::SqlType::SmallInt:
        case DatumStorage::SqlType::Integer:
          jsRow[i] = Napi::Number::New(env, datum->getInt32());
          break;

        case DatumStorage::SqlType::BigInt:
          jsRow[i] = Napi::BigInt::New(env, datum->getInt64());
          break;

        case DatumStorage::SqlType::Float:
        case DatumStorage::SqlType::Real:
        case DatumStorage::SqlType::Double:
          jsRow[i] = Napi::Number::New(env, datum->getDouble());
          break;

        case DatumStorage::SqlType::Date:
        case DatumStorage::SqlType::Time:
        case DatumStorage::SqlType::DateTime:
        case DatumStorage::SqlType::DateTime2:
        case DatumStorage::SqlType::DateTimeOffset:
          // Convert SQL date/time to JavaScript Date object
          jsRow[i] = datum->toJsDate(env);
          break;

        case DatumStorage::SqlType::Decimal:
        case DatumStorage::SqlType::Numeric:
          // For high-precision numbers, might want to use string
          // to preserve exact decimal places
          jsRow[i] = datum->toJsNumber(env);
          break;

        case DatumStorage::SqlType::VarChar:
        case DatumStorage::SqlType::NVarChar:
        case DatumStorage::SqlType::Text:
        case DatumStorage::SqlType::NText:
          jsRow[i] = Napi::String::New(env, datum->getString());
          break;

        case DatumStorage::SqlType::Binary:
        case DatumStorage::SqlType::VarBinary:
          // Convert to Node Buffer for binary data
          jsRow[i] = datum->toJsBuffer(env);
          break;

        case DatumStorage::SqlType::Null:
          jsRow[i] = env.Null();
          break;

        default:
          SQL_LOG_WARNING_STREAM("Unknown SQL type: " << static_cast<int>(datum->getType())
                                                      << " - converting to string");
          jsRow[i] = Napi::String::New(env, datum->toString());
      }
    }

    rows_.push_back(std::move(jsRow));
  }

  void addTypedRow(const std::vector<std::shared_ptr<DatumStorage>>& rowData) {
    Napi::Array jsRow = Napi::Array::New(env_, rowData.size());

    for (size_t i = 0; i < rowData.size(); i++) {
      jsRow[i] = JsTimeUtils::ToJsValue(env_, *rowData[i]);
    }

    rows_.push_back(std::move(jsRow));
  }

 private:
  Napi::Env env_;
  std::vector<Napi::Array> rows_;
  std::vector<std::vector<std::shared_ptr<DatumStorage>>> rows_;
};
}  // namespace mssql