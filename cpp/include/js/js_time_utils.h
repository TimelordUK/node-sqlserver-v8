#pragma once
#include <napi.h>

#include <core/datum_storage.h>

namespace mssql {

class JsTimeUtils {
 public:
  static Napi::Value ToJsDate(Napi::Env env, const DatumStorage& datum) {
    switch (datum.getType()) {
      case DatumStorage::SqlType::Date: {
        const auto& date = datum.getValueAs<SQL_DATE_STRUCT>();
        return CreateJsDate(env, date.year, date.month - 1, date.day);
      }

      case DatumStorage::SqlType::Time: {
        const auto& time = datum.getValueAs<SQL_SS_TIME2_STRUCT>();
        return CreateJsTime(env, time.hour, time.minute, time.second, time.fraction);
      }

      case DatumStorage::SqlType::DateTime:
      case DatumStorage::SqlType::DateTime2: {
        const auto& ts = datum.getValueAs<SQL_TIMESTAMP_STRUCT>();
        return CreateJsDateTime(env, ts);
      }

      case DatumStorage::SqlType::DateTimeOffset: {
        const auto& tso = datum.getValueAs<SQL_SS_TIMESTAMPOFFSET_STRUCT>();
        return CreateJsDateTimeOffset(env, tso);
      }

      default:
        throw std::runtime_error("Invalid date/time type");
    }
  }

  static Napi::Value ToJsValue(Napi::Env env, const DatumStorage& datum) {
    // Handle conversion of any DatumStorage to appropriate JS type
    // This would be used in Result class instead of direct NAPI calls
  }
};

}  // namespace mssql