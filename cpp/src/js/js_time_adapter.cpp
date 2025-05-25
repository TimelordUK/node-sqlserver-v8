#include <platform.h>
#include <common/odbc_common.h>
#include <js/js_time_adapter.h>

#include <platform.h>
#include <sql.h>
#include <sqlext.h>

#include <core/datum_storage.h>
#include <js/napi_wrapper.h>
#include <common/time_utils.h>

namespace mssql {

bool JSTimeAdapter::bindJsDateToDateStorage(Napi::Env env,
                                            Napi::Value jsDate,
                                            DatumStorage& storage,
                                            int32_t offset) {
  if (storage.getType() != DatumStorage::SqlType::Date) {
    storage.setType(DatumStorage::SqlType::Date);
  }

  double milliseconds;
  // Use the wrapper instead of direct N-API call
  napi_status status = NapiWrapper::GetDateValueImpl(env, jsDate, &milliseconds);
  if (status != napi_ok) {
    return false;
  }

  SQL_DATE_STRUCT date = TimeUtils::createDateStruct(milliseconds, offset);
  storage.addValue(date);
  return true;
}

// Bind a JavaScript Date to a TIME type in DatumStorage
bool JSTimeAdapter::bindJsDateToTimeStorage(Napi::Env env,
                                            Napi::Value jsDate,
                                            DatumStorage& storage,
                                            int32_t offset) {
  if (storage.getType() != DatumStorage::SqlType::Time) {
    storage.setType(DatumStorage::SqlType::Time);
  }

  double milliseconds;
  napi_status status = napi_get_date_value(env, jsDate, &milliseconds);
  if (status != napi_ok) {
    return false;
  }

  SQL_SS_TIME2_STRUCT time = TimeUtils::createTimeStruct(milliseconds, offset);
  storage.addValue(time);
  return true;
}

// Bind a JavaScript Date to a TIMESTAMP type in DatumStorage
bool JSTimeAdapter::bindJsDateToTimestampStorage(Napi::Env env,
                                                 Napi::Value jsDate,
                                                 DatumStorage& storage,
                                                 int32_t offset) {
  if (storage.getType() != DatumStorage::SqlType::DateTime &&
      storage.getType() != DatumStorage::SqlType::DateTime2) {
    storage.setType(DatumStorage::SqlType::DateTime2);
  }

  double milliseconds;
  napi_status status = napi_get_date_value(env, jsDate, &milliseconds);
  if (status != napi_ok) {
    return false;
  }

  SQL_TIMESTAMP_STRUCT timestamp = TimeUtils::createTimestampStruct(milliseconds, offset);
  storage.addValue<SQL_TIMESTAMP_STRUCT>(timestamp);
  return true;
}

// Bind a JavaScript Date to a TIMESTAMPOFFSET type in DatumStorage
bool JSTimeAdapter::bindJsDateToTimestampOffsetStorage(Napi::Env env,
                                                       Napi::Value jsDate,
                                                       DatumStorage& storage,
                                                       int32_t offset) {
  if (storage.getType() != DatumStorage::SqlType::DateTimeOffset) {
    storage.setType(DatumStorage::SqlType::DateTimeOffset);
  }

  double milliseconds;
  napi_status status = napi_get_date_value(env, jsDate, &milliseconds);
  if (status != napi_ok) {
    return false;
  }

  SQL_SS_TIMESTAMPOFFSET_STRUCT timestampOffset;
  TimeUtils::createTimestampOffsetStruct(milliseconds, 0, offset, timestampOffset);
  storage.addValue<SQL_SS_TIMESTAMPOFFSET_STRUCT>(timestampOffset);
  return true;
}

// Implementation for the new date conversion functions

Napi::Value JSTimeAdapter::createJsDateFromDate(Napi::Env env, const SQL_DATE_STRUCT& date) {
  struct tm timeinfo = {};
  timeinfo.tm_year = date.year - 1900;  // tm_year is years since 1900
  timeinfo.tm_mon = date.month - 1;     // tm_mon is 0-based
  timeinfo.tm_mday = date.day;
  timeinfo.tm_hour = 0;
  timeinfo.tm_min = 0;
  timeinfo.tm_sec = 0;

  // Convert to time_t (seconds since epoch)
  time_t rawtime = mktime(&timeinfo);

  // Convert to milliseconds
  double ms = static_cast<double>(rawtime) * 1000.0;

  return Napi::Date::New(env, ms);
}

Napi::Value JSTimeAdapter::createJsDateFromTime(Napi::Env env, const SQL_SS_TIME2_STRUCT& time) {
  // Create a date representing today with this time
  time_t now = std::time(nullptr);
  struct tm* tm_now = std::localtime(&now);
  tm_now->tm_hour = time.hour;
  tm_now->tm_min = time.minute;
  tm_now->tm_sec = time.second;

  // Convert to time_t (seconds since epoch)
  time_t time_with_today = mktime(tm_now);

  // Convert to milliseconds and add the fraction part
  double ms = static_cast<double>(time_with_today) * 1000.0 +
              static_cast<double>(time.fraction) / 1000000.0;

  return Napi::Date::New(env, ms);
}

Napi::Value JSTimeAdapter::createJsDateFromTimestamp(Napi::Env env,
                                                     const SQL_TIMESTAMP_STRUCT& timestamp) {
  struct tm timeinfo = {};
  timeinfo.tm_year = timestamp.year - 1900;  // tm_year is years since 1900
  timeinfo.tm_mon = timestamp.month - 1;     // tm_mon is 0-based
  timeinfo.tm_mday = timestamp.day;
  timeinfo.tm_hour = timestamp.hour;
  timeinfo.tm_min = timestamp.minute;
  timeinfo.tm_sec = timestamp.second;

  // Convert to time_t (seconds since epoch)
  time_t rawtime = mktime(&timeinfo);

  // Convert to milliseconds and add the fraction part
  double ms =
      static_cast<double>(rawtime) * 1000.0 + static_cast<double>(timestamp.fraction) / 1000000.0;

  return Napi::Date::New(env, ms);
}

Napi::Value JSTimeAdapter::createJsDateFromTimestampOffset(
    Napi::Env env, const SQL_SS_TIMESTAMPOFFSET_STRUCT& offset) {
  struct tm timeinfo = {};
  timeinfo.tm_year = offset.year - 1900;
  timeinfo.tm_mon = offset.month - 1;
  timeinfo.tm_mday = offset.day;
  timeinfo.tm_hour = offset.hour;
  timeinfo.tm_min = offset.minute;
  timeinfo.tm_sec = offset.second;

  // Apply the timezone offset in the opposite direction to get UTC
  timeinfo.tm_hour -= offset.timezone_hour;
  timeinfo.tm_min -= offset.timezone_minute;

  // Convert to UTC time_t
#ifdef _WIN32
  time_t rawtime = _mkgmtime(&timeinfo);
#else
  timeinfo.tm_isdst = 0;  // No DST for UTC time
  time_t rawtime = timegm(&timeinfo);
#endif

  // Convert to milliseconds and add the fraction part
  double ms =
      static_cast<double>(rawtime) * 1000.0 + static_cast<double>(offset.fraction) / 1000000.0;

  return Napi::Date::New(env, ms);
}

}  // namespace mssql